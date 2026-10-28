import {
  Body,
  ConflictException,
  Controller,
  NotFoundException,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AdminScope, Prisma, UserRole } from '@prisma/client';
import { Equals, IsInt, IsString, Max, Min, MinLength } from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminScopes } from '../common/decorators/admin-scopes.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminScopeGuard } from '../common/guards/admin-scope.guard';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import { contractTransactionError } from './transaction-error';

class ServicePolicyDto {
  @IsInt() @Min(1) version!: number;
  @Equals(0) normalRateBps!: number;
  @Equals(3000) urgentRateBps!: number;
  @Equals(8000) sameDayRateBps!: number;
  @IsInt() @Min(-100000) @Max(100000) sortOrder!: number;
  @IsString() @MinLength(3) reason!: string;
}
@Controller('v1/admin/services/:id/contract-policy')
@UseGuards(RolesGuard, AdminScopeGuard)
@Roles(UserRole.admin)
@AdminScopes(AdminScope.ops_admin)
export class ServicePolicyAdminController {
  constructor(private readonly prisma: PrismaService) {}
  @Put()
  async set(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') serviceId: string,
    @Body() dto: ServicePolicyDto,
  ) {
    return this.prisma
      .$transaction(
        async (tx) => {
          if (!(await tx.serviceLine.count({ where: { id: serviceId } })))
            throw new NotFoundException('خدمت یافت نشد.');
          await tx.$queryRaw(
            Prisma.sql`SELECT id FROM service_lines WHERE id = ${serviceId} FOR UPDATE`,
          );
          const latest = await tx.serviceContractPolicy.findFirst({
            where: { serviceId },
            orderBy: { version: 'desc' },
          });
          if (
            dto.version <= (latest?.version ?? 0) ||
            dto.reason.trim().length < 3
          )
            throw new ConflictException(
              'نسخه باید افزایش یابد و علت واقعی ثبت شود.',
            );
          const { reason, ...values } = dto;
          const policy = await tx.serviceContractPolicy.create({
            data: { serviceId, ...values },
          });
          await tx.auditLog.create({
            data: {
              actorUserId: actor.id,
              actorRole: actor.role,
              action: 'service.contract_policy.created',
              entityType: 'service_line',
              entityId: serviceId,
              after: {
                policyId: policy.id,
                version: policy.version,
                reason: reason.trim(),
              },
              sensitivity: 'sensitive',
            },
          });
          return policy;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
      .catch(contractTransactionError);
  }
}
