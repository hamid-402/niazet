import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AdminScope, Prisma, UserRole } from '@prisma/client';
import { IsObject, IsString, MaxLength, MinLength } from 'class-validator';
import { AdminScopes } from '../common/decorators/admin-scopes.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminScopeGuard } from '../common/guards/admin-scope.guard';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import { readSlaCalendar } from './sla-calendar';
import { contractTransactionError } from './transaction-error';

class UpdateSlaCalendarDto {
  @IsObject() calendar!: Record<string, unknown>;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}
@Controller('v1/admin/support/sla-calendar')
@UseGuards(RolesGuard, AdminScopeGuard)
@Roles(UserRole.admin)
@AdminScopes(AdminScope.super_admin)
export class SlaCalendarAdminController {
  constructor(private readonly prisma: PrismaService) {}
  @Get()
  async get() {
    const [policy, holidays] = await Promise.all([
      this.prisma.systemSetting.findUnique({
        where: { key: 'support.first_response_calendar' },
      }),
      this.prisma.systemSetting.findUnique({
        where: { key: 'calendar.iran_holidays' },
      }),
    ]);
    return readSlaCalendar(policy?.value, holidays?.value);
  }
  @Put()
  async set(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UpdateSlaCalendarDto,
  ) {
    const value = readSlaCalendar(dto.calendar, []),
      reason = dto.reason.trim();
    if (reason.length < 3)
      throw new BadRequestException('علت واقعی تغییر تقویم لازم است.');
    return this.prisma
      .$transaction(
        async (tx) => {
          const key = 'support.first_response_calendar';
          const before = await tx.systemSetting.findUnique({ where: { key } });
          const previous = readSlaCalendar(before?.value, []);
          if (value.version <= previous.version)
            throw new ConflictException(
              'نسخهٔ تقویم جدید باید بزرگ‌تر از نسخهٔ فعال باشد.',
            );
          const json = value as unknown as Prisma.InputJsonValue;
          await tx.systemSetting.upsert({
            where: { key },
            create: { key, value: json, updatedByUserId: actor.id },
            update: { value: json, updatedByUserId: actor.id },
          });
          await tx.auditLog.create({
            data: {
              actorUserId: actor.id,
              actorRole: actor.role,
              action: 'ticket.sla_calendar.updated',
              entityType: 'system_setting',
              entityId: key,
              before: { version: previous.version },
              after: { version: value.version, reason },
              sensitivity: 'critical',
            },
          });
          return value;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
      .catch(contractTransactionError);
  }
}
