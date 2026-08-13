import { BadRequestException, Injectable } from '@nestjs/common';
import { MessageVisibility } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OrderMessagingService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    orderId: string;
    senderUserId: string;
    body: string;
    visibility: MessageVisibility;
    attachmentFileId?: string;
    requireUploaderOwnership: boolean;
  }) {
    if (input.attachmentFileId) {
      const attachment = await this.prisma.orderFile.findFirst({
        where: {
          id: input.attachmentFileId,
          orderId: input.orderId,
          ...(input.requireUploaderOwnership
            ? { uploadedByUserId: input.senderUserId }
            : {}),
          scanStatus: 'clean',
        },
        select: { id: true },
      });
      if (!attachment)
        throw new BadRequestException('پیوست باید فایل امن همان سفارش باشد.');
    }
    return this.prisma.orderMessage.create({
      data: {
        orderId: input.orderId,
        senderUserId: input.senderUserId,
        body: input.body,
        visibility: input.visibility,
        attachmentFileId: input.attachmentFileId,
      },
    });
  }
}
