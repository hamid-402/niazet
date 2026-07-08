import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DisputeStatus,
  FileKind,
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
import { InvoicesService } from '../finance/invoices.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { generateReferenceCode } from '../common/utils/code-generator';
import { isTransitionAllowed } from './order-state-machine';
import {
  AssignOrderDto,
  CreateOrderDto,
  DeliverOrderDto,
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
    private readonly invoices: InvoicesService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
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
  ): Promise<Order> {
    const client = tx ?? this.prisma;
    const order = await client.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('سفارش یافت نشد.');

    if (!isTransitionAllowed(order.status, toStatus)) {
      throw new BadRequestException(
        `سفارش در این وضعیت (${order.status}) قابل تغییر به ${toStatus} نیست.`,
      );
    }

    const updated = await client.order.update({
      where: { id: orderId },
      data: { status: toStatus, ...extraData },
    });

    await client.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus,
        actorUserId,
        source,
        note,
      },
    });

    return updated;
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

  // ---------------------------------------------------------------------
  // Customer: create / submit
  // ---------------------------------------------------------------------

  async createDraft(customerId: string, dto: CreateOrderDto) {
    const service = await this.prisma.serviceLine.findUnique({
      where: { id: dto.serviceId },
    });
    if (!service || !service.isActive) {
      throw new NotFoundException('خدمت انتخابی یافت نشد.');
    }

    const order = await this.prisma.order.create({
      data: {
        code: generateReferenceCode('ORD'),
        customerId,
        serviceId: dto.serviceId,
        packageId: dto.packageId,
        title: dto.title,
        urgency: dto.urgency ?? 'normal',
        briefDescription: dto.briefDescription,
        formResponses: dto.formResponses as Prisma.InputJsonValue | undefined,
        budgetHint: dto.budgetHint,
        status: OrderStatus.draft,
        acceptanceCriteria: dto.acceptanceCriteria
          ? {
              create: dto.acceptanceCriteria.map((description) => ({
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
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('سفارش یافت نشد.');
    if (order.status !== OrderStatus.paid) {
      throw new BadRequestException('فقط سفارش پرداخت‌شده قابل تخصیص است.');
    }

    const executorProfile = await this.prisma.executorProfile.findUnique({
      where: { id: dto.executorProfileId },
    });
    if (!executorProfile) throw new NotFoundException('مجری یافت نشد.');

    const assignmentRole = dto.assignmentRole ?? 'pursuit_owner';

    await this.prisma.orderAssignment.create({
      data: {
        orderId,
        executorProfileId: dto.executorProfileId,
        teamId: dto.teamId ?? executorProfile.teamId,
        assignedByUserId: adminId,
        assignmentRole,
      },
    });

    await this.prisma.orderPublicHandler.create({
      data: {
        orderId,
        internalUserId: executorProfile.userId,
        teamId: dto.teamId ?? executorProfile.teamId,
        publicHandlerCode: executorProfile.publicHandlerCode,
        displayAlias: executorProfile.displayAlias,
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
    );

    await this.notifications.notifyUser(
      executorProfile.userId,
      'order.assigned',
      'کار جدید به شما ارجاع شد',
      `سفارش ${order.code} به شما تخصیص یافت.`,
    );
    await this.notifications.notifyUser(
      order.customerId,
      'order.assigned',
      'سفارش شما به تیم اجرا سپرده شد',
      `مسئول پیگیری: ${executorProfile.displayAlias} (${executorProfile.publicHandlerCode})`,
    );

    return updated;
  }

  // ---------------------------------------------------------------------
  // Payment
  // ---------------------------------------------------------------------

  async initiatePayment(customerId: string, orderId: string) {
    const order = await this.loadOwnedOrder(orderId, customerId);
    if (order.status !== OrderStatus.pending_payment) {
      throw new BadRequestException('سفارش آماده پرداخت نیست.');
    }
    if (!order.finalPrice) {
      throw new BadRequestException('مبلغ نهایی سفارش هنوز تعیین نشده است.');
    }
    return this.payments.initiatePayment({
      orderId,
      customerId,
      amount: order.finalPrice,
    });
  }

  async verifyPayment(customerId: string, orderId: string, paymentId: string) {
    const order = await this.loadOwnedOrder(orderId, customerId);
    const result = await this.payments.verifyAndSettlePayment(paymentId);

    if (order.status === OrderStatus.pending_payment) {
      await this.transition(
        orderId,
        OrderStatus.paid,
        OrderStatusSource.system,
        null,
        'پرداخت تایید شد',
        {
          paidAt: new Date(),
        },
      );
      await this.invoices.issueForOrder(
        orderId,
        customerId,
        order.finalPrice ?? 0,
      );
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
    await this.assertExecutorOwnsOrder(orderId, executorUserId);
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { serviceLine: { include: { qcChecklistTemplates: true } } },
    });
    if (!order) throw new NotFoundException('سفارش یافت نشد.');
    if (order.status !== OrderStatus.in_progress) {
      throw new BadRequestException('سفارش در وضعیت آماده تحویل نیست.');
    }

    await this.prisma.orderReport.create({
      data: {
        orderId,
        authorUserId: executorUserId,
        reportType: 'delivery',
        summary: dto.summary,
        visibleToCustomer: true,
        status: 'published',
      },
    });

    if (dto.fileIds.length) {
      await this.prisma.orderFile.updateMany({
        where: { id: { in: dto.fileIds }, orderId },
        data: { fileKind: 'output' },
      });
    }

    await this.transition(
      orderId,
      OrderStatus.submitted_for_qc,
      OrderStatusSource.executor,
      executorUserId,
    );
    await this.transition(
      orderId,
      OrderStatus.qc_in_review,
      OrderStatusSource.system,
      null,
      'ارسال خودکار به صف QC',
    );

    const requiresQc = order.serviceLine.qcChecklistTemplates.length > 0;

    if (!requiresQc) {
      // خدمت QC اختصاصی ندارد؛ مسیر خودکار تا تحویل به مشتری طی می‌شود.
      await this.transition(
        orderId,
        OrderStatus.ready_for_customer_review,
        OrderStatusSource.system,
        null,
        'این خدمت نیازمند QC نیست',
      );
      const delivered = await this.transition(
        orderId,
        OrderStatus.delivered,
        OrderStatusSource.system,
        null,
        undefined,
        { deliveredAt: new Date() },
      );
      await this.notifications.notifyUser(
        order.customerId,
        'order.delivered',
        'خروجی سفارش شما آماده است',
        `سفارش ${order.code} برای بازبینی شما آماده است.`,
      );
      return delivered;
    }

    // در صف QC قرار می‌گیرد؛ reviewer بعداً از پنل ادمین انتخاب می‌شود و طبق
    // بند ۱.۵ الحاقیه نباید همان executor سفارش باشد.
    await this.prisma.qcReview.create({ data: { orderId } });

    await this.notifications.notifyUser(
      order.customerId,
      'order.submitted_for_qc',
      'خروجی سفارش شما در حال بررسی کیفیت است',
      `سفارش ${order.code} برای کنترل کیفیت ارسال شد.`,
    );

    return this.prisma.order.findUnique({ where: { id: orderId } });
  }

  // ---------------------------------------------------------------------
  // QC decisions (triggered from QcModule, but state transition lives here)
  // ---------------------------------------------------------------------

  async applyQcApproval(orderId: string, reviewerUserId: string) {
    const order = await this.prisma.order.findUnique({
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
    );

    const delivered = await this.transition(
      orderId,
      OrderStatus.delivered,
      OrderStatusSource.system,
      null,
      'نمایش خودکار خروجی به مشتری پس از تایید QC',
      { deliveredAt: new Date() },
    );

    await this.notifications.notifyUser(
      order.customerId,
      'order.delivered',
      'خروجی سفارش شما آماده است',
      `سفارش ${order.code} برای بازبینی شما آماده است.`,
    );

    return delivered;
  }

  async applyQcRejection(orderId: string, reviewerUserId: string) {
    const order = await this.prisma.order.findUnique({
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
    );

    const backToProgress = await this.transition(
      orderId,
      OrderStatus.in_progress,
      OrderStatusSource.system,
      null,
      'بازگشت خودکار برای اصلاح پس از رد QC',
    );

    const assignment = await this.prisma.orderAssignment.findFirst({
      where: { orderId, unassignedAt: null },
      include: { executorProfile: true },
    });
    if (assignment) {
      await this.notifications.notifyUser(
        assignment.executorProfile.userId,
        'order.qc_rejected',
        'خروجی نیازمند اصلاح است',
        `کنترل کیفیت سفارش ${order.code} نیاز به اصلاح دارد.`,
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

  // ---------------------------------------------------------------------
  // Customer post-delivery actions
  // ---------------------------------------------------------------------

  async confirm(customerId: string, orderId: string) {
    const order = await this.loadOwnedOrder(orderId, customerId);
    if (order.status !== OrderStatus.delivered) {
      throw new BadRequestException('سفارش هنوز تحویل داده نشده است.');
    }

    await this.transition(
      orderId,
      OrderStatus.confirmed,
      OrderStatusSource.customer,
      customerId,
      undefined,
      {
        confirmedAt: new Date(),
      },
    );

    await this.escrow.release({
      orderId,
      decidedByUserId: customerId,
      note: 'تایید تحویل توسط مشتری، آزادسازی خودکار escrow',
    });

    const closed = await this.transition(
      orderId,
      OrderStatus.closed,
      OrderStatusSource.system,
      null,
      'بستن خودکار پس از تایید و تسویه',
      { closedAt: new Date() },
    );

    return closed;
  }

  async requestRevision(
    customerId: string,
    orderId: string,
    dto: RevisionRequestDto,
  ) {
    const order = await this.loadOwnedOrder(orderId, customerId);
    if (order.status !== OrderStatus.delivered) {
      throw new BadRequestException('سفارش هنوز تحویل داده نشده است.');
    }
    if (order.revisionsUsed >= order.revisionsAllowed) {
      throw new BadRequestException(
        'تعداد اصلاحات مجاز این سفارش به پایان رسیده است.',
      );
    }

    if (dto.unmetCriteriaIds?.length) {
      await this.prisma.orderAcceptanceCriteria.updateMany({
        where: { id: { in: dto.unmetCriteriaIds }, orderId },
        data: { isMet: false },
      });
    }

    await this.prisma.orderMessage.create({
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
    );

    await this.prisma.order.update({
      where: { id: orderId },
      data: { revisionsUsed: { increment: 1 } },
    });

    const inProgress = await this.transition(
      orderId,
      OrderStatus.in_progress,
      OrderStatusSource.system,
      null,
      'بازگشت خودکار برای اصلاح',
    );

    const assignment = await this.prisma.orderAssignment.findFirst({
      where: { orderId, unassignedAt: null },
      include: { executorProfile: true },
    });
    if (assignment) {
      await this.notifications.notifyUser(
        assignment.executorProfile.userId,
        'order.revision_requested',
        'درخواست اصلاح برای سفارش',
        `مشتری برای سفارش ${order.code} درخواست اصلاح ثبت کرد.`,
      );
    }

    return inProgress;
  }

  async raiseDispute(
    actorUserId: string,
    actorRole: UserRole,
    orderId: string,
    dto: DisputeOrderDto,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('سفارش یافت نشد.');

    if (actorRole === UserRole.customer && order.customerId !== actorUserId) {
      throw new ForbiddenException('این سفارش متعلق به شما نیست.');
    }

    const disputableStatuses: OrderStatus[] = [
      OrderStatus.in_progress,
      OrderStatus.delivered,
    ];
    if (!disputableStatuses.includes(order.status)) {
      throw new BadRequestException(
        'امکان ثبت dispute در این وضعیت سفارش وجود ندارد.',
      );
    }

    const dispute = await this.prisma.dispute.create({
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
    );

    await this.audit.record({
      actorUserId,
      actorRole,
      action: 'order.dispute_raised',
      entityType: 'order',
      entityId: orderId,
      after: { reason: dto.reason },
      sensitivity: 'sensitive',
    });

    return dispute;
  }

  async resolveDispute(
    adminId: string,
    orderId: string,
    dto: ResolveDisputeDto,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('سفارش یافت نشد.');
    if (order.status !== OrderStatus.disputed) {
      throw new BadRequestException('سفارش در وضعیت اختلاف نیست.');
    }

    const dispute = await this.prisma.dispute.findFirst({
      where: { orderId, status: DisputeStatus.open },
      orderBy: { createdAt: 'desc' },
    });
    if (!dispute) throw new NotFoundException('پرونده dispute باز یافت نشد.');

    let resultOrder: Order;

    switch (dto.resolutionType) {
      case 'rework':
        resultOrder = await this.transition(
          orderId,
          OrderStatus.in_progress,
          OrderStatusSource.admin,
          adminId,
          dto.note,
        );
        break;
      case 'refund_full':
        await this.escrow.refund({
          orderId,
          reason: 'dispute_refund_full',
          note: dto.note,
          decidedByUserId: adminId,
        });
        resultOrder = await this.transition(
          orderId,
          OrderStatus.cancelled,
          OrderStatusSource.admin,
          adminId,
          dto.note,
          {
            cancelledAt: new Date(),
          },
        );
        break;
      case 'refund_partial':
        if (!dto.amount)
          throw new BadRequestException('برای رفاند جزئی باید مبلغ مشخص شود.');
        await this.escrow.refund({
          orderId,
          amount: dto.amount,
          reason: 'dispute_refund_partial',
          note: dto.note,
          decidedByUserId: adminId,
        });
        resultOrder = await this.transition(
          orderId,
          OrderStatus.closed,
          OrderStatusSource.admin,
          adminId,
          dto.note,
          {
            closedAt: new Date(),
          },
        );
        break;
      case 'release_to_executor':
        await this.escrow.release({
          orderId,
          decidedByUserId: adminId,
          note: dto.note,
        });
        resultOrder = await this.transition(
          orderId,
          OrderStatus.confirmed,
          OrderStatusSource.admin,
          adminId,
          dto.note,
          { confirmedAt: new Date() },
        );
        resultOrder = await this.transition(
          orderId,
          OrderStatus.closed,
          OrderStatusSource.system,
          null,
          undefined,
          {
            closedAt: new Date(),
          },
        );
        break;
      case 'close':
      default:
        resultOrder = await this.transition(
          orderId,
          OrderStatus.closed,
          OrderStatusSource.admin,
          adminId,
          dto.note,
          {
            closedAt: new Date(),
          },
        );
        break;
    }

    await this.prisma.dispute.update({
      where: { id: dispute.id },
      data: {
        status: DisputeStatus.resolved,
        resolutionType: dto.resolutionType,
        resolvedByUserId: adminId,
        resolvedAt: new Date(),
        financialEffectAmount: dto.amount,
      },
    });

    await this.audit.record({
      actorUserId: adminId,
      actorRole: UserRole.admin,
      action: 'order.dispute_resolved',
      entityType: 'order',
      entityId: orderId,
      after: {
        resolutionType: dto.resolutionType,
        amount: dto.amount,
        note: dto.note,
      },
      sensitivity: 'critical',
    });

    return resultOrder;
  }

  async cancelByAdmin(adminId: string, orderId: string, reason: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('سفارش یافت نشد.');

    const financialStatuses: OrderStatus[] = [
      OrderStatus.paid,
      OrderStatus.assigned,
      OrderStatus.in_progress,
    ];

    if (financialStatuses.includes(order.status)) {
      const escrowHold = await this.prisma.escrowHold.findFirst({
        where: { orderId, status: { in: ['held', 'partially_released'] } },
      });
      if (escrowHold) {
        const refundRate =
          order.status === OrderStatus.in_progress
            ? DEFAULT_IN_PROGRESS_CANCEL_REFUND_RATE
            : 1;
        const refundAmount = Math.round(escrowHold.amount * refundRate);
        await this.escrow.refund({
          orderId,
          amount: refundAmount,
          reason: 'order_cancelled',
          note: reason,
          decidedByUserId: adminId,
        });
      }
    }

    const cancelled = await this.transition(
      orderId,
      OrderStatus.cancelled,
      OrderStatusSource.admin,
      adminId,
      reason,
      { cancelledAt: new Date() },
    );

    await this.audit.record({
      actorUserId: adminId,
      actorRole: UserRole.admin,
      action: 'order.cancelled',
      entityType: 'order',
      entityId: orderId,
      after: { reason },
      sensitivity: 'sensitive',
    });

    return cancelled;
  }

  // ---------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------

  async findOneForCustomer(customerId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: this.customerOrderInclude(),
    });
    if (!order || order.customerId !== customerId) {
      throw new NotFoundException('سفارش یافت نشد.');
    }
    return order;
  }

  listForCustomer(
    customerId: string,
    params: { status?: string; skip?: number; take?: number },
  ) {
    return this.prisma.order.findMany({
      where: {
        customerId,
        ...(params.status ? { status: params.status as OrderStatus } : {}),
      },
      include: {
        serviceLine: { select: { title: true } },
        publicHandlers: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.take,
    });
  }

  listForExecutor(
    executorUserId: string,
    params: { skip?: number; take?: number },
  ) {
    return this.prisma.order.findMany({
      where: {
        assignments: {
          some: {
            unassignedAt: null,
            executorProfile: { userId: executorUserId },
          },
        },
      },
      include: { serviceLine: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.take,
    });
  }

  async findOneForExecutor(executorUserId: string, orderId: string) {
    await this.assertExecutorOwnsOrder(orderId, executorUserId);
    return this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        serviceLine: true,
        files: true,
        messages: { orderBy: { createdAt: 'asc' } },
        acceptanceCriteria: true,
        reports: true,
      },
    });
  }

  listForAdmin(params: {
    status?: string;
    serviceId?: string;
    search?: string;
    skip?: number;
    take?: number;
  }) {
    return this.prisma.order.findMany({
      where: {
        ...(params.status ? { status: params.status as OrderStatus } : {}),
        ...(params.serviceId ? { serviceId: params.serviceId } : {}),
        ...(params.search
          ? {
              OR: [
                { code: { contains: params.search, mode: 'insensitive' } },
                { title: { contains: params.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        customer: { select: { fullName: true, phone: true } },
        serviceLine: { select: { title: true } },
        publicHandlers: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.take,
    });
  }

  async findOneForAdmin(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { select: { fullName: true, phone: true, email: true } },
        serviceLine: true,
        package: true,
        acceptanceCriteria: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
        assignments: { include: { executorProfile: true, team: true } },
        publicHandlers: true,
        milestones: true,
        files: true,
        reports: true,
        messages: { orderBy: { createdAt: 'asc' } },
        payments: true,
        escrowHolds: true,
        disputes: true,
        tickets: true,
        feedback: true,
        qcReviews: { include: { items: true } },
      },
    });
    if (!order) throw new NotFoundException('سفارش یافت نشد.');
    return order;
  }

  async addMessage(
    orderId: string,
    senderUserId: string,
    body: string,
    visibility: MessageVisibility = MessageVisibility.customer_visible,
    attachmentFileId?: string,
  ) {
    return this.prisma.orderMessage.create({
      data: { orderId, senderUserId, body, visibility, attachmentFileId },
    });
  }

  private customerOrderInclude() {
    return {
      serviceLine: true,
      package: true,
      acceptanceCriteria: true,
      statusHistory: { orderBy: { createdAt: 'asc' as const } },
      publicHandlers: { where: { visibleToCustomer: true } },
      milestones: true,
      files: {
        where: { fileKind: { in: [FileKind.output, FileKind.revision] } },
      },
      reports: { where: { visibleToCustomer: true } },
      messages: {
        where: { visibility: MessageVisibility.customer_visible },
        orderBy: { createdAt: 'asc' as const },
      },
      payments: true,
      escrowHolds: true,
      tickets: true,
      feedback: true,
    };
  }
}
