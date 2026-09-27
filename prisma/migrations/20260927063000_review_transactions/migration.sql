-- AlterTable
ALTER TABLE "reviews" ADD COLUMN "booking_id" UUID,
ADD COLUMN "purchase_id" UUID;

-- DropIndex
DROP INDEX "reviews_car_id_idx";

-- CreateIndex
CREATE INDEX "favorites_user_id_created_at_idx" ON "favorites"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "reviews_car_id_status_created_at_idx" ON "reviews"("car_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_purchase_id_author_id_key" ON "reviews"("purchase_id", "author_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_booking_id_author_id_key" ON "reviews"("booking_id", "author_id");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "rental_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One completed purchase or one completed rental, and never a self-review.
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_one_transaction" CHECK (
  ("purchase_id" IS NOT NULL AND "booking_id" IS NULL)
  OR ("purchase_id" IS NULL AND "booking_id" IS NOT NULL)
);

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_not_self" CHECK ("author_id" <> "target_user_id");
