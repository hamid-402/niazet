import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';
import { LedgerService } from './ledger.service';
import { tehranDateKey, tehranHour } from '../common/utils/tehran-time';

@Injectable()
export class FinanceReconciliationService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(FinanceReconciliationService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly ledger: LedgerService,
    private readonly idempotency: IdempotencyService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.runNightly(), 60 * 60 * 1000);
    this.timer.unref();
    void this.runNightly();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runNightly(force = false) {
    if (!force && tehranHour() !== 2)
      return { skipped: true, reason: 'outside_schedule' };
    const date = tehranDateKey();
    const result = await this.idempotency.execute({
      key: `reconcile-${date}`,
      scope: 'finance.wallet-ledger-reconciliation',
      request: { date },
      work: (tx) => this.ledger.verifyAllWallets(tx),
    });
    this.logger.log(
      `Wallet/ledger reconciliation ${date}: ${result.consistent ? 'OK' : 'FAILED'}`,
    );
    return result;
  }
}
