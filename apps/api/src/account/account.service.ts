import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  AuditSensitivity,
  CustomerAccountType,
  Prisma,
  PrivacyRequestStatus,
  PrivacyRequestType,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import type {
  RequestAccountDeletionDto,
  UpdateCustomerProfileDto,
} from './dto/account.dto';

const PROFILE_SELECT = {
  accountType: true,
  nationalId: true,
  companyName: true,
  companyNationalId: true,
  companyRegistrationNumber: true,
  economicCode: true,
  billingRecipientName: true,
  invoiceEmail: true,
  province: true,
  city: true,
  addressLine: true,
  postalCode: true,
  marketingConsent: true,
  analyticsConsent: true,
  privacyPolicyAcceptedAt: true,
  updatedAt: true,
} satisfies Prisma.CustomerProfileSelect;

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        fullName: true,
        phone: true,
        email: true,
        createdAt: true,
        customerProfile: { select: PROFILE_SELECT },
      },
    });
    const profile =
      user.customerProfile ??
      (await this.prisma.customerProfile.upsert({
        where: { userId },
        create: { userId },
        update: {},
        select: PROFILE_SELECT,
      }));
    return this.profileResponse(user, profile);
  }

  async updateProfile(
    user: AuthenticatedUser,
    dto: UpdateCustomerProfileDto,
    ipAddress?: string,
  ) {
    const { email, ...data } = this.normalize(dto);
    if (
      data.accountType === CustomerAccountType.company &&
      (!data.companyName || !data.companyNationalId)
    ) {
      throw new BadRequestException(
        'برای حساب حقوقی، نام و شناسه ملی شرکت الزامی است.',
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const before = await tx.user.findUniqueOrThrow({
          where: { id: user.id },
          select: {
            fullName: true,
            email: true,
            customerProfile: { select: PROFILE_SELECT },
          },
        });
        const updatedUser = await tx.user.update({
          where: { id: user.id },
          data: { fullName: dto.fullName.trim(), email },
          select: {
            fullName: true,
            phone: true,
            email: true,
            createdAt: true,
          },
        });
        const profile = await tx.customerProfile.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            ...data,
            privacyPolicyAcceptedAt: new Date(),
          },
          update: data,
          select: PROFILE_SELECT,
        });
        await this.audit.record(
          {
            actorUserId: user.id,
            actorRole: user.role,
            action: 'customer.profile_updated',
            entityType: 'customer_profile',
            entityId: user.id,
            before: this.auditShape(before),
            after: this.auditShape({
              ...updatedUser,
              customerProfile: profile,
            }),
            sensitivity: AuditSensitivity.sensitive,
            ipAddress,
          },
          tx,
        );
        return this.profileResponse(updatedUser, profile);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'این ایمیل قبلاً برای حساب دیگری ثبت شده است.',
        );
      }
      throw error;
    }
  }

  async exportData(user: AuthenticatedUser, ipAddress?: string) {
    const [account, orders, tickets, invoices, notifications] =
      await Promise.all([
        this.prisma.user.findUniqueOrThrow({
          where: { id: user.id },
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
            role: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            customerProfile: { select: PROFILE_SELECT },
            notificationPreference: {
              select: {
                inAppEnabled: true,
                emailEnabled: true,
                smsEnabled: true,
              },
            },
          },
        }),
        this.prisma.order.findMany({
          where: { customerId: user.id },
          select: {
            id: true,
            code: true,
            title: true,
            briefDescription: true,
            status: true,
            finalPrice: true,
            createdAt: true,
            updatedAt: true,
            files: {
              select: {
                id: true,
                originalName: true,
                fileKind: true,
                createdAt: true,
              },
            },
            reports: {
              where: { visibleToCustomer: true },
              select: {
                reportType: true,
                version: true,
                summary: true,
                createdAt: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.ticket.findMany({
          where: { customerId: user.id },
          select: {
            id: true,
            code: true,
            subject: true,
            category: true,
            status: true,
            createdAt: true,
            messages: {
              where: { visibility: 'customer_visible' },
              select: { body: true, createdAt: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.invoice.findMany({
          where: { customerId: user.id },
          select: {
            invoiceNumber: true,
            amount: true,
            issuedAt: true,
            billingSnapshot: true,
          },
          orderBy: { issuedAt: 'desc' },
        }),
        this.prisma.notificationLog.findMany({
          where: { userId: user.id, channel: 'in_app' },
          select: {
            eventType: true,
            title: true,
            body: true,
            readAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

    const request = await this.prisma.privacyRequest.create({
      data: {
        userId: user.id,
        requestType: PrivacyRequestType.data_export,
        status: PrivacyRequestStatus.completed,
        completedAt: new Date(),
      },
    });
    await this.audit.record({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'privacy.data_exported',
      entityType: 'privacy_request',
      entityId: request.id,
      sensitivity: AuditSensitivity.critical,
      ipAddress,
    });
    return {
      exportVersion: 1,
      generatedAt: new Date(),
      account,
      orders,
      tickets,
      invoices,
      notifications,
    };
  }

  listPrivacyRequests(userId: string) {
    return this.prisma.privacyRequest.findMany({
      where: { userId },
      select: {
        id: true,
        requestType: true,
        status: true,
        reason: true,
        requestedAt: true,
        completedAt: true,
        decisionNote: true,
      },
      orderBy: { requestedAt: 'desc' },
      take: 20,
    });
  }

  async requestDeletion(
    user: AuthenticatedUser,
    dto: RequestAccountDeletionDto,
    ipAddress?: string,
  ) {
    const existing = await this.prisma.privacyRequest.findFirst({
      where: {
        userId: user.id,
        requestType: PrivacyRequestType.account_deletion,
        status: PrivacyRequestStatus.pending,
      },
    });
    if (existing) return existing;

    const request = await this.prisma.privacyRequest.create({
      data: {
        userId: user.id,
        requestType: PrivacyRequestType.account_deletion,
        reason: this.nullable(dto.reason),
      },
    });
    await this.audit.record({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'privacy.account_deletion_requested',
      entityType: 'privacy_request',
      entityId: request.id,
      after: { status: request.status },
      sensitivity: AuditSensitivity.critical,
      ipAddress,
    });
    return request;
  }

  private normalize(dto: UpdateCustomerProfileDto) {
    return {
      accountType: dto.accountType,
      email: this.nullable(dto.email),
      nationalId: this.nullable(dto.nationalId),
      companyName: this.nullable(dto.companyName),
      companyNationalId: this.nullable(dto.companyNationalId),
      companyRegistrationNumber: this.nullable(dto.companyRegistrationNumber),
      economicCode: this.nullable(dto.economicCode),
      billingRecipientName: this.nullable(dto.billingRecipientName),
      invoiceEmail: this.nullable(dto.invoiceEmail),
      province: this.nullable(dto.province),
      city: this.nullable(dto.city),
      addressLine: this.nullable(dto.addressLine),
      postalCode: this.nullable(dto.postalCode),
      marketingConsent: dto.marketingConsent,
      analyticsConsent: dto.analyticsConsent,
    };
  }

  private nullable(value?: string) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private profileResponse(
    user: {
      fullName: string;
      phone: string;
      email: string | null;
      createdAt: Date;
    },
    profile: Prisma.CustomerProfileGetPayload<{
      select: typeof PROFILE_SELECT;
    }>,
  ) {
    const required =
      profile.accountType === CustomerAccountType.company
        ? [
            user.fullName,
            user.email,
            profile.companyName,
            profile.companyNationalId,
          ]
        : [user.fullName, user.email, profile.nationalId];
    const billing = [
      profile.billingRecipientName,
      profile.invoiceEmail,
      profile.province,
      profile.city,
      profile.addressLine,
      profile.postalCode,
    ];
    const values = [...required, ...billing];
    return {
      ...user,
      ...profile,
      completionPercent: Math.round(
        (values.filter(Boolean).length / values.length) * 100,
      ),
    };
  }

  private auditShape(value: {
    fullName: string;
    email: string | null;
    customerProfile: unknown;
  }): Prisma.InputJsonObject {
    return {
      fullName: value.fullName,
      email: value.email,
      customerProfile: value.customerProfile ?? null,
    };
  }
}
