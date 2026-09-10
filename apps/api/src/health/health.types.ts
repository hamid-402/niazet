export type ReadinessStatus = 'not_ready' | 'ready';

export interface DependencyCheck {
  name: 'database' | 'email' | 'payment' | 'queue' | 'sms' | 'storage';
  status: ReadinessStatus;
  critical: boolean;
  latencyMs: number;
  details?: Record<string, boolean | number | string | null>;
  reason?: string;
}

export interface ReadinessReport {
  status: ReadinessStatus;
  checkedAt: string;
  checks: DependencyCheck[];
}
