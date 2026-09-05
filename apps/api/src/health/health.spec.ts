import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { MockPaymentGateway } from '../finance/payment-gateway';
import {
  EmailService,
  MockEmailProvider,
} from '../notifications/email.service';
import { MockSmsProvider, SmsService } from '../notifications/sms.service';
import { HealthController } from './health.controller';
import { evaluateQueue, HealthService } from './health.service';
import type { ReadinessReport } from './health.types';

describe('readiness policies', () => {
  const thresholds = {
    maxDeadLetters24h: 10,
    maxPending: 1_000,
    maxPendingAgeSeconds: 900,
    production: true,
  };

  it('keeps a healthy queue ready', () => {
    expect(
      evaluateQueue(
        {
          backgroundEnabled: true,
          deadLetters24h: 0,
          oldestPendingAgeSeconds: 30,
          pending: 5,
          staleLocks: 0,
        },
        thresholds,
      ),
    ).toMatchObject({ status: 'ready' });
  });

  it.each([
    ['backlog', { pending: 1_001 }, 'queue_backlog'],
    ['age', { oldestPendingAgeSeconds: 901 }, 'queue_age'],
    ['stale lock', { staleLocks: 1 }, 'stale_locks'],
    ['dead letters', { deadLetters24h: 11 }, 'dead_letters'],
    ['disabled workers', { backgroundEnabled: false }, 'workers_disabled'],
  ])('marks %s as not ready', (_name, change, reason) => {
    const result = evaluateQueue(
      {
        backgroundEnabled: true,
        deadLetters24h: 0,
        oldestPendingAgeSeconds: 30,
        pending: 5,
        staleLocks: 0,
        ...change,
      },
      thresholds,
    );
    expect(result).toMatchObject({ status: 'not_ready' });
    expect(result.reason).toContain(reason);
  });

  it('fails closed when a configured provider has no active adapter', () => {
    const config = new ConfigService({
      SMS_DRIVER: 'external-sms',
      EMAIL_DRIVER: 'external-email',
      PAYMENT_GATEWAY_DRIVER: 'external-payment',
    });
    expect(
      new SmsService(config, new MockSmsProvider()).readiness(),
    ).toMatchObject({
      status: 'not_ready',
      reason: 'configured_driver_is_not_implemented',
    });
    expect(
      new EmailService(config, new MockEmailProvider()).readiness(),
    ).toMatchObject({
      status: 'not_ready',
      reason: 'configured_driver_is_not_implemented',
    });
    expect(new MockPaymentGateway(config).readiness()).toMatchObject({
      status: 'not_ready',
      reason: 'configured_driver_is_not_implemented',
    });
  });

  it('returns HTTP 503 from the public readiness route when a dependency fails', async () => {
    const report: ReadinessReport = {
      status: 'not_ready',
      checkedAt: new Date(0).toISOString(),
      checks: [
        {
          name: 'database',
          status: 'not_ready',
          critical: true,
          latencyMs: 3,
          reason: 'probe_failed_or_timed_out',
        },
      ],
    };
    const health = {
      readiness: jest.fn().mockResolvedValue(report),
    } as unknown as HealthService;
    const status = jest.fn();
    const response = { status } as unknown as Response;
    const result = await new HealthController(health).readiness(response);
    expect(status).toHaveBeenCalledWith(503);
    expect(result).toMatchObject({
      status: 'not_ready',
      checks: { database: 'not_ready' },
    });
  });
});
