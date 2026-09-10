CREATE TYPE "AttendanceStatus" AS ENUM (
  'present',
  'remote',
  'leave',
  'sick_leave',
  'absent'
);

CREATE TABLE "staff_attendance_records" (
  "id" TEXT NOT NULL,
  "executor_profile_id" TEXT NOT NULL,
  "work_date" DATE NOT NULL,
  "status" "AttendanceStatus" NOT NULL,
  "note" TEXT,
  "recorded_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_attendance_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "staff_attendance_records_executor_profile_id_fkey"
    FOREIGN KEY ("executor_profile_id") REFERENCES "executor_profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "staff_attendance_records_recorded_by_user_id_fkey"
    FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "staff_attendance_records_executor_profile_id_work_date_key"
  ON "staff_attendance_records"("executor_profile_id", "work_date");

CREATE INDEX "staff_attendance_records_work_date_status_idx"
  ON "staff_attendance_records"("work_date", "status");
