import { Injectable, NotFoundException } from '@nestjs/common';
import { FileKind, MessageVisibility, OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const EXECUTOR_FILE_SELECT = {
  id: true,
  orderId: true,
  fileKind: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  scanStatus: true,
  createdAt: true,
} as const;

@Injectable()
export class OrderQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async findOneForCustomer(customerId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: this.customerInclude(customerId),
    });
    if (!order || order.customerId !== customerId)
      throw new NotFoundException('سفارش یافت نشد.');
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
      select: {
        id: true,
        code: true,
        title: true,
        status: true,
        urgency: true,
        createdAt: true,
        updatedAt: true,
        serviceLine: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.take,
    });
  }

  async findOneForExecutor(executorUserId: string, orderId: string) {
    const assignment = await this.prisma.orderAssignment.findFirst({
      where: {
        orderId,
        unassignedAt: null,
        executorProfile: { userId: executorUserId },
      },
      select: { id: true },
    });
    if (!assignment) throw new NotFoundException('سفارش یافت نشد.');
    return this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        code: true,
        title: true,
        status: true,
        urgency: true,
        briefDescription: true,
        formResponses: true,
        confidentialityLevel: true,
        revisionsAllowed: true,
        revisionsUsed: true,
        submittedAt: true,
        assignedAt: true,
        deliveredAt: true,
        createdAt: true,
        updatedAt: true,
        serviceLine: {
          select: {
            id: true,
            slug: true,
            title: true,
            category: true,
            description: true,
            deliverables: true,
            slaHours: true,
            revisionPolicy: true,
          },
        },
        files: {
          where: {
            scanStatus: 'clean',
            purgedAt: null,
            OR: [
              { fileKind: 'input' },
              {
                uploadedByUserId: executorUserId,
                fileKind: { in: ['output', 'revision', 'report'] },
              },
            ],
          },
          orderBy: { createdAt: 'asc' },
          select: EXECUTOR_FILE_SELECT,
        },
        messages: {
          where: { visibility: MessageVisibility.customer_visible },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            messageType: true,
            body: true,
            visibility: true,
            createdAt: true,
            attachment: { select: EXECUTOR_FILE_SELECT },
          },
        },
        acceptanceCriteria: {
          select: { id: true, description: true, isMet: true },
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            fromStatus: true,
            toStatus: true,
            source: true,
            createdAt: true,
          },
        },
        milestones: {
          orderBy: { sequence: 'asc' },
          select: {
            id: true,
            sequence: true,
            title: true,
            dueAt: true,
            acceptanceCriteria: true,
            deliveryStatus: true,
            qcStatus: true,
            deliveredAt: true,
            approvedAt: true,
            createdAt: true,
          },
        },
        reports: {
          where: { authorUserId: executorUserId },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            reportType: true,
            version: true,
            summary: true,
            progressPercent: true,
            visibleToCustomer: true,
            status: true,
            createdAt: true,
            file: { select: EXECUTOR_FILE_SELECT },
          },
        },
        assignments: {
          where: { id: assignment.id },
          select: {
            id: true,
            assignmentRole: true,
            assignedAt: true,
            acceptedAt: true,
            executionChecklistItems: {
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
                label: true,
                isCompleted: true,
                completedAt: true,
                createdAt: true,
              },
            },
          },
        },
        qcReviews: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            result: true,
            comment: true,
            reviewedAt: true,
            createdAt: true,
            items: {
              select: {
                id: true,
                passed: true,
                note: true,
                checklistItem: { select: { label: true } },
              },
            },
          },
        },
      },
    });
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
    return this.prisma.order.findMany({
      where: {
        ...(params.status ? { status: params.status as OrderStatus } : {}),
        ...(params.serviceId ? { serviceId: params.serviceId } : {}),
        ...(params.search
          ? {
              OR: [
                {
                  code: {
                    contains: params.search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  title: {
                    contains: params.search,
                    mode: 'insensitive' as const,
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        customer: { select: { fullName: true, phone: true } },
        serviceLine: { select: { title: true } },
        publicHandlers: true,
      },
      orderBy: {
        [params.sortBy ?? 'createdAt']: params.sortDirection ?? 'desc',
      },
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

  private customerInclude(customerId: string) {
    return {
      serviceLine: true,
      package: true,
      acceptanceCriteria: true,
      statusHistory: { orderBy: { createdAt: 'asc' as const } },
      publicHandlers: { where: { visibleToCustomer: true, activeTo: null } },
      milestones: true,
      files: {
        where: {
          OR: [
            { uploadedByUserId: customerId },
            {
              fileKind: {
                in: [FileKind.output, FileKind.revision, FileKind.invoice],
              },
            },
          ],
          scanStatus: 'clean' as const,
        },
      },
      reports: {
        where: { visibleToCustomer: true },
        include: { file: true },
      },
      messages: {
        where: { visibility: MessageVisibility.customer_visible },
        include: { attachment: true },
        orderBy: { createdAt: 'asc' as const },
      },
      payments: true,
      escrowHolds: true,
      tickets: true,
      feedback: true,
    };
  }
}
