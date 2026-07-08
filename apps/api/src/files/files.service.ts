import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { FileKind } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';

export const UPLOAD_ROOT = join(process.cwd(), 'storage', 'uploads');

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

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

/**
 * سیاست امنیت فایل سند v4 §۱۵.۲: whitelist نوع فایل، محدودیت حجم،
 * ذخیره با UUID، Signed URL. اسکن ویروس واقعی در این نوبت پیاده‌سازی نشده
 * (fileScanStatus='skipped')؛ hook آماده برای اتصال به ClamAV/سرویس ابری در
 * فاز بعد باقی می‌ماند (docs/ROADMAP.md).
 */
@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    if (!existsSync(UPLOAD_ROOT)) {
      mkdirSync(UPLOAD_ROOT, { recursive: true });
    }
  }

  async saveUploadedFile(params: {
    orderId: string;
    uploadedByUserId: string;
    fileKind: FileKind;
    file: Express.Multer.File;
  }) {
    if (!ALLOWED_MIME_TYPES.has(params.file.mimetype)) {
      throw new BadRequestException('نوع فایل مجاز نیست.');
    }
    if (params.file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('حجم فایل بیش از حد مجاز است.');
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
    const isStaff = uploader?.role === 'admin' || uploader?.role === 'support';

    if (!isCustomer && !isAssignedExecutor && !isStaff) {
      throw new ForbiddenException(
        'اجازه آپلود فایل برای این سفارش را ندارید.',
      );
    }

    const storageKey = randomUUID();
    const checksum = createHash('sha256')
      .update(params.file.buffer)
      .digest('hex');
    writeFileSync(join(UPLOAD_ROOT, storageKey), params.file.buffer);

    return this.prisma.orderFile.create({
      data: {
        orderId: params.orderId,
        uploadedByUserId: params.uploadedByUserId,
        fileKind: params.fileKind,
        storageKey,
        originalName: params.file.originalname,
        mimeType: params.file.mimetype,
        sizeBytes: params.file.size,
        checksum,
        scanStatus: 'skipped',
      },
    });
  }

  private async assertCanAccess(fileId: string, userId: string) {
    const file = await this.prisma.orderFile.findUnique({
      where: { id: fileId },
      include: {
        order: {
          include: { assignments: { include: { executorProfile: true } } },
        },
      },
    });
    if (!file) throw new NotFoundException('فایل یافت نشد.');

    const isOwner = file.uploadedByUserId === userId;
    const isCustomer = file.order.customerId === userId;
    const isAssignedExecutor = file.order.assignments.some(
      (a) => a.unassignedAt === null && a.executorProfile.userId === userId,
    );

    if (!isOwner && !isCustomer && !isAssignedExecutor) {
      throw new ForbiddenException('دسترسی به این فایل ندارید.');
    }

    return file;
  }

  async createSignedUrl(fileId: string, userId: string) {
    await this.assertCanAccess(fileId, userId);
    const token = await this.jwt.signAsync(
      { fileId, sub: userId },
      { secret: this.config.get('JWT_ACCESS_SECRET'), expiresIn: '5m' },
    );
    return { url: `/v1/files/download?token=${token}`, expiresInSeconds: 300 };
  }

  async resolveSignedToken(token: string) {
    try {
      const payload = await this.jwt.verifyAsync<{
        fileId: string;
        sub: string;
      }>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET'),
      });
      const file = await this.prisma.orderFile.findUnique({
        where: { id: payload.fileId },
      });
      if (!file) throw new NotFoundException('فایل یافت نشد.');
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
}
