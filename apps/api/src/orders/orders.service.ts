import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DisputeStatus,
  MessageVisibility,
  Order,
  OrderStatus,
  OrderStatusSource,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../finance/payments.service';
import { EscrowService } from '../finance/escrow.service';
import { IdempotencyService } from '../finance/idempotency.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { generateReferenceCode } from '../common/utils/code-generator';
import { OrderAssignmentService } from './domain/order-assignment.service';
import { OrderDisputeService } from './domain/order-dispute.service';
import { OrderMessagingService } from './domain/order-messaging.service';
import { OrderWorkflowService } from './domain/order-workflow.service';
import { OrderQueryService } from './domain/order-query.service';
import {
  AssignOrderDto,
  ConfigureMilestonesDto,
  CreateOrderDto,
  DeliverOrderDto,
  DeliverMilestoneDto,
  DisputeOrderDto,
  ProgressReportDto,
  QuoteOrderDto,
  ResolveDisputeDto,
  RevisionRequestDto,
  TriageDecisionDto,
} from './dto/order.dto';

const DEFAULT_IN_PROGRESS_CANCEL_REFUND_RATE = 0.5;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly escrow: EscrowService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
    private readonly workflow: OrderWorkflowService,
    private readonly assignment: OrderAssignmentService,
    private readonly messaging: OrderMessagingService,
    private readonly disputes: OrderDisputeService,
    private readonly queries: OrderQueryService,
  ) {}

  // ---------------------------------------------------------------------
  // Transition core
  // ---------------------------------------------------------------------

  private async transition(
    orderId: string,
    toStatus: OrderStatus,
    source: OrderStatusSource,
    actorUserId: string | null,
    note?: string,
    extraData: Prisma.OrderUpdateInput = {},
    tx?: Prisma.TransactionClient,
    financialEffect?: {
      type: string;
      amount?: number;
      context?: Prisma.InputJsonValue;
    },
    allowDisputeResolution = false,
  ): Promise<Order> {
    return this.workflow.transition(
      orderId,
      toStatus,
      source,
      actorUserId,
      note,
      extraData,
      tx,
      financialEffect,
      allowDisputeResolution,
    );
  }

  private async loadOwnedOrder(orderId: string, customerId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('سفارش یافت نشد.');
    if (order.customerId !== customerId) {
      throw new ForbiddenException('این سفارش متعلق به شما نیست.');
    }
    return order;
  }

  private async assertExecutorOwnsOrder(
    orderId: string,
    executorUserId: string,
  ) {
    const assignment = await this.prisma.orderAssignment.findFirst({
      where: {
        orderId,
        unassignedAt: null,
        executorProfile: { userId: executorUserId },
      },
    });
    if (!assignment) {
      throw new ForbiddenException('این سفارش به شما ارجاع نشده است.');
    }
    return assignment;
  }

  private async loadEligibleExecutor(
    client: Prisma.TransactionClient,
    order: { id: string; serviceId: string },
    executorProfileId: string,
    requestedTeamId?: string,
    assignmentRole?: string,
  ) {
    return this.assignment.loadEligibleExecutor(
      client,
      order,
      executorProfileId,
      requestedTeamId,
      assignmentRole,
    );
  }

  // ---------------------------------------------------------------------
  // Customer: create / submit
  // ---------------------------------------------------------------------

  async createDraft(customerId: string, dto: CreateOrderDto) {
    const service = await this.prisma.serviceLine.findUnique({
      where: { id: dto.serviceId },
      include: { acceptanceCriteria: true },
    });
    if (!service || !service.isActive) {
      throw new NotFoundException('خدمت انتخابی یافت نشد.');
    }

    const selectedPackage = dto.packageId
      ? await this.prisma.servicePackage.findFirst({
          where: {
            id: dto.packageId,
            serviceId: service.id,
            isActive: true,
          },
        })
      : null;
    if (dto.packageId && !selectedPackage) {
      throw new BadRequestException(
        'پکیج انتخابی فعال نیست یا متعلق به این خدمت نیست.',
      );
    }

    const criteria = dto.acceptanceCriteria?.length
      ? dto.acceptanceCriteria
      : service.acceptanceCriteria.map((item) => item.description);

    const order = await this.prisma.order.create({
      data: {
        code: generateReferenceCode('ORD'),
        customerId,
        serviceId: dto.serviceId,
        packageId: dto.packageId,
        packageSnapshot: selectedPackage
          ? {
              id: selectedPackage.id,
              name: selectedPackage.name,
              description: selectedPackage.description,
              price: selectedPackage.price,
              slaHours: selectedPackage.slaHours,
              deliverables: selectedPackage.deliverables,
              capturedAt: new Date().toISOString(),
            }
          : Prisma.JsonNull,
        title: dto.title,
        urgency: dto.urgency ?? 'normal',
        briefDescription: dto.briefDescription,
        formResponses: dto.formResponses as Prisma.InputJsonValue | undefined,
        budgetHint: dto.budgetHint,
        status: OrderStatus.draft,
        acceptanceCriteria: criteria.length
          ? {
              create: criteria.map((description) => ({
                description,
              })),
            }
          : undefined,
      },
      include: { acceptanceCriteria: true, serviceLine: true, package: true },
    });

    return order;
  }

  async submit(customerId: string, orderId: string) {
    const order = await this.loadOwnedOrder(orderId, customerId);
    if (order.status !== OrderStatus.draft) {
      throw new BadRequestException('فقط پیش‌نویس قابل ارسال است.');
    }

    await this.transition(
      orderId,
      OrderStatus.submitted,
      OrderStatusSource.customer,
      customerId,
      undefined,
      {
        submittedAt: new Date(),
      },
    );

    // گذار خودکار سیستمی مطابق جدول گذار (submitted -> pending_triage)
    const finalOrder = await this.transition(
      orderId,
      OrderStatus.pending_triage,
      OrderStatusSource.system,
      null,
      'ثبت خودکار در صف تریاژ',
    );

    await this.notifications.notifyUser(
      customerId,
      'order.submitted',
      'درخواست شما ثبت شد',
      `سفارش ${order.code} برای بررسی ثبت شد.`,
    );

    return finalOrder;
  }

  async cancelByCustomer(customerId: string, orderId: string, reason: string) {
    const order = await this.loadOwnedOrder(orderId, customerId);
    const preAssignmentStatuses: OrderStatus[] = [
      OrderStatus.draft,
      OrderStatus.submitted,
      OrderStatus.pending_triage,
      OrderStatus.triaging,
      OrderStatus.pending_quote,
      OrderStatus.quoted,
      OrderStatus.pending_payment,
    ];
    if (!preAssignmentStatuses.includes(order.status)) {
      throw new BadRequestException(
        'برای لغو سفارش در این مرحله باید تیکت ثبت کنید تا پشتیبانی/مالی بررسی کند.',
      );
    }
    return this.transition(
      orderId,
      OrderStatus.cancelled,
      OrderStatusSource.customer,
      customerId,
      reason,
      { cancelledAt: new Date() },
    );
  }

  // ---------------------------------------------------------------------
  // Admin ops: triage / quote / assign
  // ---------------------------------------------------------------------

  async triage(adminId: string, orderId: string, dto: TriageDecisionDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('سفارش یافت نشد.');

    if (order.status === OrderStatus.pending_triage) {
      await this.transition(
        orderId,
        OrderStatus.triaging,
        OrderStatusSource.admin,
        adminId,
        dto.note,
      );
    } else if (order.status !== OrderStatus.triaging) {
      throw new BadRequestException('سفارش در وضعیت تریاژ نیست.');
    }

    switch (dto.decision) {
      case 'reject':
        return this.transition(
          orderId,
          OrderStatus.cancelled,
          OrderStatusSource.admin,
          adminId,
          dto.note,
          {
            cancelledAt: new Date(),
          },
        );
      case 'need_more_info':
        await this.prisma.orderMessage.create({
          data: {
            orderId,
            senderUserId: adminId,
            messageType: 'info_request',
            body: dto.note ?? 'اطلاعات تکمیلی برای بررسی سفارش لازم است.',
            visibility: MessageVisibility.customer_visible,
          },
        });
        return this.prisma.order.findUnique({ where: { id: orderId } });
      case 'auto_quote':
        if (dto.finalPrice == null) {
          throw new BadRequestException(
            'برای قیمت‌گذاری خودکار باید finalPrice ارسال شود.',
          );
        }
        return this.transition(
          orderId,
          OrderStatus.quoted,
          OrderStatusSource.admin,
          adminId,
          dto.note,
          {
            finalPrice: dto.finalPrice,
            quotedAt: new Date(),
          },
        );
      case 'send_to_quote':
      default:
        return this.transition(
          orderId,
          OrderStatus.pending_quote,
          OrderStatusSource.admin,
          adminId,
          dto.note,
        );
    }
  }

  async quote(adminId: string, orderId: string, dto: QuoteOrderDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('سفارش یافت نشد.');
    if (order.status !== OrderStatus.pending_quote) {
      throw new BadRequestException('سفارش آماده قیمت‌گذاری نیست.');
    }

    const updated = await this.transition(
      orderId,
      OrderStatus.quoted,
      OrderStatusSource.admin,
      adminId,
      dto.note,
      { finalPrice: dto.finalPrice, quotedAt: new Date() },
    );

    await this.notifications.notifyUser(
      order.customerId,
      'order.quoted',
      'پیش‌فاکتور سفارش شما آماده است',
      `مبلغ سفارش ${order.code}: ${dto.finalPrice.toLocaleString('fa-IR')} تومان`,
    );

    return updated;
  }

  async acceptQuote(customerId: string, orderId: string) {
    const order = await this.loadOwnedOrder(orderId, customerId);
    if (order.status !== OrderStatus.quoted) {
      throw new BadRequestException('سفارش در وضعیت آماده تایید قیمت نیست.');
    }
    return this.transition(
      orderId,
      OrderStatus.pending_payment,
      OrderStatusSource.customer,
      customerId,
    );
  }

  async assign(adminId: string, orderId: string, dto: AssignOrderDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findUnique({ where: { id: orderId } });
        if (!order) throw new NotFoundException('سفارش یافت نشد.');
        if (order.status !== OrderStatus.paid) {
          throw new BadRequestException('فقط سفارش پرداخت‌شده قابل تخصیص است.');
        }
        const assignmentRole = dto.assignmentRole ?? 'pursuit_owner';
        const profile = await this.loadEligibleExecutor(
          tx,
          order,
          dto.executorProfileId,
          dto.teamId,
          assignmentRole,
        );
        await tx.orderAssignment.create({
          data: {
            orderId,
            executorProfileId: profile.id,
            teamId: dto.teamId ?? profile.teamId,
            assignedByUserId: adminId,
            assignmentRole,
          },
        });
        await tx.orderPublicHandler.create({
          data: {
            orderId,
            internalUserId: profile.userId,
            teamId: dto.teamId ?? profile.teamId,
            publicHandlerCode: profile.publicHandlerCode,
            displayAlias: profile.displayAlias,
            assignmentRole,
            visibleToCustomer: true,
          },
        });
        const updated = await this.transition(
          orderId,
          OrderStatus.assigned,
          OrderStatusSource.admin,
          adminId,
          dto.note,
          { assignedAt: new Date() },
          tx,
        );
        await tx.auditLog.create({
          data: {
            actorUserId: adminId,
            actorRole: UserRole.admin,
            action: 'order.assigned',
            entityType: 'order',
            entityId: orderId,
            after: { executorProfileId: profile.id, assignmentRole },
            sensitivity: 'sensitive',
          },
        });
        await this.notifications.notifyUser(
          profile.userId,
          'order.assigned',
          'کار جدید به شما ارجاع شد',
          `سفارش ${order.code} به شما تخصیص یافت.`,
          tx,
        );
        await this.notifications.notifyUser(
          order.customerId,
          'order.assigned',
          'سفارش شما به تیم اجرا سپرده شد',
          `مسئول پیگیری: ${profile.displayAlias} (${profile.publicHandlerCode})`,
          tx,
        );
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /**
   * سلب کار از مجری فعلی و ارجاع به مجری دیگر، بدون تغییر وضعیت سفارش
   * (سفارش همچنان `assigned` یا `in_progress` می‌ماند؛ فقط مسئول اجرا عوض
   * می‌شود). گزارش‌ها، پیام‌ها و فایل‌های قبلی برای مجری جدید قابل مشاهده
   * باقی می‌مانند تا کار از همان‌جا ادامه پیدا کند.
   */
  async reassign(adminId: string, orderId: string, dto: AssignOrderDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findUnique({ where: { id: orderId } });
        if (!order) throw new NotFoundException('سفارش یافت نشد.');
        const reassignableStatuses: OrderStatus[] = [
          OrderStatus.assigned,
          OrderStatus.in_progress,
          OrderStatus.qc_rejected,
        ];
        if (!reassignableStatuses.includes(order.status)) {
          throw new BadRequestException(
            'سفارش در این وضعیت قابل تغییر مجری نیست.',
          );
        }
        const current = await tx.orderAssignment.findFirst({
          where: { orderId, unassignedAt: null },
          include: { executorProfile: true },
        });
        if (current?.executorProfileId === dto.executorProfileId) {
          throw new BadRequestException(
            'این سفارش از قبل به همین مجری تخصیص دارد.',
          );
        }
        const assignmentRole =
          dto.assignmentRole ?? current?.assignmentRole ?? 'pursuit_owner';
        const profile = await this.loadEligibleExecutor(
          tx,
          order,
          dto.executorProfileId,
          dto.teamId,
          assignmentRole,
        );
        const now = new Date();
        if (current) {
          await tx.orderAssignment.update({
            where: { id: current.id },
            data: { unassignedAt: now },
          });
        }
        await tx.orderAssignment.create({
          data: {
            orderId,
            executorProfileId: profile.id,
            teamId: dto.teamId ?? profile.teamId,
            assignedByUserId: adminId,
            assignmentRole,
          },
        });
        await tx.orderPublicHandler.updateMany({
          where: { orderId, activeTo: null },
          data: { activeTo: now },
        });
        await tx.orderPublicHandler.create({
          data: {
            orderId,
            internalUserId: profile.userId,
            teamId: dto.teamId ?? profile.teamId,
            publicHandlerCode: profile.publicHandlerCode,
            displayAlias: profile.displayAlias,
            assignmentRole,
            visibleToCustomer: true,
            activeFrom: now,
          },
        });
        await tx.orderMessage.create({
          data: {
            orderId,
            senderUserId: adminId,
            messageType: 'reassignment',
            body:
              dto.note ??
              `مسئول اجرا از ${current?.executorProfile.displayAlias ?? 'نامشخص'} به ${profile.displayAlias} تغییر کرد.`,
            visibility: MessageVisibility.internal_only,
          },
        });
        await this.audit.record(
          {
            actorUserId: adminId,
            actorRole: UserRole.admin,
            action: 'order.reassigned',
            entityType: 'order',
            entityId: orderId,
            before: { executorProfileId: current?.executorProfileId ?? null },
            after: { executorProfileId: profile.id },
            sensitivity: 'sensitive',
          },
          tx,
        );
        if (current) {
          await this.notifications.notifyUser(
            current.executorProfile.userId,
            'order.unassigned',
            'یک سفارش از شما گرفته شد',
            `سفارش ${order.code} به مجری دیگری واگذار شد.`,
            tx,
          );
        }
        await this.notifications.notifyUser(
          profile.userId,
          'order.assigned',
          'کار جدید به شما ارجاع شد',
          `سفارش ${order.code} به شما ارجاع شد.`,
          tx,
        );
        await this.notifications.notifyUser(
          order.customerId,
          'order.reassigned',
          'مسئول پیگیری سفارش شما تغییر کرد',
          `مسئول پیگیری جدید: ${profile.displayAlias} (${profile.publicHandlerCode})`,
          tx,
        );
        return tx.order.findUniqueOrThrow({ where: { id: orderId } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  // ---------------------------------------------------------------------
  // Payment
  // ---------------------------------------------------------------------

  async initiatePayment(
    customerId: string,
    orderId: string,
    idempotencyKey: string,
    milestoneId?: string,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId },
      include: { milestones: { orderBy: { sequence: 'asc' } } },
    });
    if (!order) throw new NotFoundException('سفارش یافت نشد.');
    if (order.status !== OrderStatus.pending_payment) {
      throw new BadRequestException('سفارش آماده پرداخت نیست.');
    }
    const selectedMilestone = order.milestones.length
      ? order.milestones.find(
          (item) =>
            item.id ===
            (milestoneId ??
              order.milestones.find((m) => m.paymentStatus !== 'succeeded')
                ?.id),
        )
      : undefined;
    if (order.milestones.length && !selectedMilestone) {
      throw new BadRequestException(
        'مرحله پرداخت معتبر و پرداخت‌نشده یافت نشد.',
      );
    }
    if (!selectedMilestone && !order.finalPrice) {
      throw new BadRequestException('مبلغ نهایی سفارش هنوز تعیین نشده است.');
    }
    return this.payments.initiatePayment({
      orderId,
      customerId,
      amount: selectedMilestone?.amount ?? order.finalPrice!,
      milestoneId: selectedMilestone?.id,
      idempotencyKey,
    });
  }

  async configureMilestones(
    adminId: string,
    orderId: string,
    dto: ConfigureMilestonesDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException('سفارش یافت نشد.');
      const configurableStatuses: OrderStatus[] = [
        OrderStatus.quoted,
        OrderStatus.pending_payment,
      ];
      if (!configurableStatuses.includes(order.status)) {
        throw new BadRequestException(
          'مراحل فقط پیش از اولین پرداخت قابل تنظیم‌اند.',
        );
      }
      if (!order.finalPrice)
        throw new BadRequestException('قیمت نهایی تعیین نشده است.');
      const sequences = dto.milestones.map((item) => item.sequence);
      if (new Set(sequences).size !== sequences.length) {
        throw new BadRequestException('شماره ترتیب مراحل باید یکتا باشد.');
      }
      const total = dto.milestones.reduce((sum, item) => sum + item.amount, 0);
      if (total !== order.finalPrice) {
        throw new BadRequestException(
          'جمع مبلغ مراحل باید دقیقاً برابر قیمت نهایی باشد.',
        );
      }
      const paid = await tx.orderMilestone.count({
        where: { orderId, paymentStatus: 'succeeded' },
      });
      if (paid)
        throw new ConflictException(
          'پس از اولین پرداخت، مراحل قابل بازنویسی نیستند.',
        );
      await tx.orderMilestone.deleteMany({ where: { orderId } });
      await tx.orderMilestone.createMany({
        data: dto.milestones.map((item) => ({
          orderId,
          sequence: item.sequence,
          title: item.title,
          amount: item.amount,
          acceptanceCriteria: item.acceptanceCriteria,
        })),
      });
      await tx.auditLog.create({
        data: {
          actorUserId: adminId,
          actorRole: UserRole.admin,
          action: 'order.milestones_configured',
          entityType: 'order',
          entityId: orderId,
          after: { total, count: dto.milestones.length },
          sensitivity: 'sensitive',
        },
      });
      return tx.orderMilestone.findMany({
        where: { orderId },
        orderBy: { sequence: 'asc' },
      });
    });
  }

  async deliverMilestone(
    executorUserId: string,
    orderId: string,
    milestoneId: string,
    dto: DeliverMilestoneDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.orderAssignment.findFirst({
        where: {
          orderId,
          unassignedAt: null,
          executorProfile: { userId: executorUserId },
        },
      });
      if (!assignment)
        throw new ForbiddenException('این سفارش به شما ارجاع نشده است.');
      const milestone = await tx.orderMilestone.findFirst({
        where: { id: milestoneId, orderId },
      });
      if (!milestone || milestone.paymentStatus !== 'succeeded') {
        throw new BadRequestException(
          'مرحله باید متعلق به سفارش و پرداخت‌شده باشد.',
        );
      }
      if (milestone.deliveryStatus !== 'pending') {
        throw new ConflictException('این مرحله قبلاً تحویل شده است.');
      }
      const updated = await tx.orderMilestone.update({
        where: { id: milestone.id },
        data: { deliveryStatus: 'delivered', deliveredAt: new Date() },
      });
      await tx.orderMessage.create({
        data: {
          orderId,
          senderUserId: executorUserId,
          messageType: 'milestone_delivery',
          body: dto.summary,
          visibility: MessageVisibility.customer_visible,
        },
      });
      await tx.outboxEvent.create({
        data: {
          eventType: 'milestone.delivered',
          payload: { orderId, milestoneId: milestone.id },
        },
      });
      return updated;
    });
  }

  async approveMilestone(
    customerId: string,
    orderId: string,
    milestoneId: string,
    idempotencyKey: string,
  ) {
    return this.idempotency.execute({
      key: idempotencyKey,
      scope: `milestone.approve:${milestoneId}`,
      request: { orderId, customerId },
      work: async (tx) => {
        const order = await tx.order.findFirst({
          where: { id: orderId, customerId },
        });
        if (!order) throw new NotFoundException('سفارش یافت نشد.');
        const milestone = await tx.orderMilestone.findFirst({
          where: { id: milestoneId, orderId },
        });
        if (
          !milestone ||
          milestone.deliveryStatus !== 'delivered' ||
          milestone.approvedAt
        ) {
          throw new BadRequestException(
            'مرحله تحویل نشده یا قبلاً تأیید شده است.',
          );
        }
        const settlement = await this.escrow.releaseInTransaction(
          {
            orderId,
            milestoneId,
            amount: milestone.amount,
            decidedByUserId: customerId,
            decidedByRole: UserRole.customer,
            note: `تأیید مرحله ${milestone.sequence} توسط مشتری`,
            idempotencyKey,
          },
          tx,
        );
        const updated = await tx.orderMilestone.update({
          where: { id: milestone.id },
          data: { deliveryStatus: 'approved', approvedAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: customerId,
            actorRole: UserRole.customer,
            action: 'milestone.approved',
            entityType: 'order_milestone',
            entityId: milestone.id,
            after: {
              amount: milestone.amount,
              executorAmount: settlement.executorAmount,
            },
            sensitivity: 'critical',
          },
        });
        return updated;
      },
    });
  }

  async verifyPayment(
    customerId: string,
    orderId: string,
    paymentId: string,
    idempotencyKey: string,
  ) {
    const order = await this.loadOwnedOrder(orderId, customerId);
    const result = await this.payments.verifyAndSettlePayment({
      paymentId,
      orderId,
      customerId,
      idempotencyKey,
    });

    if (!result.alreadyProcessed) {
      await this.notifications.notifyUser(
        customerId,
        'payment.succeeded',
        'پرداخت با موفقیت انجام شد',
        `سفارش ${order.code} در صف تخصیص قرار گرفت.`,
      );
    }

    return result;
  }

  // ---------------------------------------------------------------------
  // Execution
  // ---------------------------------------------------------------------

  async executorStart(executorUserId: string, orderId: string) {
    await this.assertExecutorOwnsOrder(orderId, executorUserId);
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    if (order.status !== OrderStatus.assigned) {
      throw new BadRequestException('سفارش در وضعیت آماده شروع اجرا نیست.');
    }
    return this.transition(
      orderId,
      OrderStatus.in_progress,
      OrderStatusSource.executor,
      executorUserId,
    );
  }

  async progressReport(
    executorUserId: string,
    orderId: string,
    dto: ProgressReportDto,
  ) {
    await this.assertExecutorOwnsOrder(orderId, executorUserId);
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    if (order.status !== OrderStatus.in_progress) {
      throw new BadRequestException(
        'فقط برای سفارش در حال اجرا می‌توان گزارش پیشرفت ثبت کرد.',
      );
    }

    if (dto.fileId) {
      await this.assertExecutorFileIds(orderId, executorUserId, [dto.fileId]);
    }

    const report = await this.prisma.orderReport.create({
      data: {
        orderId,
        authorUserId: executorUserId,
        reportType: 'progress',
        summary: dto.summary,
        fileId: dto.fileId,
        visibleToCustomer: true,
        status: 'published',
      },
    });

    await this.notifications.notifyUser(
      order.customerId,
      'order.progress',
      'گزارش پیشرفت جدید',
      `گزارش جدیدی برای سفارش ${order.code} ثبت شد.`,
    );

    return report;
  }

  async deliver(executorUserId: string, orderId: string, dto: DeliverOrderDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const assignment = await tx.orderAssignment.findFirst({
          where: {
            orderId,
            unassignedAt: null,
            executorProfile: { userId: executorUserId },
          },
        });
        if (!assignment)
          throw new ForbiddenException('این سفارش به شما ارجاع نشده است.');
        const order = await tx.order.findUnique({
          where: { id: orderId },
          include: { serviceLine: { include: { qcChecklistTemplates: true } } },
        });
        if (!order) throw new NotFoundException('سفارش یافت نشد.');
        if (order.status !== OrderStatus.in_progress) {
          throw new BadRequestException('سفارش در وضعیت آماده تحویل نیست.');
        }
        const uniqueFileIds = [...new Set(dto.fileIds)];
        const validFiles = await tx.orderFile.count({
          where: {
            id: { in: uniqueFileIds },
            orderId,
            uploadedByUserId: executorUserId,
            scanStatus: 'clean',
          },
        });
        if (!uniqueFileIds.length || validFiles !== uniqueFileIds.length) {
          throw new BadRequestException(
            'تحویل نیازمند حداقل یک فایل خروجی امن و متعلق به مجری است.',
          );
        }

        await tx.orderReport.create({
          data: {
            orderId,
            authorUserId: executorUserId,
            reportType: 'delivery',
            summary: dto.summary,
            visibleToCustomer: true,
            status: 'published',
          },
        });
        await tx.orderFile.updateMany({
          where: { id: { in: uniqueFileIds }, orderId },
          data: { fileKind: 'output' },
        });
        await this.transition(
          orderId,
          OrderStatus.submitted_for_qc,
          OrderStatusSource.executor,
          executorUserId,
          'ثبت خروجی و ارسال برای کنترل کیفیت',
          {},
          tx,
        );
        await this.transition(
          orderId,
          OrderStatus.qc_in_review,
          OrderStatusSource.system,
          null,
          'ارسال خودکار به صف QC',
          {},
          tx,
        );

        if (!order.serviceLine.qcChecklistTemplates.length) {
          await tx.orderAcceptanceCriteria.updateMany({
            where: { orderId },
            data: { isMet: true },
          });
          await this.transition(
            orderId,
            OrderStatus.ready_for_customer_review,
            OrderStatusSource.system,
            null,
            'این خدمت نیازمند QC نیست',
            {},
            tx,
          );
          const delivered = await this.transition(
            orderId,
            OrderStatus.delivered,
            OrderStatusSource.system,
            null,
            'نمایش خروجی به مشتری',
            { deliveredAt: new Date() },
            tx,
          );
          await this.notifications.notifyUser(
            order.customerId,
            'order.delivered',
            'خروجی سفارش شما آماده است',
            `سفارش ${order.code} برای بازبینی شما آماده است.`,
            tx,
          );
          return delivered;
        }

        await tx.qcReview.create({ data: { orderId } });
        await this.notifications.notifyUser(
          order.customerId,
          'order.submitted_for_qc',
          'خروجی سفارش شما در حال بررسی کیفیت است',
          `سفارش ${order.code} برای کنترل کیفیت ارسال شد.`,
          tx,
        );
        return tx.order.findUniqueOrThrow({ where: { id: orderId } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  // ---------------------------------------------------------------------
  // QC decisions (triggered from QcModule, but state transition lives here)
  // ---------------------------------------------------------------------

  async applyQcApproval(
    orderId: string,
    reviewerUserId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const order = await client.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('سفارش یافت نشد.');
    if (order.status !== OrderStatus.qc_in_review) {
      throw new BadRequestException('سفارش در وضعیت بررسی QC نیست.');
    }

    await this.transition(
      orderId,
      OrderStatus.ready_for_customer_review,
      OrderStatusSource.admin,
      reviewerUserId,
      'تایید کیفیت',
      {},
      tx,
    );

    const delivered = await this.transition(
      orderId,
      OrderStatus.delivered,
      OrderStatusSource.system,
      null,
      'نمایش خودکار خروجی به مشتری پس از تایید QC',
      { deliveredAt: new Date() },
      tx,
    );

    await this.notifications.notifyUser(
      order.customerId,
      'order.delivered',
      'خروجی سفارش شما آماده است',
      `سفارش ${order.code} برای بازبینی شما آماده است.`,
      tx,
    );

    return delivered;
  }

  async applyQcRejection(
    orderId: string,
    reviewerUserId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const order = await client.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('سفارش یافت نشد.');
    if (order.status !== OrderStatus.qc_in_review) {
      throw new BadRequestException('سفارش در وضعیت بررسی QC نیست.');
    }

    await this.transition(
      orderId,
      OrderStatus.qc_rejected,
      OrderStatusSource.admin,
      reviewerUserId,
      'نیازمند اصلاح طبق نتیجه QC',
      {},
      tx,
    );

    const backToProgress = await this.transition(
      orderId,
      OrderStatus.in_progress,
      OrderStatusSource.system,
      null,
      'بازگشت خودکار برای اصلاح پس از رد QC',
      {},
      tx,
    );

    const assignment = await client.orderAssignment.findFirst({
      where: { orderId, unassignedAt: null },
      include: { executorProfile: true },
    });
    if (assignment) {
      await this.notifications.notifyUser(
        assignment.executorProfile.userId,
        'order.qc_rejected',
        'خروجی نیازمند اصلاح است',
        `کنترل کیفیت سفارش ${order.code} نیاز به اصلاح دارد.`,
        tx,
      );
    }

    return backToProgress;
  }

  async getExecutorUserIdForOrder(orderId: string) {
    const assignment = await this.prisma.orderAssignment.findFirst({
      where: { orderId, unassignedAt: null },
      include: { executorProfile: true },
    });
    return assignment?.executorProfile.userId ?? null;
  }

  private async assertExecutorFileIds(
    orderId: string,
    executorUserId: string,
    fileIds: string[],
  ) {
    const uniqueIds = [...new Set(fileIds)];
    const validFiles = await this.prisma.orderFile.count({
      where: {
        id: { in: uniqueIds },
        orderId,
        uploadedByUserId: executorUserId,
        scanStatus: 'clean',
      },
    });
    if (validFiles !== uniqueIds.length) {
      throw new BadRequestException(
        'تمام فایل‌ها باید امن، متعلق به همین سفارش و توسط مجری فعلی بارگذاری شده باشند.',
      );
    }
  }

  // ---------------------------------------------------------------------
  // Customer post-delivery actions
  // ---------------------------------------------------------------------

  async confirm(customerId: string, orderId: string, idempotencyKey: string) {
    return this.idempotency.execute({
      key: idempotencyKey,
      scope: `order.confirm:${orderId}:${customerId}`,
      request: { orderId, customerId },
      work: async (tx) => {
        const order = await tx.order.findFirst({
          where: { id: orderId, customerId },
        });
        if (!order) throw new NotFoundException('سفارش یافت نشد.');
        if (order.status !== OrderStatus.delivered) {
          throw new BadRequestException('سفارش هنوز تحویل داده نشده است.');
        }
        await this.transition(
          orderId,
          OrderStatus.confirmed,
          OrderStatusSource.customer,
          customerId,
          'تأیید تحویل توسط مشتری',
          { confirmedAt: new Date() },
          tx,
        );
        const settlement = await this.escrow.releaseInTransaction(
          {
            orderId,
            decidedByUserId: customerId,
            decidedByRole: UserRole.customer,
            note: 'تأیید تحویل توسط مشتری، آزادسازی خودکار حساب امانی',
            idempotencyKey,
          },
          tx,
        );
        const closed = await this.transition(
          orderId,
          OrderStatus.closed,
          OrderStatusSource.system,
          null,
          'بستن خودکار پس از تأیید و تسویه',
          { closedAt: new Date() },
          tx,
          {
            type: 'escrow_release',
            amount: settlement.executorAmount + settlement.commissionAmount,
          },
        );
        await tx.outboxEvent.create({
          data: {
            eventType: 'order.confirmed_and_settled',
            payload: { orderId, customerId },
          },
        });
        return closed;
      },
    });
  }

  async requestRevision(
    customerId: string,
    orderId: string,
    dto: RevisionRequestDto,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findFirst({
          where: { id: orderId, customerId },
        });
        if (!order) throw new NotFoundException('سفارش یافت نشد.');
        if (order.status !== OrderStatus.delivered) {
          throw new BadRequestException('سفارش هنوز تحویل داده نشده است.');
        }
        if (order.revisionsUsed >= order.revisionsAllowed) {
          throw new BadRequestException(
            'تعداد اصلاحات مجاز این سفارش به پایان رسیده است.',
          );
        }
        const criteriaIds = [...new Set(dto.unmetCriteriaIds ?? [])];
        if (criteriaIds.length) {
          const ownedCount = await tx.orderAcceptanceCriteria.count({
            where: { id: { in: criteriaIds }, orderId },
          });
          if (ownedCount !== criteriaIds.length) {
            throw new BadRequestException('معیار پذیرش نامعتبر است.');
          }
          await tx.orderAcceptanceCriteria.updateMany({
            where: { id: { in: criteriaIds }, orderId },
            data: { isMet: false },
          });
        }
        await tx.orderMessage.create({
          data: {
            orderId,
            senderUserId: customerId,
            messageType: 'revision_request',
            body: dto.reason,
            visibility: MessageVisibility.customer_visible,
          },
        });
        await this.transition(
          orderId,
          OrderStatus.revision_requested,
          OrderStatusSource.customer,
          customerId,
          dto.reason,
          { revisionsUsed: { increment: 1 } },
          tx,
        );
        const inProgress = await this.transition(
          orderId,
          OrderStatus.in_progress,
          OrderStatusSource.system,
          null,
          'بازگشت خودکار برای اصلاح',
          {},
          tx,
        );
        const assignment = await tx.orderAssignment.findFirst({
          where: { orderId, unassignedAt: null },
          include: { executorProfile: true },
        });
        if (assignment) {
          await this.notifications.notifyUser(
            assignment.executorProfile.userId,
            'order.revision_requested',
            'درخواست اصلاح برای سفارش',
            `مشتری برای سفارش ${order.code} درخواست اصلاح ثبت کرد.`,
            tx,
          );
        }
        await tx.auditLog.create({
          data: {
            actorUserId: customerId,
            actorRole: UserRole.customer,
            action: 'order.revision_requested',
            entityType: 'order',
            entityId: orderId,
            after: { reason: dto.reason, unmetCriteriaIds: criteriaIds },
            sensitivity: 'sensitive',
          },
        });
        return inProgress;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async raiseDispute(
    actorUserId: string,
    actorRole: UserRole,
    orderId: string,
    dto: DisputeOrderDto,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findUnique({ where: { id: orderId } });
        if (!order) throw new NotFoundException('سفارش یافت نشد.');
        this.disputes.assertCanRaise(order, actorUserId, actorRole);
        const existing = await tx.dispute.findFirst({
          where: { orderId, status: DisputeStatus.open },
        });
        if (existing)
          throw new ConflictException(
            'برای این سفارش پرونده اختلاف باز وجود دارد.',
          );
        const dispute = await tx.dispute.create({
          data: {
            orderId,
            raisedByUserId: actorUserId,
            reason: dto.reason,
            note: dto.note,
          },
        });
        await this.transition(
          orderId,
          OrderStatus.disputed,
          actorRole === UserRole.customer
            ? OrderStatusSource.customer
            : OrderStatusSource.admin,
          actorUserId,
          dto.note,
          {},
          tx,
        );
        await this.audit.record(
          {
            actorUserId,
            actorRole,
            action: 'order.dispute_raised',
            entityType: 'order',
            entityId: orderId,
            after: { reason: dto.reason, disputeId: dispute.id },
            sensitivity: 'sensitive',
          },
          tx,
        );
        await tx.outboxEvent.create({
          data: {
            eventType: 'order.disputed',
            payload: { orderId, disputeId: dispute.id },
          },
        });
        return dispute;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async resolveDispute(
    adminId: string,
    orderId: string,
    dto: ResolveDisputeDto,
    idempotencyKey: string,
  ) {
    return this.idempotency.execute({
      key: idempotencyKey,
      scope: `order.resolve-dispute:${orderId}`,
      request: dto,
      work: async (tx) => {
        const order = await tx.order.findUnique({ where: { id: orderId } });
        if (!order) throw new NotFoundException('سفارش یافت نشد.');
        if (order.status !== OrderStatus.disputed) {
          throw new BadRequestException('سفارش در وضعیت اختلاف نیست.');
        }
        const dispute = await tx.dispute.findFirst({
          where: { orderId, status: DisputeStatus.open },
          orderBy: { createdAt: 'desc' },
        });
        if (!dispute)
          throw new NotFoundException('پرونده اختلاف باز یافت نشد.');

        let resultOrder: Order;
        let financialAmount: number | undefined;
        const effect = (type: string, amount?: number) => ({ type, amount });
        switch (dto.resolutionType) {
          case 'rework':
            resultOrder = await this.transition(
              orderId,
              OrderStatus.in_progress,
              OrderStatusSource.admin,
              adminId,
              dto.note,
              {},
              tx,
              effect('none'),
              true,
            );
            break;
          case 'refund_full': {
            const refund = await this.escrow.refundInTransaction(
              {
                orderId,
                reason: 'dispute_refund_full',
                note: dto.note,
                decidedByUserId: adminId,
                idempotencyKey,
              },
              tx,
            );
            financialAmount = refund.refund.amount;
            resultOrder = await this.transition(
              orderId,
              OrderStatus.cancelled,
              OrderStatusSource.admin,
              adminId,
              dto.note,
              { cancelledAt: new Date() },
              tx,
              effect('escrow_refund', financialAmount),
              true,
            );
            break;
          }
          case 'refund_partial': {
            if (!dto.amount)
              throw new BadRequestException(
                'برای بازپرداخت جزئی مبلغ الزامی است.',
              );
            const refund = await this.escrow.refundInTransaction(
              {
                orderId,
                amount: dto.amount,
                reason: 'dispute_refund_partial',
                note: dto.note,
                decidedByUserId: adminId,
                idempotencyKey,
              },
              tx,
            );
            financialAmount = refund.refund.amount;
            resultOrder = await this.transition(
              orderId,
              OrderStatus.closed,
              OrderStatusSource.admin,
              adminId,
              dto.note,
              { closedAt: new Date() },
              tx,
              effect('escrow_refund_partial', financialAmount),
              true,
            );
            break;
          }
          case 'release_to_executor': {
            const release = await this.escrow.releaseInTransaction(
              {
                orderId,
                decidedByUserId: adminId,
                note: dto.note,
                idempotencyKey,
              },
              tx,
            );
            financialAmount = release.executorAmount + release.commissionAmount;
            resultOrder = await this.transition(
              orderId,
              OrderStatus.confirmed,
              OrderStatusSource.admin,
              adminId,
              dto.note,
              { confirmedAt: new Date() },
              tx,
              effect('escrow_release', financialAmount),
              true,
            );
            resultOrder = await this.transition(
              orderId,
              OrderStatus.closed,
              OrderStatusSource.system,
              null,
              'بستن سفارش پس از حل اختلاف',
              { closedAt: new Date() },
              tx,
            );
            break;
          }
          case 'close':
          default:
            resultOrder = await this.transition(
              orderId,
              OrderStatus.closed,
              OrderStatusSource.admin,
              adminId,
              dto.note,
              { closedAt: new Date() },
              tx,
              effect('none'),
              true,
            );
            break;
        }
        await tx.dispute.update({
          where: { id: dispute.id },
          data: {
            status: DisputeStatus.resolved,
            resolutionType: dto.resolutionType,
            resolvedByUserId: adminId,
            resolvedAt: new Date(),
            financialEffectAmount: financialAmount,
          },
        });
        await this.audit.record(
          {
            actorUserId: adminId,
            actorRole: UserRole.admin,
            action: 'order.dispute_resolved',
            entityType: 'order',
            entityId: orderId,
            after: {
              resolutionType: dto.resolutionType,
              amount: financialAmount,
              note: dto.note,
            },
            sensitivity: 'critical',
          },
          tx,
        );
        await tx.outboxEvent.create({
          data: {
            eventType: 'order.dispute_resolved',
            payload: {
              orderId,
              disputeId: dispute.id,
              resolutionType: dto.resolutionType,
            },
          },
        });
        return resultOrder;
      },
    });
  }

  async cancelByAdmin(
    adminId: string,
    orderId: string,
    reason: string,
    idempotencyKey: string,
  ) {
    return this.idempotency.execute({
      key: idempotencyKey,
      scope: `order.cancel:${orderId}`,
      request: { reason },
      work: async (tx) => {
        const order = await tx.order.findUnique({ where: { id: orderId } });
        if (!order) throw new NotFoundException('سفارش یافت نشد.');
        if (order.status === OrderStatus.disputed) {
          throw new BadRequestException(
            'لغو سفارش مورد اختلاف فقط از resolve-dispute مجاز است.',
          );
        }
        let refundAmount: number | undefined;
        const financialStatuses: OrderStatus[] = [
          OrderStatus.paid,
          OrderStatus.assigned,
          OrderStatus.in_progress,
        ];
        if (financialStatuses.includes(order.status)) {
          const escrow = await tx.escrowHold.findFirst({
            where: {
              orderId,
              status: {
                in: ['held', 'partially_released', 'partially_refunded'],
              },
            },
            orderBy: { heldAt: 'desc' },
          });
          if (escrow) {
            const remaining =
              escrow.amount - escrow.releasedAmount - escrow.refundedAmount;
            const refundPolicy = await tx.systemSetting.findUnique({
              where: { key: 'finance.cancel_in_progress_refund_rate' },
            });
            const configuredRate =
              typeof refundPolicy?.value === 'number'
                ? refundPolicy.value
                : DEFAULT_IN_PROGRESS_CANCEL_REFUND_RATE;
            if (configuredRate < 0 || configuredRate > 1) {
              throw new BadRequestException(
                'نرخ سیاست بازپرداخت باید بین صفر و یک باشد.',
              );
            }
            const rate =
              order.status === OrderStatus.in_progress ? configuredRate : 1;
            refundAmount = Math.min(
              remaining,
              Math.round(escrow.amount * rate),
            );
            if (refundAmount > 0) {
              await this.escrow.refundInTransaction(
                {
                  orderId,
                  amount: refundAmount,
                  reason: 'order_cancelled',
                  note: reason,
                  decidedByUserId: adminId,
                  idempotencyKey,
                },
                tx,
              );
            }
          }
        }
        const cancelled = await this.transition(
          orderId,
          OrderStatus.cancelled,
          OrderStatusSource.admin,
          adminId,
          reason,
          { cancelledAt: new Date() },
          tx,
          refundAmount
            ? { type: 'escrow_refund', amount: refundAmount }
            : { type: 'none' },
        );
        await this.audit.record(
          {
            actorUserId: adminId,
            actorRole: UserRole.admin,
            action: 'order.cancelled',
            entityType: 'order',
            entityId: orderId,
            after: { reason, refundAmount: refundAmount ?? 0 },
            sensitivity: 'sensitive',
          },
          tx,
        );
        return cancelled;
      },
    });
  }

  // ---------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------

  async findOneForCustomer(customerId: string, orderId: string) {
    return this.queries.findOneForCustomer(customerId, orderId);
  }

  listForCustomer(
    customerId: string,
    params: { status?: string; skip?: number; take?: number },
  ) {
    return this.queries.listForCustomer(customerId, params);
  }

  listForExecutor(
    executorUserId: string,
    params: { skip?: number; take?: number },
  ) {
    return this.queries.listForExecutor(executorUserId, params);
  }

  async findOneForExecutor(executorUserId: string, orderId: string) {
    return this.queries.findOneForExecutor(executorUserId, orderId);
  }

  listForAdmin(params: {
    status?: string;
    serviceId?: string;
    search?: string;
    sortBy?: 'createdAt' | 'updatedAt' | 'code' | 'quotedPrice';
    sortDirection?: 'asc' | 'desc';
    skip?: number;
    take?: number;
  }) {
    return this.queries.listForAdmin(params);
  }

  async findOneForAdmin(orderId: string) {
    return this.queries.findOneForAdmin(orderId);
  }

  async addCustomerMessage(
    orderId: string,
    customerId: string,
    body: string,
    attachmentFileId?: string,
  ) {
    await this.loadOwnedOrder(orderId, customerId);
    return this.messaging.create({
      orderId,
      senderUserId: customerId,
      body,
      visibility: MessageVisibility.customer_visible,
      attachmentFileId,
      requireUploaderOwnership: true,
    });
  }

  async addAdminMessage(
    orderId: string,
    adminId: string,
    body: string,
    visibility: MessageVisibility,
    attachmentFileId?: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true },
    });
    if (!order) throw new NotFoundException('سفارش یافت نشد.');
    return this.messaging.create({
      orderId,
      senderUserId: adminId,
      body,
      visibility,
      attachmentFileId,
      requireUploaderOwnership: false,
    });
  }
}
