/*
  Warnings:

  - You are about to drop the column `is_active` on the `users` table. All the data in the column will be lost.
  - Made the column `phone` on table `users` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'BLOCKED', 'PENDING');

-- CreateEnum
CREATE TYPE "fuel_type" AS ENUM ('PETROL', 'DIESEL', 'GAS', 'HYBRID', 'ELECTRIC');

-- CreateEnum
CREATE TYPE "transmission" AS ENUM ('MANUAL', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "body_type" AS ENUM ('SEDAN', 'HATCHBACK', 'SUV', 'COUPE', 'WAGON', 'MINIVAN', 'PICKUP', 'VAN', 'CONVERTIBLE');

-- CreateEnum
CREATE TYPE "car_status" AS ENUM ('DRAFT', 'PENDING_MODERATION', 'AVAILABLE', 'RESERVED', 'SOLD', 'RENTED', 'INACTIVE', 'REJECTED');

-- CreateEnum
CREATE TYPE "listing_type" AS ENUM ('SALE', 'RENT');

-- CreateEnum
CREATE TYPE "listing_status" AS ENUM ('DRAFT', 'PENDING_MODERATION', 'PUBLISHED', 'PAUSED', 'SOLD', 'RENTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "purchase_status" AS ENUM ('PENDING', 'CONFIRMED', 'PAID', 'COMPLETED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "rental_booking_status" AS ENUM ('PENDING', 'CONFIRMED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "review_status" AS ENUM ('PENDING', 'PUBLISHED', 'HIDDEN', 'REJECTED');

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('PURCHASE', 'SALE', 'RENTAL', 'BOOKING', 'LISTING', 'MODERATION', 'SYSTEM');

-- CreateEnum
CREATE TYPE "report_status" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED');

-- AlterTable
ALTER TABLE "users" DROP COLUMN "is_active",
ADD COLUMN     "avatar" VARCHAR(512),
ADD COLUMN     "status" "user_status" NOT NULL DEFAULT 'PENDING',
ALTER COLUMN "phone" SET NOT NULL;

-- CreateTable
CREATE TABLE "cars" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "brand" VARCHAR(80) NOT NULL,
    "model" VARCHAR(80) NOT NULL,
    "year" INTEGER NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "daily_rental_price" DECIMAL(14,2),
    "mileage" INTEGER NOT NULL,
    "fuel_type" "fuel_type" NOT NULL,
    "transmission" "transmission" NOT NULL,
    "body_type" "body_type" NOT NULL,
    "color" VARCHAR(40) NOT NULL,
    "engine" VARCHAR(80) NOT NULL,
    "description" TEXT NOT NULL,
    "location" VARCHAR(120) NOT NULL,
    "status" "car_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car_images" (
    "id" UUID NOT NULL,
    "car_id" UUID NOT NULL,
    "url" VARCHAR(1024) NOT NULL,
    "storage_key" VARCHAR(512) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "car_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" UUID NOT NULL,
    "car_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "type" "listing_type" NOT NULL,
    "status" "listing_status" NOT NULL DEFAULT 'DRAFT',
    "sale_price" DECIMAL(14,2),
    "rental_daily_price" DECIMAL(14,2),
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" UUID NOT NULL,
    "buyer_id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "car_id" UUID NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "status" "purchase_status" NOT NULL DEFAULT 'PENDING',
    "completed_car_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_bookings" (
    "id" UUID NOT NULL,
    "car_id" UUID NOT NULL,
    "renter_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "start_date" TIMESTAMPTZ(6) NOT NULL,
    "end_date" TIMESTAMPTZ(6) NOT NULL,
    "daily_price" DECIMAL(14,2) NOT NULL,
    "total_price" DECIMAL(14,2) NOT NULL,
    "status" "rental_booking_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rental_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purchase_id" UUID,
    "booking_id" UUID,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'UZS',
    "status" "payment_status" NOT NULL DEFAULT 'PENDING',
    "provider" VARCHAR(40) NOT NULL,
    "provider_transaction_id" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "car_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "target_user_id" UUID NOT NULL,
    "car_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "status" "review_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "notification_type" NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "message" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "target_user_id" UUID,
    "car_id" UUID,
    "listing_id" UUID,
    "review_id" UUID,
    "reason" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL,
    "status" "report_status" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(120) NOT NULL,
    "resource" VARCHAR(80) NOT NULL,
    "resource_id" VARCHAR(64),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip" VARCHAR(45),
    "user_agent" VARCHAR(512),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cars_owner_id_idx" ON "cars"("owner_id");

-- CreateIndex
CREATE INDEX "cars_status_price_idx" ON "cars"("status", "price");

-- CreateIndex
CREATE INDEX "cars_status_created_at_idx" ON "cars"("status", "created_at");

-- CreateIndex
CREATE INDEX "cars_brand_model_idx" ON "cars"("brand", "model");

-- CreateIndex
CREATE INDEX "cars_location_idx" ON "cars"("location");

-- CreateIndex
CREATE UNIQUE INDEX "car_images_storage_key_key" ON "car_images"("storage_key");

-- CreateIndex
CREATE INDEX "car_images_car_id_sort_order_idx" ON "car_images"("car_id", "sort_order");

-- CreateIndex
CREATE INDEX "listings_car_id_idx" ON "listings"("car_id");

-- CreateIndex
CREATE INDEX "listings_owner_id_idx" ON "listings"("owner_id");

-- CreateIndex
CREATE INDEX "listings_type_status_idx" ON "listings"("type", "status");

-- CreateIndex
CREATE INDEX "listings_status_expires_at_idx" ON "listings"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_completed_car_id_key" ON "purchases"("completed_car_id");

-- CreateIndex
CREATE INDEX "purchases_buyer_id_idx" ON "purchases"("buyer_id");

-- CreateIndex
CREATE INDEX "purchases_seller_id_idx" ON "purchases"("seller_id");

-- CreateIndex
CREATE INDEX "purchases_car_id_status_idx" ON "purchases"("car_id", "status");

-- CreateIndex
CREATE INDEX "rental_bookings_car_id_start_date_end_date_idx" ON "rental_bookings"("car_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "rental_bookings_renter_id_idx" ON "rental_bookings"("renter_id");

-- CreateIndex
CREATE INDEX "rental_bookings_owner_id_idx" ON "rental_bookings"("owner_id");

-- CreateIndex
CREATE INDEX "rental_bookings_status_idx" ON "rental_bookings"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_transaction_id_key" ON "payments"("provider_transaction_id");

-- CreateIndex
CREATE INDEX "payments_user_id_idx" ON "payments"("user_id");

-- CreateIndex
CREATE INDEX "payments_purchase_id_idx" ON "payments"("purchase_id");

-- CreateIndex
CREATE INDEX "payments_booking_id_idx" ON "payments"("booking_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "favorites_car_id_idx" ON "favorites"("car_id");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_user_id_car_id_key" ON "favorites"("user_id", "car_id");

-- CreateIndex
CREATE INDEX "reviews_author_id_idx" ON "reviews"("author_id");

-- CreateIndex
CREATE INDEX "reviews_target_user_id_idx" ON "reviews"("target_user_id");

-- CreateIndex
CREATE INDEX "reviews_car_id_idx" ON "reviews"("car_id");

-- CreateIndex
CREATE INDEX "reviews_status_idx" ON "reviews"("status");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_created_at_idx" ON "notifications"("user_id", "is_read", "created_at");

-- CreateIndex
CREATE INDEX "reports_reporter_id_idx" ON "reports"("reporter_id");

-- CreateIndex
CREATE INDEX "reports_target_user_id_idx" ON "reports"("target_user_id");

-- CreateIndex
CREATE INDEX "reports_car_id_idx" ON "reports"("car_id");

-- CreateIndex
CREATE INDEX "reports_listing_id_idx" ON "reports"("listing_id");

-- CreateIndex
CREATE INDEX "reports_review_id_idx" ON "reports"("review_id");

-- CreateIndex
CREATE INDEX "reports_status_idx" ON "reports"("status");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_resource_resource_id_idx" ON "audit_logs"("resource", "resource_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- AddForeignKey
ALTER TABLE "cars" ADD CONSTRAINT "cars_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_images" ADD CONSTRAINT "car_images_car_id_fkey" FOREIGN KEY ("car_id") REFERENCES "cars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_car_id_fkey" FOREIGN KEY ("car_id") REFERENCES "cars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_car_id_fkey" FOREIGN KEY ("car_id") REFERENCES "cars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_bookings" ADD CONSTRAINT "rental_bookings_car_id_fkey" FOREIGN KEY ("car_id") REFERENCES "cars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_bookings" ADD CONSTRAINT "rental_bookings_renter_id_fkey" FOREIGN KEY ("renter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_bookings" ADD CONSTRAINT "rental_bookings_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "rental_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_car_id_fkey" FOREIGN KEY ("car_id") REFERENCES "cars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_car_id_fkey" FOREIGN KEY ("car_id") REFERENCES "cars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_car_id_fkey" FOREIGN KEY ("car_id") REFERENCES "cars"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A completed purchase must point at its car, and only completed purchases do.
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_completed_car_check" CHECK (
  ("status" = 'COMPLETED' AND "completed_car_id" = "car_id")
  OR
  ("status" <> 'COMPLETED' AND "completed_car_id" IS NULL)
);

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_range" CHECK ("rating" >= 1 AND "rating" <= 5);

ALTER TABLE "rental_bookings" ADD CONSTRAINT "rental_bookings_date_order" CHECK ("end_date" > "start_date");

ALTER TABLE "payments" ADD CONSTRAINT "payments_one_subject" CHECK (
  (("purchase_id" IS NOT NULL)::integer + ("booking_id" IS NOT NULL)::integer) = 1
);
