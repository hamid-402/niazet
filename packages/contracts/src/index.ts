export const API_CONTRACT_VERSION = '1.0' as const;

export interface ApiErrorEnvelope {
  statusCode: number;
  message?: string | string[];
  error: { code: string; message: string | string[]; details?: unknown };
  correlationId: string;
  timestamp: string;
  path: string;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PageMeta;
}

export interface RequestContextHeaders {
  'x-correlation-id': string;
  'idempotency-key'?: string;
}
