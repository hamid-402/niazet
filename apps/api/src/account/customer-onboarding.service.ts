import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CustomerOnboardingState, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  customerIntakeEnabled,
  requireCustomerIntake,
} from './customer-intake-config';
import {
  ONBOARDING_PURPOSES,
  SaveCustomerOnboardingDto,
} from './dto/onboarding.dto';

@Injectable()
export class CustomerOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}
  private view(row: CustomerOnboardingState | null) {
    return {
      enabled: true,
      schemaVersion: 1,
      revision: row?.revision ?? 0,
      completed: !!row,
      state: !row ? 'pending' : row.skipped ? 'skipped' : 'completed',
      skipped: row?.skipped ?? false,
      purpose: row?.purpose ?? null,
    };
  }
  async read(userId: string) {
    if (!customerIntakeEnabled(this.config))
      return { enabled: false, state: 'unavailable' };
    return this.view(
      await this.prisma.customerOnboardingState.findUnique({
        where: { userId },
      }),
    );
  }
  async save(userId: string, dto: SaveCustomerOnboardingDto) {
    requireCustomerIntake(this.config);
    if (
      dto.schemaVersion !== 1 ||
      !Number.isSafeInteger(dto.expectedRevision) ||
      dto.expectedRevision < 0 ||
      dto.expectedRevision > 2147483646 ||
      typeof dto.skipped !== 'boolean' ||
      (dto.skipped
        ? dto.purpose != null
        : !ONBOARDING_PURPOSES.includes(
            dto.purpose as (typeof ONBOARDING_PURPOSES)[number],
          ))
    )
      throw new BadRequestException('انتخاب شروع استفاده معتبر نیست.');
    const purpose = dto.skipped ? null : dto.purpose!;
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const old = await tx.customerOnboardingState.findUnique({
            where: { userId },
          });
          const same =
            old && old.purpose === purpose && old.skipped === dto.skipped;
          if (
            same &&
            (old.revision === dto.expectedRevision ||
              old.revision === dto.expectedRevision + 1)
          )
            return this.view(old);
          if ((old?.revision ?? 0) !== dto.expectedRevision)
            throw new ConflictException(
              'انتخاب شما هم‌زمان تغییر کرده است؛ وضعیت را دوباره بخوانید.',
            );
          let row: CustomerOnboardingState;
          if (!old)
            row = await tx.customerOnboardingState.create({
              data: { userId, purpose, skipped: dto.skipped },
            });
          else {
            const claimed = await tx.customerOnboardingState.updateMany({
              where: { userId, revision: dto.expectedRevision },
              data: {
                purpose,
                skipped: dto.skipped,
                revision: { increment: 1 },
              },
            });
            if (claimed.count !== 1)
              throw new ConflictException(
                'انتخاب شروع استفاده تغییر کرده است.',
              );
            row = await tx.customerOnboardingState.findUniqueOrThrow({
              where: { userId },
            });
          }
          await tx.auditLog.create({
            data: {
              actorUserId: userId,
              actorRole: UserRole.customer,
              action: 'customer.onboarding_recorded',
              entityType: 'customer_onboarding',
              entityId: userId,
              sensitivity: 'normal',
              after: {
                purpose,
                skipped: dto.skipped,
                revision: row.revision,
                roleOrCapabilityGranted: false,
              },
            },
          });
          return this.view(row);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2034')
      )
        throw new ConflictException(
          'انتخاب شروع استفاده هم‌زمان تغییر کرده است؛ وضعیت را دوباره بخوانید.',
        );
      throw error;
    }
  }
}
