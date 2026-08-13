import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { JobDefinition, JobName, JobResult } from './job.types';

export function createJobRunKey(name: JobName, now: Date, intervalMs: number) {
  return `${name}:${Math.floor(now.getTime() / intervalMs)}`;
}

@Injectable()
export class JobRunnerService implements OnModuleDestroy {
  private readonly logger = new Logger(JobRunnerService.name);
  private readonly jobs = new Map<JobName, JobDefinition>();
  private readonly timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  register(definition: JobDefinition) {
    if (this.jobs.has(definition.name)) {
      throw new Error(`Job ${definition.name} is already registered.`);
    }
    this.jobs.set(definition.name, definition);
  }

  start() {
    if (this.timers.length > 0) return;
    if (
      this.config.get<string>('NODE_ENV') === 'test' ||
      this.config.get('BACKGROUND_JOBS_ENABLED') === false ||
      this.config.get<string>('BACKGROUND_JOBS_ENABLED') === 'false'
    ) {
      return;
    }
    for (const job of this.jobs.values()) {
      const timer = setInterval(() => void this.run(job.name), job.intervalMs);
      timer.unref();
      this.timers.push(timer);
    }
  }

  onModuleDestroy() {
    for (const timer of this.timers) clearInterval(timer);
  }

  async run(name: JobName, now = new Date()): Promise<JobResult> {
    const job = this.jobs.get(name);
    if (!job) throw new Error(`Job ${name} is not registered.`);
    const runKey = createJobRunKey(name, now, job.intervalMs);
    try {
      const run = await this.prisma.backgroundJobRun.create({
        data: { jobName: name, runKey },
      });
      try {
        const result = await job.run(now);
        await this.prisma.backgroundJobRun.update({
          where: { id: run.id },
          data: {
            status: 'succeeded',
            result: result as unknown as Prisma.InputJsonValue,
            completedAt: new Date(),
          },
        });
        return result;
      } catch (error) {
        await this.prisma.backgroundJobRun.update({
          where: { id: run.id },
          data: {
            status: 'failed',
            lastError: this.errorMessage(error),
            completedAt: new Date(),
          },
        });
        throw error;
      }
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { processed: 0, skipped: 1, details: { reason: 'already_run' } };
      }
      throw error;
    }
  }

  list() {
    return [...this.jobs.values()].map(({ name, intervalMs }) => ({
      name,
      intervalMs,
    }));
  }

  private errorMessage(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(message);
    return message.slice(0, 2_000);
  }
}
