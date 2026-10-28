import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';

export const OUTPUT_PUBLICATION_MIGRATION =
  '20261027180000_zeus_output_publications';
type Tx = Prisma.TransactionClient;
export interface PublicationFile {
  id: string;
  orderId: string;
  fileKind: string;
  checksum: string | null;
  storageKey: string;
  sizeBytes: number;
  scanStatus: string;
  purgedAt: Date | null;
}
export interface PublicationProof {
  id: string;
  orderId: string;
  fileId: string;
  checksum: string;
  storageKey: string;
  sizeBytes: number;
  basis: string;
  releasedAt: Date | null;
  reviewerUserId: string | null;
  qcReviewId: string | null;
  reason: string | null;
  checklistSnapshot: Prisma.JsonValue;
  qcReview?: {
    result: string | null;
    reviewerUserId: string | null;
    reviewedAt: Date | null;
  } | null;
}
export function matchesPublishedVersion(
  file: PublicationFile,
  proof: PublicationProof,
): boolean {
  if (
    !['output', 'revision'].includes(file.fileKind) ||
    file.scanStatus !== 'clean' ||
    file.purgedAt
  )
    return false;
  if (
    proof.fileId !== file.id ||
    proof.orderId !== file.orderId ||
    !proof.releasedAt ||
    proof.storageKey !== file.storageKey ||
    proof.sizeBytes !== file.sizeBytes ||
    !/^[a-f0-9]{64}$/.test(proof.checksum)
  )
    return false;
  if (file.checksum !== null && file.checksum !== proof.checksum) return false;
  if (proof.basis === 'qc_passed')
    return (
      !!proof.qcReviewId &&
      !!proof.reviewerUserId &&
      proof.qcReview?.result === 'passed' &&
      proof.qcReview.reviewerUserId === proof.reviewerUserId &&
      proof.qcReview.reviewedAt?.getTime() === proof.releasedAt.getTime()
    );
  const snapshot = proof.checklistSnapshot;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot))
    return false;
  if (proof.basis === 'manual_qc')
    return (
      !!proof.reviewerUserId &&
      (proof.reason?.trim().length ?? 0) >= 3 &&
      snapshot.version === 1 &&
      Array.isArray(snapshot.items) &&
      snapshot.items.every(
        (item) =>
          !!item &&
          typeof item === 'object' &&
          !Array.isArray(item) &&
          item.passed === true,
      )
    );
  return false;
}
export async function assertCustomerOutputPublication(
  client: Tx,
  fileId: string,
  customerId: string,
  claim?: { id: string; checksum: string },
) {
  const file = await client.orderFile.findUnique({
    where: { id: fileId },
    include: {
      order: { select: { customerId: true } },
      outputPublications: {
        include: {
          qcReview: {
            select: { result: true, reviewerUserId: true, reviewedAt: true },
          },
        },
        orderBy: { releasedAt: 'desc' },
      },
    },
  });
  if (!file || file.order.customerId !== customerId)
    throw new ForbiddenException('نسخه خروجی برای این مشتری مجاز نیست.');
  const publication = file.outputPublications.find(
    (proof) =>
      matchesPublishedVersion(file, proof) &&
      (!claim || (proof.id === claim.id && proof.checksum === claim.checksum)),
  );
  if (!publication)
    throw new ForbiddenException(
      'تأیید QC این نسخه موجود نیست؛ بررسی انسانی لازم است.',
    );
  return publication;
}
export function checksumOf(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function qcManifestFingerprint(
  bindings: Array<{
    id: string;
    fileId: string;
    checksum: string;
    storageKey: string;
    sizeBytes: number;
    deliveryReportId: string | null;
  }>,
) {
  return checksumOf(
    Buffer.from(
      JSON.stringify(
        [...bindings]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((b) => [
            b.id,
            b.fileId,
            b.checksum,
            b.storageKey,
            b.sizeBytes,
            b.deliveryReportId,
          ]),
      ),
    ),
  );
}
export async function bindDeliveryOutputs(
  tx: Tx,
  input: {
    orderId: string;
    deliveryReportId: string;
    qcReviewId: string;
    fileIds: string[];
  },
) {
  const ids = [...new Set(input.fileIds)].sort();
  if (!ids.length)
    throw new ConflictException('فهرست نسخه‌های تحویل خالی است.');
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM order_files WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`,
  );
  const files = await tx.orderFile.findMany({
    where: {
      id: { in: ids },
      orderId: input.orderId,
      fileKind: 'output',
      scanStatus: 'clean',
      purgedAt: null,
    },
  });
  if (
    files.length !== ids.length ||
    files.some(
      (file) => !file.checksum || !/^[a-f0-9]{64}$/.test(file.checksum),
    )
  )
    throw new ConflictException('مدرک نسخه و checksum خروجی کامل نیست.');
  if (!input.qcReviewId)
    throw new ConflictException('مبنای بررسی نسخه مشخص نیست.');
  await tx.outputPublication.createMany({
    data: files.map((file) => ({
      orderId: input.orderId,
      fileId: file.id,
      deliveryReportId: input.deliveryReportId,
      qcReviewId: input.qcReviewId,
      checksum: file.checksum!,
      storageKey: file.storageKey,
      sizeBytes: file.sizeBytes,
      basis: 'pending_qc',
      releasedAt: null,
      checklistSnapshot: Prisma.JsonNull,
    })),
  });
}
export async function requireQcManifest(tx: Tx, reviewId: string) {
  const bindings = await tx.outputPublication.findMany({
    where: { qcReviewId: reviewId },
    include: { file: true },
  });
  if (!bindings.length)
    throw new ConflictException(
      'مدرک نسخهٔ این پرونده موجود نیست؛ ابتدا فهرست فایل‌ها باید با بررسی انسانی به پرونده متصل شود.',
    );
  if (
    bindings.some(
      (binding) =>
        binding.basis !== 'pending_qc' ||
        binding.releasedAt ||
        binding.file.scanStatus !== 'clean' ||
        binding.file.purgedAt ||
        (binding.file.checksum !== null &&
          binding.checksum !== binding.file.checksum) ||
        binding.storageKey !== binding.file.storageKey ||
        binding.sizeBytes !== binding.file.sizeBytes,
    )
  )
    throw new ConflictException(
      'نسخه یا سلامت فایل‌های این پرونده تغییر کرده است.',
    );
  return bindings;
}
export async function releaseQcManifest(tx: Tx, reviewId: string) {
  const review = await tx.qcReview.findUnique({ where: { id: reviewId } });
  if (
    !review ||
    review.result !== 'passed' ||
    !review.reviewerUserId ||
    !review.reviewedAt
  )
    throw new ConflictException('نتیجهٔ قطعی QC موجود نیست.');
  const bindings = await requireQcManifest(tx, reviewId);
  const updated = await tx.outputPublication.updateMany({
    where: { qcReviewId: reviewId, basis: 'pending_qc', releasedAt: null },
    data: {
      basis: 'qc_passed',
      reviewerUserId: review.reviewerUserId,
      releasedAt: review.reviewedAt,
    },
  });
  if (updated.count !== bindings.length)
    throw new ConflictException('انتشار هم‌زمان نسخه‌ها تکمیل نشد.');
}
