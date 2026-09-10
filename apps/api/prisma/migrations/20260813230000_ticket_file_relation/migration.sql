-- Phase 4: make ticket attachments first-class, referentially safe order files.
CREATE INDEX "ticket_messages_attachment_file_id_idx"
  ON "ticket_messages"("attachment_file_id");

ALTER TABLE "ticket_messages"
  ADD CONSTRAINT "ticket_messages_attachment_file_id_fkey"
  FOREIGN KEY ("attachment_file_id") REFERENCES "order_files"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
