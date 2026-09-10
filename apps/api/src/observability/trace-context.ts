import { randomBytes } from 'node:crypto';

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;
const ZERO_TRACE = '0'.repeat(32);
const ZERO_SPAN = '0'.repeat(16);

export interface TraceContext {
  traceId: string;
  spanId: string;
  traceparent: string;
}

export function createTraceContext(incoming?: string): TraceContext {
  const match = incoming?.trim().match(TRACEPARENT);
  const valid =
    match &&
    match[1].toLowerCase() !== ZERO_TRACE &&
    match[2].toLowerCase() !== ZERO_SPAN;
  const traceId = valid
    ? match[1].toLowerCase()
    : randomBytes(16).toString('hex');
  const flags = valid ? match[3] : '01';
  const spanId = randomBytes(8).toString('hex');
  return { traceId, spanId, traceparent: `00-${traceId}-${spanId}-${flags}` };
}
