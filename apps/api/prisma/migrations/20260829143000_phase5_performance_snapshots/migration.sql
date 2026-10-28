-- Keep one deterministic performance snapshot per executor and UTC day bucket.
CREATE UNIQUE INDEX "staff_performance_snapshots_executor_profile_id_period_end_key"
ON "staff_performance_snapshots"("executor_profile_id", "period_end");
