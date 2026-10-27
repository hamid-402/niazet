import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CommercialRevision, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  IdempotencyService,
  requestFingerprint,
} from '../finance/idempotency.service';
import { OrderWorkflowService } from '../orders/domain/order-workflow.service';
import { calculatePrice } from './pricing-calculation';
import { calculateFormulaPrice } from './formula-price';
import {
  calculateElapsedDeadline,
  calculateSameDayWindow,
  tehranDay,
  tehranDayMinute,
} from './delivery-window';
import { readCommercialPolicy } from './commercial-policy';
import { CommercialClock } from './commercial-clock';
import {
  CapacityBucketDto,
  CommercialAdminOfferDto,
  CommercialOfferDto,
  CommercialPolicyDto,
} from './commercial.dto';

type Tx = Prisma.TransactionClient;
type Actor = { id: string; role: 'admin' | 'customer' };
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const reason = (value: string) => {
  if (!value || value.trim().length < 3)
    throw new BadRequestException('علت واقعی لازم است.');
  return value.trim();
};

@Injectable()
export class CommercialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly workflow: OrderWorkflowService,
    private readonly clock: CommercialClock,
  ) {}

  private async lockOrder(tx: Tx, orderId: string, customerId?: string) {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`,
    );
    const order = await tx.order.findFirst({
      where: { id: orderId, ...(customerId ? { customerId } : {}) },
      include: {
        serviceLine: { include: { packages: true } },
        milestones: true,
      },
    });
    if (!order) throw new NotFoundException('سفارش یافت نشد.');
    return order;
  }
  private audit(
    tx: Tx,
    actor: Actor,
    action: string,
    entityId: string,
    after: unknown,
  ) {
    return tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        actorRole: actor.role,
        action,
        entityType: 'commercial_contract',
        entityId,
        after: json(after),
        sensitivity: 'sensitive',
      },
    });
  }
  private occupied(tx: Tx, bucketId: string, now: Date) {
    return tx.capacityAllocation.count({
      where: {
        bucketId,
        reservation: {
          OR: [
            { status: 'committed' },
            {
              status: 'held',
              expiresAt: { gt: now },
              revision: {
                invalidatedAt: null,
                order: { status: { not: 'cancelled' } },
              },
            },
          ],
        },
      },
    });
  }
  private async lockReservationBuckets(tx: Tx, revisionId: string) {
    const rows = await tx.capacityAllocation.findMany({
      where: { reservation: { revisionId } },
      select: { bucketId: true },
      orderBy: { bucketId: 'asc' },
    });
    if (!rows.length) throw new ConflictException('مدرک رزرو ظرفیت کامل نیست.');
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM capacity_buckets WHERE id IN (${Prisma.join(rows.map((row) => row.bucketId))}) ORDER BY id FOR UPDATE`,
    );
  }
  private cartFingerprint(order: {
    serviceId: string;
    packageId: string | null;
    formResponses: Prisma.JsonValue;
    serviceLine: {
      isActive: boolean;
      pricingModel: string;
      basePrice: number | null;
      packages: Array<{ id: string; isActive: boolean; price: number | null }>;
    };
  }) {
    const selected = order.packageId
      ? order.serviceLine.packages.find((p) => p.id === order.packageId)
      : null;
    return requestFingerprint({
      serviceId: order.serviceId,
      packageId: order.packageId,
      formResponses: order.formResponses,
      pricingModel: order.serviceLine.pricingModel,
      active: order.serviceLine.isActive,
      basePrice: order.serviceLine.basePrice,
      selected: selected
        ? { id: selected.id, active: selected.isActive, price: selected.price }
        : null,
    });
  }
  private view(revision: CommercialRevision) {
    const snapshot = revision.snapshot as Record<string, Prisma.JsonValue>;
    return {
      id: revision.id,
      sequence: revision.sequence,
      fingerprint: revision.fingerprint,
      priority: revision.priority,
      currency: 'IRT',
      base_price: revision.basePrice,
      surcharge_pct: revision.surchargePct,
      surcharge_amount: revision.surchargeAmount,
      final_price: revision.finalPrice,
      issuedAt: revision.issuedAt,
      expiresAt: revision.expiresAt,
      acceptedAt: revision.acceptedAt,
      deadlineAt: revision.deadlineAt,
      proposedDeadlineAt:
        typeof snapshot.proposedDeadlineAt === 'string'
          ? snapshot.proposedDeadlineAt
          : null,
      deadlineNormal:
        typeof snapshot.deadlineNormal === 'string'
          ? snapshot.deadlineNormal
          : null,
      durationMode:
        revision.priority === 'same_day'
          ? 'tehran_same_day_cutoff'
          : 'elapsed_minutes',
      payableUntil: revision.payableUntil,
      invalidatedAt: revision.invalidatedAt,
    };
  }

  setPolicy(
    actor: Actor,
    serviceId: string,
    dto: CommercialPolicyDto,
    key: string,
  ) {
    const config = readCommercialPolicy(dto.config),
      note = reason(dto.reason);
    return this.idempotency.execute({
      key,
      scope: `commercial.policy:${actor.id}:${serviceId}`,
      request: dto,
      work: async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM service_lines WHERE id = ${serviceId} FOR UPDATE`,
        );
        if (!(await tx.serviceLine.count({ where: { id: serviceId } })))
          throw new NotFoundException('خدمت یافت نشد.');
        const latest = await tx.commercialPolicy.findFirst({
          where: { serviceId },
          orderBy: { version: 'desc' },
        });
        if (dto.version <= (latest?.version ?? 0))
          throw new ConflictException('نسخه باید افزایش یابد.');
        const result = await tx.commercialPolicy.create({
          data: { serviceId, version: dto.version, config: json(config) },
        });
        await this.audit(tx, actor, 'commercial.policy.created', result.id, {
          version: result.version,
          reason: note,
        });
        return result;
      },
    });
  }
  setBucket(actor: Actor, dto: CapacityBucketDto, key: string) {
    reason(dto.reason);
    tehranDayMinute(dto.day, 12 * 60);
    return this.idempotency.execute({
      key,
      scope: `commercial.bucket:${actor.id}:${dto.serviceId}:${dto.day}:${dto.skill}`,
      request: dto,
      work: async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM service_lines WHERE id = ${dto.serviceId} FOR UPDATE`,
        );
        if (!(await tx.serviceLine.count({ where: { id: dto.serviceId } })))
          throw new NotFoundException('خدمت یافت نشد.');
        const now = await this.clock.now(tx);
        if (dto.day < tehranDay(now))
          throw new BadRequestException('ظرفیت روز گذشته تغییر نمی‌کند.');
        const bucket = await tx.capacityBucket.upsert({
          where: {
            serviceId_day_skill: {
              serviceId: dto.serviceId,
              day: dto.day,
              skill: dto.skill,
            },
          },
          create: {
            serviceId: dto.serviceId,
            day: dto.day,
            skill: dto.skill,
            limit: dto.limit,
          },
          update: {},
        });
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM capacity_buckets WHERE id = ${bucket.id} FOR UPDATE`,
        );
        if (dto.limit < (await this.occupied(tx, bucket.id, now)))
          throw new ConflictException('ظرفیت کمتر از تعهد فعال نمی‌شود.');
        const updated = await tx.capacityBucket.update({
          where: { id: bucket.id },
          data: { limit: dto.limit },
        });
        await this.audit(
          tx,
          actor,
          'commercial.capacity.configured',
          bucket.id,
          { limit: dto.limit, reason: dto.reason.trim() },
        );
        return updated;
      },
    });
  }

  offer(
    actor: Actor,
    orderId: string,
    dto: CommercialOfferDto | CommercialAdminOfferDto,
    key: string,
  ) {
    return this.idempotency.execute({
      key,
      scope: `commercial.offer:${actor.id}:${orderId}`,
      request: dto,
      work: async (tx) => {
        const order = await this.lockOrder(
          tx,
          orderId,
          actor.role === 'customer' ? actor.id : undefined,
        );
        if (
          !['triaging', 'pending_quote', 'quoted', 'pending_payment'].includes(
            order.status,
          )
        )
          throw new ConflictException('تریاژ معتبر پیش از قیمت قطعی لازم است.');
        if (actor.role === 'customer' && order.status === 'pending_quote')
          throw new ConflictException(
            'این سفارش به بررسی قیمت مدیر نیاز دارد.',
          );
        if (
          await tx.payment.count({
            where: {
              orderId,
              status: { in: ['pending', 'verifying', 'succeeded'] },
            },
          })
        )
          throw new ConflictException('ابتدا پرداخت موجود تعیین تکلیف شود.');
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM service_lines WHERE id = ${order.serviceId} FOR UPDATE`,
        );
        const policy = await tx.commercialPolicy.findFirst({
          where: { serviceId: order.serviceId },
          orderBy: { version: 'desc' },
        });
        if (!policy)
          throw new ConflictException(
            'سیاست معتبر قیمت و تحویل هنوز تنظیم نشده است.',
          );
        const config = readCommercialPolicy(policy.config),
          now = await this.clock.now(tx);
        if (!order.serviceLine.isActive)
          throw new ConflictException('خدمت فعال نیست.');
        const selected = order.packageId
          ? order.serviceLine.packages.find(
              (p) => p.id === order.packageId && p.isActive,
            )
          : null;
        if (order.packageId && !selected)
          throw new ConflictException('بسته فعال نیست.');
        let price: ReturnType<typeof calculatePrice>;
        let formulaSnapshot: unknown = null;
        if (order.serviceLine.pricingModel === 'manual_quote') {
          if (
            actor.role !== 'admin' ||
            !('quotedBasePrice' in dto) ||
            dto.quotedBasePrice == null
          )
            throw new ConflictException(
              'قیمت توافقی فقط پس از پیشنهاد مدیر مجاز است.',
            );
          reason(dto.reason);
          price = calculatePrice(dto.quotedBasePrice, dto.priority);
        } else if (order.serviceLine.pricingModel === 'formula') {
          if (!config.formula)
            throw new ConflictException('فرمول معتبر موجود نیست.');
          const result = calculateFormulaPrice(
            config.formula,
            dto.inputs ?? {},
            dto.priority,
          );
          price = result;
          formulaSnapshot = {
            formula: result.formula_snapshot,
            inputs: result.inputs_snapshot,
          };
        } else {
          if (dto.inputs && Object.keys(dto.inputs).length)
            throw new BadRequestException('خدمت ثابت ورودی محاسبه ندارد.');
          const base = selected ? selected.price : order.serviceLine.basePrice;
          if (base === null)
            throw new ConflictException('قیمت پایه مشخص نیست.');
          price = calculatePrice(base, dto.priority);
        }
        if (price.final_price < 1 || price.final_price > 2_000_000_000)
          throw new ConflictException(
            'این مبلغ مسیر پرداخت خودکار معتبر ندارد؛ بررسی انسانی لازم است.',
          );
        const window = calculateSameDayWindow(
          now,
          config.sameDayEnabled,
          config.calendar,
        );
        if (
          dto.priority === 'same_day' &&
          (!window.available || order.milestones.length)
        )
          throw new ConflictException(
            'همان‌روز یا پرداخت کامل واجد شرایط نیست.',
          );
        const deadlineNormal = calculateElapsedDeadline(
          now,
          config.normalMinutes,
        )!;
        const proposedDeadline =
          dto.priority === 'same_day' && window.available
            ? window.deadlineAt
            : calculateElapsedDeadline(
                now,
                dto.priority === 'urgent'
                  ? config.urgentMinutes
                  : config.normalMinutes,
              )!;
        const expiresAt = new Date(
          Math.min(
            now.getTime() + config.quoteTtlMinutes * 60000,
            proposedDeadline.getTime(),
            dto.priority === 'same_day' && window.available
              ? window.holdExpiresAt.getTime()
              : Infinity,
          ),
        );
        const old = await tx.commercialState.findUnique({
          where: { orderId },
          include: { revision: true },
        });
        if (old) {
          await tx.commercialRevision.updateMany({
            where: { id: old.revisionId, invalidatedAt: null },
            data: { invalidatedAt: now },
          });
          await tx.capacityReservation.updateMany({
            where: { revisionId: old.revisionId, status: 'held' },
            data: { status: 'released' },
          });
        }
        const snapshot = json({
          schemaVersion: 1,
          currency: 'IRT',
          policyVersion: policy.version,
          config,
          cartFingerprint: this.cartFingerprint(order),
          formulaSnapshot,
          inputs: dto.inputs ?? {},
          customerId: order.customerId,
          serviceId: order.serviceId,
          packageId: order.packageId,
          price,
          issuedAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          proposedDeadlineAt: proposedDeadline.toISOString(),
          deadlineNormal: deadlineNormal.toISOString(),
        });
        const revision = await tx.commercialRevision.create({
          data: {
            orderId,
            policyId: policy.id,
            sequence: (old?.revision.sequence ?? 0) + 1,
            priority: dto.priority,
            basePrice: price.base_price,
            surchargePct: price.surcharge_pct,
            surchargeAmount: price.surcharge_amount,
            finalPrice: price.final_price,
            snapshot,
            fingerprint: requestFingerprint(snapshot),
            issuedAt: now,
            expiresAt,
          },
        });
        await tx.commercialState.upsert({
          where: { orderId },
          create: { orderId, revisionId: revision.id },
          update: { revisionId: revision.id },
        });
        if (order.status === 'triaging' || order.status === 'pending_quote') {
          await this.workflow.transition(
            orderId,
            'quoted',
            actor.role === 'admin' ? 'admin' : 'system',
            actor.role === 'admin' ? actor.id : null,
            'پیشنهاد نسخه‌دار قیمت؛ نیازمند پذیرش مشتری',
            { finalPrice: price.final_price, quotedAt: now },
            tx,
          );
        } else
          await tx.order.update({
            where: { id: orderId },
            data: { finalPrice: price.final_price, version: { increment: 1 } },
          });
        await this.audit(tx, actor, 'commercial.offer.created', revision.id, {
          orderId,
          fingerprint: revision.fingerprint,
          reason:
            'reason' in dto
              ? reason(dto.reason)
              : 'درخواست مشتری برای قیمت قطعی',
        });
        return this.view(revision);
      },
    });
  }

  accept(
    customerId: string,
    orderId: string,
    revisionId: string,
    fingerprint: string,
    key: string,
  ) {
    return this.idempotency.execute({
      key,
      scope: `commercial.accept:${customerId}:${orderId}`,
      request: { revisionId, fingerprint },
      work: async (tx) => {
        const order = await this.lockOrder(tx, orderId, customerId);
        const state = await tx.commercialState.findUnique({
          where: { orderId },
          include: {
            revision: { include: { policy: true, reservation: true } },
          },
        });
        const revision = state?.revision;
        if (
          !revision ||
          revision.id !== revisionId ||
          revision.fingerprint !== fingerprint ||
          revision.invalidatedAt
        )
          throw new ConflictException('نسخه یا اثرانگشت قیمت معتبر نیست.');
        const now = await this.clock.now(tx);
        if (!['quoted', 'pending_payment'].includes(order.status))
          throw new ConflictException('سفارش قابل پذیرش نیست.');
        if (revision.acceptedAt) {
          if (!revision.payableUntil || now >= revision.payableUntil)
            throw new ConflictException('پذیرش پرداخت منقضی شده است.');
          return this.view(revision);
        }
        if (now < revision.issuedAt || now >= revision.expiresAt)
          throw new ConflictException('پیشنهاد منقضی شده است.');
        const latest = await tx.commercialPolicy.findFirst({
          where: { serviceId: order.serviceId },
          orderBy: { version: 'desc' },
        });
        const snapshot = revision.snapshot as Record<string, Prisma.JsonValue>;
        if (
          latest?.id !== revision.policyId ||
          snapshot.cartFingerprint !== this.cartFingerprint(order) ||
          order.finalPrice !== revision.finalPrice
        )
          throw new ConflictException(
            'قیمت/انتخاب تغییر کرده؛ پیشنهاد تازه لازم است.',
          );
        const config = readCommercialPolicy(snapshot.config);
        if (typeof snapshot.proposedDeadlineAt !== 'string')
          throw new ConflictException('مهلت دقیق پیشنهاد ثبت نشده است.');
        let deadlineAt = new Date(snapshot.proposedDeadlineAt);
        if (!Number.isFinite(deadlineAt.getTime()) || deadlineAt <= now)
          throw new ConflictException('مهلت پیشنهاد گذشته یا نامعتبر است.');
        let payableUntil = new Date(
          Math.min(revision.expiresAt.getTime(), deadlineAt.getTime()),
        );
        if (revision.priority === 'same_day') {
          const window = calculateSameDayWindow(
            now,
            config.sameDayEnabled,
            config.calendar,
          );
          if (!window.available)
            throw new ConflictException('بازهٔ همان‌روز موجود نیست.');
          const skills = ['*', ...config.requiredSkills];
          const buckets = await tx.capacityBucket.findMany({
            where: {
              serviceId: order.serviceId,
              day: window.deliveryDay,
              skill: { in: skills },
            },
            orderBy: { id: 'asc' },
          });
          if (buckets.length !== skills.length)
            throw new ConflictException('ظرفیت روز/مهارت تأیید نشده است.');
          await tx.$queryRaw(
            Prisma.sql`SELECT id FROM capacity_buckets WHERE id IN (${Prisma.join(buckets.map((b) => b.id))}) ORDER BY id FOR UPDATE`,
          );
          const lockedNow = await this.clock.now(tx);
          const lockedWindow = calculateSameDayWindow(
            lockedNow,
            config.sameDayEnabled,
            config.calendar,
          );
          if (!lockedWindow.available || lockedNow >= revision.expiresAt)
            throw new ConflictException('مهلت رزرو گذشته است.');
          if (lockedWindow.deadlineAt.getTime() !== deadlineAt.getTime())
            throw new ConflictException(
              'روز تحویل با پیشنهاد پذیرفته‌شده یکسان نیست.',
            );
          for (const bucket of buckets)
            if ((await this.occupied(tx, bucket.id, lockedNow)) >= bucket.limit)
              throw new ConflictException('ظرفیت همان‌روز تکمیل است.');
          deadlineAt = lockedWindow.deadlineAt;
          payableUntil = new Date(
            Math.min(
              revision.expiresAt.getTime(),
              lockedWindow.holdExpiresAt.getTime(),
            ),
          );
          const reservation = await tx.capacityReservation.create({
            data: { revisionId, createdAt: lockedNow, expiresAt: payableUntil },
          });
          await tx.capacityAllocation.createMany({
            data: buckets.map((b) => ({
              reservationId: reservation.id,
              bucketId: b.id,
            })),
          });
        }
        const accepted = await tx.commercialRevision.update({
          where: { id: revisionId },
          data: { acceptedAt: now, deadlineAt, payableUntil },
        });
        if (order.status === 'quoted')
          await this.workflow.transition(
            orderId,
            'pending_payment',
            'customer',
            customerId,
            'پذیرش صریح نسخهٔ قیمت و مهلت',
            { urgency: revision.priority },
            tx,
          );
        else
          await tx.order.update({
            where: { id: orderId },
            data: { urgency: revision.priority, version: { increment: 1 } },
          });
        await this.audit(
          tx,
          { id: customerId, role: 'customer' },
          'commercial.offer.accepted',
          revisionId,
          { fingerprint, deadlineAt, payableUntil },
        );
        return this.view(accepted);
      },
    });
  }

  async current(customerId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId },
      select: { status: true },
    });
    if (!order) throw new NotFoundException('سفارش یافت نشد.');
    const state = await this.prisma.commercialState.findUnique({
      where: { orderId },
      include: {
        revision: { include: { reservation: true, paymentLinks: true } },
      },
    });
    const serverNow = await this.clock.now(this.prisma);
    return state
      ? {
          ...this.view(state.revision),
          paymentAllowed:
            !!state.revision.acceptedAt &&
            !state.revision.invalidatedAt &&
            !!state.revision.payableUntil &&
            serverNow < state.revision.payableUntil &&
            order.status === 'pending_payment',
          reservation: state.revision.reservation
            ? {
                status:
                  state.revision.reservation.status === 'held' &&
                  serverNow >= state.revision.reservation.expiresAt
                    ? 'expired'
                    : state.revision.reservation.status,
                expiresAt: state.revision.reservation.expiresAt,
              }
            : null,
          financialReviewRequired: state.revision.paymentLinks.some(
            (p) => p.financialReviewAt && !p.resolvedAt,
          ),
        }
      : null;
  }
  policy(serviceId: string) {
    return this.prisma.commercialPolicy.findFirst({
      where: { serviceId },
      orderBy: { version: 'desc' },
    });
  }

  async assertPayable(tx: Tx, orderId: string) {
    const state = await tx.commercialState.findUnique({
      where: { orderId },
      include: { revision: { include: { reservation: true } } },
    });
    if (!state) return null; // Existing orders keep their original financial contract.
    const revision = state.revision,
      now = await this.clock.now(tx);
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (
      !revision.acceptedAt ||
      now < revision.acceptedAt ||
      revision.invalidatedAt ||
      !revision.payableUntil ||
      now >= revision.payableUntil ||
      order.finalPrice !== revision.finalPrice ||
      order.urgency !== revision.priority ||
      order.status !== 'pending_payment'
    )
      throw new ConflictException(
        'قرارداد پذیرفته‌شدهٔ قابل پرداخت موجود نیست.',
      );
    if (
      revision.priority === 'same_day' &&
      (!revision.reservation ||
        revision.reservation.status !== 'held' ||
        now >= revision.reservation.expiresAt)
    )
      throw new ConflictException('رزرو معتبر نیست.');
    return revision;
  }
  async bindPayment(tx: Tx, orderId: string, paymentId: string) {
    const revision = await this.assertPayable(tx, orderId);
    if (revision)
      await tx.commercialPaymentLink.create({
        data: { paymentId, revisionId: revision.id },
      });
  }
  async gatewayVerdict(tx: Tx, paymentId: string) {
    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: {
        commercialLink: {
          include: {
            revision: { include: { reservation: true, state: true } },
          },
        },
        order: true,
        milestone: true,
      },
    });
    const link = payment.commercialLink;
    if (!link) {
      if (
        await tx.commercialState.count({ where: { orderId: payment.orderId } })
      )
        throw new ConflictException(
          'این پرداخت به نسخهٔ معتبر متصل نیست؛ بررسی مالی لازم است.',
        );
      return { kind: 'legacy' as const };
    }
    const r = link.revision;
    if (r.priority === 'same_day' && r.reservation)
      await this.lockReservationBuckets(tx, r.id);
    const now = await this.clock.now(tx);
    if (link.financialReviewAt)
      return { kind: 'recorded_review' as const, now, link };
    const valid =
      r.state?.orderId === payment.orderId &&
      r.acceptedAt &&
      now >= r.acceptedAt &&
      !r.invalidatedAt &&
      r.payableUntil &&
      now < r.payableUntil &&
      payment.order.status === 'pending_payment' &&
      payment.order.finalPrice === r.finalPrice &&
      payment.order.currency === 'IRT' &&
      payment.order.urgency === r.priority &&
      (payment.milestoneId
        ? payment.milestone?.amount === payment.amount &&
          payment.milestone.paymentStatus !== 'succeeded'
        : payment.amount === r.finalPrice) &&
      (r.priority !== 'same_day' ||
        (r.reservation?.status === 'held' && now < r.reservation.expiresAt));
    return valid
      ? { kind: 'valid' as const, now, link }
      : { kind: 'review' as const, now, link };
  }
  async commitPayment(tx: Tx, paymentId: string, verifiedAt?: Date) {
    const link = await tx.commercialPaymentLink.findUnique({
      where: { paymentId },
      include: { revision: true },
    });
    if (!link) return;
    const revision = link.revision;
    if (revision.priority === 'same_day')
      await this.lockReservationBuckets(tx, revision.id);
    const now = verifiedAt ?? (await this.clock.now(tx));
    if (
      !revision.payableUntil ||
      now >= revision.payableUntil ||
      revision.invalidatedAt
    )
      throw new ConflictException('رزرو هنگام ثبت پرداخت منقضی شد.');
    if (revision.priority === 'same_day') {
      const claimed = await tx.capacityReservation.updateMany({
        where: {
          revisionId: revision.id,
          status: 'held',
          expiresAt: { gt: now },
        },
        data: { status: 'committed', committedAt: now },
      });
      if (claimed.count !== 1)
        throw new ConflictException('رزرو هم‌زمان تغییر کرد.');
    }
  }
  release(actor: Actor, orderId: string, note: string, key: string) {
    reason(note);
    return this.idempotency.execute({
      key,
      scope: `commercial.release:${actor.id}:${orderId}`,
      request: { reason: note },
      work: async (tx) => {
        const order = await this.lockOrder(
          tx,
          orderId,
          actor.role === 'customer' ? actor.id : undefined,
        );
        const state = await tx.commercialState.findUnique({
          where: { orderId },
          include: { revision: { include: { reservation: true } } },
        });
        if (!state) return { released: false };
        if (
          await tx.payment.count({
            where: { orderId, status: { in: ['pending', 'verifying'] } },
          })
        )
          throw new ConflictException('پرداخت در حال بررسی است.');
        const reservation = state.revision.reservation;
        if (
          reservation?.status === 'committed' &&
          (actor.role !== 'admin' || order.status !== 'cancelled')
        )
          throw new ConflictException(
            'تعهد پرداخت‌شده فقط پس از لغو معتبر و فرمان Ops آزاد می‌شود.',
          );
        if (!['quoted', 'pending_payment', 'cancelled'].includes(order.status))
          throw new ConflictException('این مرحله قابل آزادسازی نیست.');
        const now = await this.clock.now(tx);
        await tx.commercialRevision.updateMany({
          where: { id: state.revisionId, invalidatedAt: null },
          data: { invalidatedAt: now },
        });
        const result = await tx.capacityReservation.updateMany({
          where: {
            revisionId: state.revisionId,
            status: { in: ['held', 'committed'] },
          },
          data: {
            status:
              reservation &&
              now >= reservation.expiresAt &&
              reservation.status === 'held'
                ? 'expired'
                : 'released',
          },
        });
        await this.audit(
          tx,
          actor,
          'commercial.capacity.released',
          state.revisionId,
          { reason: note.trim(), orderId },
        );
        return { released: result.count === 1, financialMovement: false };
      },
    });
  }
  requestRefund(
    customerId: string,
    orderId: string,
    paymentId: string,
    note: string,
    key: string,
  ) {
    reason(note);
    return this.idempotency.execute({
      key,
      scope: `commercial.refund.request:${customerId}:${paymentId}`,
      request: { orderId, reason: note },
      work: async (tx) => {
        await this.lockOrder(tx, orderId, customerId);
        const link = await tx.commercialPaymentLink.findFirst({
          where: { paymentId, payment: { orderId, customerId } },
        });
        if (!link?.financialReviewAt || link.resolvedAt)
          throw new ConflictException('پرداخت در صف رسیدگی نیست.');
        if (!link.refundRequestedAt)
          await tx.commercialPaymentLink.update({
            where: { paymentId },
            data: { refundRequestedAt: await this.clock.now(tx) },
          });
        await this.audit(
          tx,
          { id: customerId, role: 'customer' },
          'commercial.refund.requested',
          paymentId,
          { reason: note.trim(), destination: 'customer_wallet' },
        );
        return { requested: true, automaticRefund: false };
      },
    });
  }
}
