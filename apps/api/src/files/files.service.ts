import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  AdminScope,
  AuditSensitivity,
  FileKind,
  FileScanStatus,
  type OrderFile,
  UserRole,
} from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import {
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { basename, extname, join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { matchesDeclaredMime } from './file-signature';
import { AuditService } from '../audit/audit.service';
import { AntivirusService, type ScanResult } from './antivirus.service';

export const UPLOAD_ROOT = join(process.cwd(), 'storage', 'uploads');
export const QUARANTINE_ROOT = join(process.cwd(), 'storage', 'quarantine');

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'text/csv',
]);

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

export function isAllowedMimeType(mimeType: string) {
  return ALLOWED_MIME_TYPES.has(mimeType);
}

export function canAssignedExecutorReadFile(
  fileKind: FileKind,
  isCustomerVisibleAttachment: boolean,
) {
  return (
    fileKind === FileKind.input ||
    (fileKind === FileKind.message_attachment && isCustomerVisibleAttachment)
  );
}

const MIME_EXTENSIONS: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'application/zip': ['.zip'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    '.docx',
  ],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
    '.xlsx',
  ],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': [
    '.pptx',
  ],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
};

/**
 * سیاست امنیت فایل سند v4 §۱۵.۲: whitelist نوع فایل، محدودیت حجم،
 * ذخیره با UUID و Signed URL. در توسعه، mock فایل را clean می‌کند؛ هر driver
 * دیگر فایل را در quarantine و وضعیت pending نگه می‌دارد تا اسکنر واقعی آن را
 * تعیین تکلیف کند. Startup محیط production استفاده از mock را ممنوع می‌کند.
 */
@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly antivirus: AntivirusService,
  ) {
    if (!existsSync(UPLOAD_ROOT)) {
      mkdirSync(UPLOAD_ROOT, { recursive: true });
    }
    if (!existsSync(QUARANTINE_ROOT)) {
      mkdirSync(QUARANTINE_ROOT, { recursive: true });
    }
  }

  async saveUploadedFile(params: {
    orderId: string;
    uploadedByUserId: string;
    fileKind: FileKind;
    file: Express.Multer.File;
  }) {
    if (!params.file) {
      throw new BadRequestException('فایلی ارسال نشده است.');
    }
    if (!isAllowedMimeType(params.file.mimetype)) {
      throw new BadRequestException('نوع فایل مجاز نیست.');
    }
    const extension = extname(params.file.originalname).toLowerCase();
    if (!MIME_EXTENSIONS[params.file.mimetype]?.includes(extension)) {
      throw new BadRequestException(
        'پسوند فایل با نوع اعلام‌شده مطابقت ندارد.',
      );
    }
    if (params.file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('حجم فایل بیش از حد مجاز است.');
    }
    if (!matchesDeclaredMime(params.file.buffer, params.file.mimetype)) {
      throw new BadRequestException(
        'محتوای واقعی فایل با نوع اعلام‌شده مطابقت ندارد.',
      );
    }

    const order = await this.prisma.order.findUnique({
      where: { id: params.orderId },
      include: { assignments: { include: { executorProfile: true } } },
    });
    if (!order) throw new NotFoundException('سفارش یافت نشد.');

    const uploader = await this.prisma.user.findUnique({
      where: { id: params.uploadedByUserId },
    });
    const isCustomer = order.customerId === params.uploadedByUserId;
    const isAssignedExecutor = order.assignments.some(
      (a) =>
        a.unassignedAt === null &&
        a.executorProfile.userId === params.uploadedByUserId,
    );
    const hasRelatedTicket =
      uploader?.role === UserRole.support &&
      (await this.prisma.ticket.count({ where: { orderId: order.id } })) > 0;
    const isStaff = uploader?.role === UserRole.admin || hasRelatedTicket;

    if (!isCustomer && !isAssignedExecutor && !isStaff) {
      throw new ForbiddenException(
        'اجازه آپلود فایل برای این سفارش را ندارید.',
      );
    }

    const allowedKindsByRole: Partial<Record<UserRole, FileKind[]>> = {
      [UserRole.customer]: [
        FileKind.input,
        FileKind.message_attachment,
        FileKind.ticket_attachment,
      ],
      [UserRole.executor]: [
        FileKind.output,
        FileKind.revision,
        FileKind.report,
        FileKind.message_attachment,
      ],
      [UserRole.support]: [FileKind.ticket_attachment],
      [UserRole.admin]: Object.values(FileKind),
    };
    if (
      !uploader ||
      !allowedKindsByRole[uploader.role]?.includes(params.fileKind)
    ) {
      throw new ForbiddenException('نوع فایل برای نقش شما مجاز نیست.');
    }

    const storageKey = randomUUID();
    const checksum = createHash('sha256')
      .update(params.file.buffer)
      .digest('hex');
    const quarantinePath = join(QUARANTINE_ROOT, storageKey);
    writeFileSync(quarantinePath, params.file.buffer, { flag: 'wx' });

    let scanResult: ScanResult;
    try {
      scanResult = await this.antivirus.scan(params.file.buffer);
    } catch (error) {
      if (existsSync(quarantinePath)) unlinkSync(quarantinePath);
      throw error;
    }
    const scanStatus =
      scanResult.status === 'clean'
        ? FileScanStatus.clean
        : FileScanStatus.infected;
    if (scanResult.status === 'clean') {
      renameSync(quarantinePath, join(UPLOAD_ROOT, storageKey));
    }

    const fileData = {
      orderId: params.orderId,
      uploadedByUserId: params.uploadedByUserId,
      fileKind: params.fileKind,
      storageKey,
      originalName: [...basename(params.file.originalname)]
        .filter((character) => {
          const codePoint = character.codePointAt(0) ?? 0;
          return codePoint >= 32 && codePoint !== 127;
        })
        .join(''),
      mimeType: params.file.mimetype,
      sizeBytes: params.file.size,
      checksum,
      scanStatus,
    };

    let file: OrderFile;
    try {
      file =
        scanResult.status === 'infected'
          ? await this.prisma.$transaction(async (tx) => {
              const infectedFile = await tx.orderFile.create({
                data: fileData,
              });
              await tx.auditLog.create({
                data: {
                  actorUserId: params.uploadedByUserId,
                  actorRole: uploader.role,
                  action: 'file.malware_detected',
                  entityType: 'order_file',
                  entityId: infectedFile.id,
                  sensitivity: AuditSensitivity.critical,
                  after: { signature: scanResult.signature, storageKey },
                },
              });
              return infectedFile;
            })
          : await this.prisma.orderFile.create({ data: fileData });
    } catch (error) {
      const storedPath =
        scanStatus === FileScanStatus.clean
          ? join(UPLOAD_ROOT, storageKey)
          : quarantinePath;
      if (existsSync(storedPath)) unlinkSync(storedPath);
      throw error;
    }

    if (scanResult.status === 'infected') {
      throw new BadRequestException('فایل به‌دلیل محتوای ناامن پذیرفته نشد.');
    }
    return file;
  }

  private async assertCanAccess(fileId: string, user: AuthenticatedUser) {
    const file = await this.prisma.orderFile.findUnique({
      where: { id: fileId },
      include: {
        order: {
          include: {
            assignments: { include: { executorProfile: true } },
            reports: { select: { fileId: true, visibleToCustomer: true } },
            messages: {
              where: {
                attachmentFileId: fileId,
                visibility: 'customer_visible',
              },
              select: { id: true },
            },
          },
        },
      },
    });
    if (!file) throw new NotFoundException('فایل یافت نشد.');

    const isOwner = file.uploadedByUserId === user.id;
    const isCustomer =
      file.order.customerId === user.id &&
      (file.fileKind === FileKind.output ||
        file.fileKind === FileKind.revision ||
        file.fileKind === FileKind.invoice ||
        file.order.reports.some(
          (report) => report.fileId === file.id && report.visibleToCustomer,
        ));
    const isAssignedExecutor = file.order.assignments.some(
      (a) => a.unassignedAt === null && a.executorProfile.userId === user.id,
    );
    const executorCanRead =
      isAssignedExecutor &&
      canAssignedExecutorReadFile(
        file.fileKind,
        file.order.messages.length > 0,
      );
    const isOpsAdmin =
      user.role === UserRole.admin &&
      (user.adminScope === AdminScope.super_admin ||
        user.adminScope === AdminScope.ops_admin);
    const isFinanceInvoice =
      user.role === UserRole.admin &&
      user.adminScope === AdminScope.finance_admin &&
      file.fileKind === FileKind.invoice;
    const isRelatedSupport =
      user.role === UserRole.support &&
      (await this.prisma.ticket.count({
        where: { orderId: file.orderId },
      })) > 0;

    if (
      !isOwner &&
      !isCustomer &&
      !executorCanRead &&
      !isOpsAdmin &&
      !isFinanceInvoice &&
      !isRelatedSupport
    ) {
      throw new ForbiddenException('دسترسی به این فایل ندارید.');
    }

    return file;
  }

  async createSignedUrl(fileId: string, user: AuthenticatedUser) {
    const file = await this.assertCanAccess(fileId, user);
    if (file.scanStatus !== 'clean') {
      throw new ForbiddenException('فایل هنوز از بررسی امنیتی عبور نکرده است.');
    }
    const jti = randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const token = await this.jwt.signAsync(
      {
        fileId,
        sub: user.id,
        role: user.role,
        typ: 'file-download',
        jti,
      },
      {
        secret: this.downloadTokenSecret(),
        audience: 'niazat-file-download',
        issuer: 'niazat-api',
        algorithm: 'HS256',
        expiresIn: '5m',
      },
    );
    await this.prisma.signedUrlGrant.create({
      data: {
        fileId,
        userId: user.id,
        tokenHash: createHash('sha256').update(jti).digest('hex'),
        expiresAt,
      },
    });
    await this.audit.record({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'file.signed_url_created',
      entityType: 'order_file',
      entityId: file.id,
      sensitivity: 'sensitive',
    });
    return { url: `/v1/files/download?token=${token}`, expiresInSeconds: 300 };
  }

  async resolveSignedToken(token: string, ipAddress?: string) {
    try {
      const payload = await this.jwt.verifyAsync<{
        fileId: string;
        sub: string;
        typ: string;
        role: UserRole;
        jti: string;
      }>(token, {
        secret: this.downloadTokenSecret(),
        audience: 'niazat-file-download',
        issuer: 'niazat-api',
        algorithms: ['HS256'],
      });
      if (payload.typ !== 'file-download') {
        throw new ForbiddenException('نوع توکن دانلود نامعتبر است.');
      }
      const tokenHash = createHash('sha256').update(payload.jti).digest('hex');
      const grant = await this.prisma.signedUrlGrant.findUnique({
        where: { tokenHash },
      });
      if (
        !grant ||
        grant.userId !== payload.sub ||
        grant.fileId !== payload.fileId ||
        grant.revokedAt ||
        grant.usedAt ||
        grant.expiresAt < new Date()
      ) {
        throw new ForbiddenException('مجوز دانلود منقضی یا لغو شده است.');
      }
      const file = await this.prisma.orderFile.findUnique({
        where: { id: payload.fileId },
      });
      if (!file) throw new NotFoundException('فایل یافت نشد.');
      if (file.scanStatus !== 'clean') {
        throw new ForbiddenException('فایل برای دانلود امن نیست.');
      }
      if (!existsSync(join(UPLOAD_ROOT, file.storageKey))) {
        throw new NotFoundException('محتوای فایل یافت نشد.');
      }
      await this.audit.record({
        actorUserId: payload.sub,
        actorRole: payload.role,
        action: 'file.download',
        entityType: 'order_file',
        entityId: file.id,
        sensitivity: 'sensitive',
        ipAddress,
      });
      await this.prisma.signedUrlGrant.update({
        where: { id: grant.id },
        data: { usedAt: new Date() },
      });
      return file;
    } catch {
      throw new ForbiddenException('لینک دانلود منقضی یا نامعتبر است.');
    }
  }

  async deleteFile(fileId: string) {
    const file = await this.prisma.orderFile.findUnique({
      where: { id: fileId },
    });
    if (!file) return;
    const path = join(UPLOAD_ROOT, file.storageKey);
    if (existsSync(path)) unlinkSync(path);
    await this.prisma.orderFile.delete({ where: { id: fileId } });
  }

  private downloadTokenSecret(): string {
    const secret = this.config.get<string>('DOWNLOAD_TOKEN_SECRET');
    if (secret) return secret;
    if (this.config.get('NODE_ENV') === 'production') {
      throw new Error('DOWNLOAD_TOKEN_SECRET is required in production.');
    }
    const accessSecret = this.config.get<string>('JWT_ACCESS_SECRET');
    if (!accessSecret) throw new Error('JWT_ACCESS_SECRET is required.');
    return createHash('sha256')
      .update(`${accessSecret}:file-download`)
      .digest('hex');
  }
}
