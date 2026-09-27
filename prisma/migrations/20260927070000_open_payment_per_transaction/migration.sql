-- One open payment per purchase or booking. Cancelled, failed, and refunded rows do not block a later payment.
CREATE UNIQUE INDEX "payments_open_purchase_key"
ON "payments" ("purchase_id")
WHERE "status" IN ('PENDING', 'PROCESSING', 'PAID') AND "purchase_id" IS NOT NULL;

CREATE UNIQUE INDEX "payments_open_booking_key"
ON "payments" ("booking_id")
WHERE "status" IN ('PENDING', 'PROCESSING', 'PAID') AND "booking_id" IS NOT NULL;
