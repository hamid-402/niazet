import { Injectable, LoggerService, LogLevel } from '@nestjs/common';
import { RequestContextService } from './request-context.service';
import { redact } from './redaction';

type StructuredLevel = 'debug' | 'error' | 'fatal' | 'info' | 'trace' | 'warn';

@Injectable()
export class StructuredLogger implements LoggerService {
  private levels = new Set<LogLevel>([
    'log',
    'error',
    'warn',
    ...(process.env.NODE_ENV === 'production'
      ? []
      : (['debug', 'verbose'] as LogLevel[])),
  ]);

  constructor(private readonly context: RequestContextService) {}

  log(message: unknown, ...optionalParams: unknown[]) {
    if (this.levels.has('log')) this.write('info', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]) {
    if (this.levels.has('error')) this.write('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]) {
    if (this.levels.has('warn')) this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]) {
    if (this.levels.has('debug')) this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]) {
    if (this.levels.has('verbose'))
      this.write('trace', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]) {
    if (this.levels.has('fatal') || this.levels.has('error'))
      this.write('fatal', message, optionalParams);
  }

  setLogLevels(levels: LogLevel[]) {
    this.levels = new Set(levels);
  }

  event(
    level: StructuredLevel,
    event: string,
    data: Record<string, unknown> = {},
  ) {
    this.write(level, event, [data, 'Observability']);
  }

  private write(
    level: StructuredLevel,
    message: unknown,
    optionalParams: unknown[],
  ) {
    const params = [...optionalParams];
    const possibleContext = params.at(-1);
    const source =
      typeof possibleContext === 'string' ? String(params.pop()) : undefined;
    const request = this.context.get();
    const record = redact({
      timestamp: new Date().toISOString(),
      level,
      service: 'niazat-api',
      environment: process.env.NODE_ENV ?? 'development',
      event: typeof message === 'string' ? message : 'application.log',
      source,
      correlationId: request?.correlationId,
      traceId: request?.traceId,
      spanId: request?.spanId,
      data: typeof message === 'string' ? params : [message, ...params],
    });
    const line = `${JSON.stringify(record)}\n`;
    (level === 'error' || level === 'fatal'
      ? process.stderr
      : process.stdout
    ).write(line);
  }
}
