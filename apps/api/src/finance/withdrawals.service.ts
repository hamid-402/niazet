import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WithdrawalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** خارج از MVP فعلی، اما آماده برای فاز بعد (سند v4 §۱۲.۷/۲۶). */
@Injectable()
export class WithdrawalsService {
  constructor(private readonly prisma: PrismaService) {}

  async request(
    executorProfileId: string,
    amount: number,
    shabaNumber: string,
  ) {
    const profile = await this.prisma.executorProfile.findUnique({
      where: { id: executorProfileId },
      include: { user: { include: { ledgerAccount: true } } },
    });
    if (!profile) {
      throw new NotFoundException('پروفایل مجری یافت نشد.');
    }

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId: profile.userId },
    });
    if (!wallet || wallet.balance < amount) {
      throw new BadRequestException('موجودی کافی برای برداشت وجود ندارد.');
    }

    return this.prisma.withdrawal.create({
      data: {
        executorProfileId,
        amount,
        shabaNumber,
        status: WithdrawalStatus.pending,
      },
    });
  }

  listForAdmin(status?: WithdrawalStatus) {
    return this.prisma.withdrawal.findMany({
      where: status ? { status } : {},
      include: {
        executorProfile: {
          select: { displayAlias: true, publicHandlerCode: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async decide(
    id: string,
    approve: boolean,
    decidedByUserId: string,
    note?: string,
  ) {
    const withdrawal = await this.prisma.withdrawal.findUnique({
      where: { id },
    });
    if (!withdrawal) {
      throw new NotFoundException('درخواست برداشت یافت نشد.');
    }
    return this.prisma.withdrawal.update({
      where: { id },
      data: {
        status: approve ? WithdrawalStatus.approved : WithdrawalStatus.rejected,
        decidedByUserId,
        decidedAt: new Date(),
        note,
      },
    });
  }
}
