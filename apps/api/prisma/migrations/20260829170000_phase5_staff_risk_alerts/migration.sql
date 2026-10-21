CREATE TYPE "StaffRiskType" AS ENUM ('over_capacity', 'burnout_risk', 'sla_risk', 'quality_regression');
CREATE TYPE "StaffRiskSeverity" AS ENUM ('warning', 'high', 'critical');
CREATE TYPE "StaffRiskStatus" AS ENUM ('active', 'acknowledged', 'cleared');

CREATE TABLE "staff_risk_alerts" (
  "id" TEXT NOT NULL,
  "executor_profile_id" TEXT NOT NULL,
  "risk_type" "StaffRiskType" NOT NULL,
  "severity" "StaffRiskSeverity" NOT NULL,
  "status" "StaffRiskStatus" NOT NULL DEFAULT 'active',
  "evidence" JSONB,
  "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledged_at" TIMESTAMP(3),
  "acknowledged_by_user_id" TEXT,
  "acknowledgement_note" TEXT,
  "cleared_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_risk_alerts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_risk_alerts_executor_profile_id_risk_type_key"
ON "staff_risk_alerts"("executor_profile_id", "risk_type");
CREATE INDEX "staff_risk_alerts_status_severity_last_detected_at_idx"
ON "staff_risk_alerts"("status", "severity", "last_detected_at");
ALTER TABLE "staff_risk_alerts"
ADD CONSTRAINT "staff_risk_alerts_executor_profile_id_fkey"
FOREIGN KEY ("executor_profile_id") REFERENCES "executor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_risk_alerts"
ADD CONSTRAINT "staff_risk_alerts_acknowledged_by_user_id_fkey"
FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
