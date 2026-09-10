import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { createConnection } from 'node:net';

export type ScanResult =
  { status: 'clean' } | { status: 'infected'; signature: string };

const INSTREAM_COMMAND = Buffer.from('zINSTREAM\0', 'ascii');
const STREAM_END = Buffer.alloc(4);

function parseClamAvResponse(response: string): ScanResult {
  const normalized = response.replace(/\0/g, '').trim();
  if (normalized.endsWith('OK')) return { status: 'clean' };

  const infected = normalized.match(/: (.+) FOUND$/);
  if (infected?.[1]) {
    return { status: 'infected', signature: infected[1] };
  }
  throw new Error(`Unexpected ClamAV response: ${normalized || '<empty>'}`);
}

export function scanBufferWithClamAv(params: {
  buffer: Buffer;
  host: string;
  port: number;
  timeoutMs: number;
}): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: params.host, port: params.port });
    const response: Buffer[] = [];
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) {
        reject(error);
        return;
      }
      try {
        resolve(parseClamAvResponse(Buffer.concat(response).toString('utf8')));
      } catch (parseError) {
        reject(
          parseError instanceof Error
            ? parseError
            : new Error('Invalid ClamAV response.'),
        );
      }
    };

    socket.setTimeout(params.timeoutMs);
    socket.on('timeout', () => finish(new Error('ClamAV scan timed out.')));
    socket.on('error', (error) => finish(error));
    socket.on('data', (chunk: Buffer) => response.push(chunk));
    socket.on('end', () => finish());
    socket.on('connect', () => {
      const chunkLength = Buffer.alloc(4);
      chunkLength.writeUInt32BE(params.buffer.length);
      socket.write(INSTREAM_COMMAND);
      socket.write(chunkLength);
      socket.write(params.buffer);
      socket.end(STREAM_END);
    });
  });
}

@Injectable()
export class AntivirusService {
  constructor(private readonly config: ConfigService) {}

  async scan(buffer: Buffer): Promise<ScanResult> {
    const driver = this.config.get<string>('FILE_SCAN_DRIVER') ?? 'mock';
    if (driver === 'mock') return { status: 'clean' };
    if (driver !== 'clamav') {
      throw new ServiceUnavailableException(
        'درایور اسکن فایل پشتیبانی نمی‌شود.',
      );
    }

    try {
      return await scanBufferWithClamAv({
        buffer,
        host: this.config.get<string>('CLAMAV_HOST') ?? '127.0.0.1',
        port: Number(this.config.get<string>('CLAMAV_PORT') ?? 3310),
        timeoutMs: Number(
          this.config.get<string>('CLAMAV_TIMEOUT_MS') ?? 15_000,
        ),
      });
    } catch {
      // Fail closed: an unavailable scanner must never make a file downloadable.
      throw new ServiceUnavailableException(
        'سرویس بررسی امنیت فایل در دسترس نیست. کمی بعد دوباره تلاش کنید.',
      );
    }
  }
}
