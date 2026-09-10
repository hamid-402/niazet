import { Prisma, ReportStatus, ReportType } from '@prisma/client';

export async function createVersionedOrderReport(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
    authorUserId: string;
    reportType: ReportType;
    summary: string;
    progressPercent?: number;
    fileId?: string;
    visibleToCustomer: boolean;
    status?: ReportStatus;
  },
) {
  const latest = await tx.orderReport.aggregate({
    where: { orderId: input.orderId, reportType: input.reportType },
    _max: { version: true },
  });
  return tx.orderReport.create({
    data: {
      ...input,
      version: (latest._max.version ?? 0) + 1,
      status: input.status ?? ReportStatus.published,
    },
    include: { file: true },
  });
}
