export const API_CONTRACT_VERSION = '1.0' as const;

export interface ApiErrorEnvelope {
  statusCode: number;
  error: {
    code: string;
    message: string | string[];
    details?: unknown;
  };
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

export function paginated<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginatedResponse<T> {
  return {
    data,
    meta: {
      page,
      pageSize,
      total,
      pageCount: Math.ceil(total / pageSize),
    },
  };
}
