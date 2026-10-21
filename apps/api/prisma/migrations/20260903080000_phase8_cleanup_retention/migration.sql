CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");
CREATE INDEX "sessions_revoked_at_idx" ON "sessions"("revoked_at");
CREATE INDEX "otp_codes_expires_at_idx" ON "otp_codes"("expires_at");
CREATE INDEX "otp_codes_consumed_at_idx" ON "otp_codes"("consumed_at");
CREATE INDEX "outbox_events_status_sent_at_idx" ON "outbox_events"("status", "sent_at");
CREATE INDEX "outbox_events_status_dead_lettered_at_idx"
  ON "outbox_events"("status", "dead_lettered_at");
CREATE INDEX "background_job_runs_completed_at_idx"
  ON "background_job_runs"("completed_at");
CREATE INDEX "signed_url_grants_used_at_idx" ON "signed_url_grants"("used_at");
CREATE INDEX "signed_url_grants_revoked_at_idx"
  ON "signed_url_grants"("revoked_at");
