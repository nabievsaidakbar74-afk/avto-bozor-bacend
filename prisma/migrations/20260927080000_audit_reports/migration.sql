-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "reports_status_created_at_idx" ON "reports"("status", "created_at");

ALTER TABLE "reports" ADD CONSTRAINT "reports_one_subject" CHECK (
  (
    (CASE WHEN "car_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "listing_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "target_user_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "review_id" IS NOT NULL THEN 1 ELSE 0 END)
  ) = 1
);
