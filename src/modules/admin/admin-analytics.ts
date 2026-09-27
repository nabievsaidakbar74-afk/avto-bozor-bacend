import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";

export const analyticsPeriods = ["7d", "30d", "90d", "1y"] as const;
export type AnalyticsPeriod = (typeof analyticsPeriods)[number];

type CountRow = {
  date: string;
  count: number;
  revenue: string;
};

type RevenueRow = {
  date: string;
  sales_revenue: string;
  rental_revenue: string;
};

export type CountPoint = {
  date: string;
  count: number;
};

export type CountRevenuePoint = CountPoint & {
  revenue: string;
};

export type RevenuePoint = {
  date: string;
  salesRevenue: string;
  rentalRevenue: string;
  totalRevenue: string;
};

function money(value: string): string {
  return new Prisma.Decimal(value).toFixed(2);
}

function daySpan(period: Exclude<AnalyticsPeriod, "1y">): number {
  if (period === "7d") {
    return 6;
  }
  if (period === "90d") {
    return 89;
  }
  return 29;
}

export async function salesSeries(period: AnalyticsPeriod): Promise<CountRevenuePoint[]> {
  const rows =
    period === "1y"
      ? await PrismaService.client().$queryRaw<CountRow[]>`
          WITH buckets AS (
            SELECT generate_series(
              date_trunc('month', timezone('UTC', now())) - (11 * INTERVAL '1 month'),
              date_trunc('month', timezone('UTC', now())),
              INTERVAL '1 month'
            ) AS bucket
          )
          SELECT
            to_char(buckets.bucket, 'YYYY-MM') AS date,
            COALESCE(agg.total, 0)::int AS count,
            COALESCE(agg.revenue, 0)::text AS revenue
          FROM buckets
          LEFT JOIN (
            SELECT
              date_trunc('month', timezone('UTC', created_at)) AS bucket,
              COUNT(*)::int AS total,
              COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN price ELSE 0 END), 0) AS revenue
            FROM purchases
            WHERE created_at >= date_trunc('month', timezone('UTC', now())) - (11 * INTERVAL '1 month')
            GROUP BY 1
          ) agg ON agg.bucket = buckets.bucket
          ORDER BY buckets.bucket
        `
      : await PrismaService.client().$queryRaw<CountRow[]>`
          WITH buckets AS (
            SELECT generate_series(
              date_trunc('day', timezone('UTC', now())) - (${daySpan(period)} * INTERVAL '1 day'),
              date_trunc('day', timezone('UTC', now())),
              INTERVAL '1 day'
            ) AS bucket
          )
          SELECT
            to_char(buckets.bucket, 'YYYY-MM-DD') AS date,
            COALESCE(agg.total, 0)::int AS count,
            COALESCE(agg.revenue, 0)::text AS revenue
          FROM buckets
          LEFT JOIN (
            SELECT
              date_trunc('day', timezone('UTC', created_at)) AS bucket,
              COUNT(*)::int AS total,
              COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN price ELSE 0 END), 0) AS revenue
            FROM purchases
            WHERE created_at >= date_trunc('day', timezone('UTC', now())) - (${daySpan(period)} * INTERVAL '1 day')
            GROUP BY 1
          ) agg ON agg.bucket = buckets.bucket
          ORDER BY buckets.bucket
        `;
  return rows.map((row) => ({ date: row.date, count: Number(row.count), revenue: money(row.revenue) }));
}

export async function rentalSeries(period: AnalyticsPeriod): Promise<CountRevenuePoint[]> {
  const rows =
    period === "1y"
      ? await PrismaService.client().$queryRaw<CountRow[]>`
          WITH buckets AS (
            SELECT generate_series(
              date_trunc('month', timezone('UTC', now())) - (11 * INTERVAL '1 month'),
              date_trunc('month', timezone('UTC', now())),
              INTERVAL '1 month'
            ) AS bucket
          )
          SELECT
            to_char(buckets.bucket, 'YYYY-MM') AS date,
            COALESCE(agg.total, 0)::int AS count,
            COALESCE(agg.revenue, 0)::text AS revenue
          FROM buckets
          LEFT JOIN (
            SELECT
              date_trunc('month', timezone('UTC', created_at)) AS bucket,
              COUNT(*)::int AS total,
              COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN total_price ELSE 0 END), 0) AS revenue
            FROM rental_bookings
            WHERE created_at >= date_trunc('month', timezone('UTC', now())) - (11 * INTERVAL '1 month')
            GROUP BY 1
          ) agg ON agg.bucket = buckets.bucket
          ORDER BY buckets.bucket
        `
      : await PrismaService.client().$queryRaw<CountRow[]>`
          WITH buckets AS (
            SELECT generate_series(
              date_trunc('day', timezone('UTC', now())) - (${daySpan(period)} * INTERVAL '1 day'),
              date_trunc('day', timezone('UTC', now())),
              INTERVAL '1 day'
            ) AS bucket
          )
          SELECT
            to_char(buckets.bucket, 'YYYY-MM-DD') AS date,
            COALESCE(agg.total, 0)::int AS count,
            COALESCE(agg.revenue, 0)::text AS revenue
          FROM buckets
          LEFT JOIN (
            SELECT
              date_trunc('day', timezone('UTC', created_at)) AS bucket,
              COUNT(*)::int AS total,
              COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN total_price ELSE 0 END), 0) AS revenue
            FROM rental_bookings
            WHERE created_at >= date_trunc('day', timezone('UTC', now())) - (${daySpan(period)} * INTERVAL '1 day')
            GROUP BY 1
          ) agg ON agg.bucket = buckets.bucket
          ORDER BY buckets.bucket
        `;
  return rows.map((row) => ({ date: row.date, count: Number(row.count), revenue: money(row.revenue) }));
}

export async function userSeries(period: AnalyticsPeriod): Promise<CountPoint[]> {
  const rows =
    period === "1y"
      ? await PrismaService.client().$queryRaw<Array<{ date: string; count: number }>>`
          WITH buckets AS (
            SELECT generate_series(
              date_trunc('month', timezone('UTC', now())) - (11 * INTERVAL '1 month'),
              date_trunc('month', timezone('UTC', now())),
              INTERVAL '1 month'
            ) AS bucket
          )
          SELECT
            to_char(buckets.bucket, 'YYYY-MM') AS date,
            COALESCE(agg.total, 0)::int AS count
          FROM buckets
          LEFT JOIN (
            SELECT date_trunc('month', timezone('UTC', created_at)) AS bucket, COUNT(*)::int AS total
            FROM users
            WHERE created_at >= date_trunc('month', timezone('UTC', now())) - (11 * INTERVAL '1 month')
            GROUP BY 1
          ) agg ON agg.bucket = buckets.bucket
          ORDER BY buckets.bucket
        `
      : await PrismaService.client().$queryRaw<Array<{ date: string; count: number }>>`
          WITH buckets AS (
            SELECT generate_series(
              date_trunc('day', timezone('UTC', now())) - (${daySpan(period)} * INTERVAL '1 day'),
              date_trunc('day', timezone('UTC', now())),
              INTERVAL '1 day'
            ) AS bucket
          )
          SELECT
            to_char(buckets.bucket, 'YYYY-MM-DD') AS date,
            COALESCE(agg.total, 0)::int AS count
          FROM buckets
          LEFT JOIN (
            SELECT date_trunc('day', timezone('UTC', created_at)) AS bucket, COUNT(*)::int AS total
            FROM users
            WHERE created_at >= date_trunc('day', timezone('UTC', now())) - (${daySpan(period)} * INTERVAL '1 day')
            GROUP BY 1
          ) agg ON agg.bucket = buckets.bucket
          ORDER BY buckets.bucket
        `;
  return rows.map((row) => ({ date: row.date, count: Number(row.count) }));
}

export async function revenueSeries(period: AnalyticsPeriod): Promise<RevenuePoint[]> {
  const rows =
    period === "1y"
      ? await PrismaService.client().$queryRaw<RevenueRow[]>`
          WITH buckets AS (
            SELECT generate_series(
              date_trunc('month', timezone('UTC', now())) - (11 * INTERVAL '1 month'),
              date_trunc('month', timezone('UTC', now())),
              INTERVAL '1 month'
            ) AS bucket
          )
          SELECT
            to_char(buckets.bucket, 'YYYY-MM') AS date,
            COALESCE(sales.revenue, 0)::text AS sales_revenue,
            COALESCE(rentals.revenue, 0)::text AS rental_revenue
          FROM buckets
          LEFT JOIN (
            SELECT
              date_trunc('month', timezone('UTC', created_at)) AS bucket,
              COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN price ELSE 0 END), 0) AS revenue
            FROM purchases
            WHERE created_at >= date_trunc('month', timezone('UTC', now())) - (11 * INTERVAL '1 month')
            GROUP BY 1
          ) sales ON sales.bucket = buckets.bucket
          LEFT JOIN (
            SELECT
              date_trunc('month', timezone('UTC', created_at)) AS bucket,
              COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN total_price ELSE 0 END), 0) AS revenue
            FROM rental_bookings
            WHERE created_at >= date_trunc('month', timezone('UTC', now())) - (11 * INTERVAL '1 month')
            GROUP BY 1
          ) rentals ON rentals.bucket = buckets.bucket
          ORDER BY buckets.bucket
        `
      : await PrismaService.client().$queryRaw<RevenueRow[]>`
          WITH buckets AS (
            SELECT generate_series(
              date_trunc('day', timezone('UTC', now())) - (${daySpan(period)} * INTERVAL '1 day'),
              date_trunc('day', timezone('UTC', now())),
              INTERVAL '1 day'
            ) AS bucket
          )
          SELECT
            to_char(buckets.bucket, 'YYYY-MM-DD') AS date,
            COALESCE(sales.revenue, 0)::text AS sales_revenue,
            COALESCE(rentals.revenue, 0)::text AS rental_revenue
          FROM buckets
          LEFT JOIN (
            SELECT
              date_trunc('day', timezone('UTC', created_at)) AS bucket,
              COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN price ELSE 0 END), 0) AS revenue
            FROM purchases
            WHERE created_at >= date_trunc('day', timezone('UTC', now())) - (${daySpan(period)} * INTERVAL '1 day')
            GROUP BY 1
          ) sales ON sales.bucket = buckets.bucket
          LEFT JOIN (
            SELECT
              date_trunc('day', timezone('UTC', created_at)) AS bucket,
              COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN total_price ELSE 0 END), 0) AS revenue
            FROM rental_bookings
            WHERE created_at >= date_trunc('day', timezone('UTC', now())) - (${daySpan(period)} * INTERVAL '1 day')
            GROUP BY 1
          ) rentals ON rentals.bucket = buckets.bucket
          ORDER BY buckets.bucket
        `;
  return rows.map((row) => {
    const salesRevenue = new Prisma.Decimal(row.sales_revenue);
    const rentalRevenue = new Prisma.Decimal(row.rental_revenue);
    return {
      date: row.date,
      salesRevenue: salesRevenue.toFixed(2),
      rentalRevenue: rentalRevenue.toFixed(2),
      totalRevenue: salesRevenue.add(rentalRevenue).toFixed(2),
    };
  });
}

type SummaryRow = {
  totalUsers: number;
  activeUsers: number;
  blockedUsers: number;
  totalCars: number;
  publishedListings: number;
  pendingListings: number;
  soldCars: number;
  rentedCars: number;
  totalSales: number;
  completedSales: number;
  activeRentals: number;
  completedRentals: number;
  pendingBookings: number;
  salesRevenue: string;
  rentalRevenue: string;
};

export async function dashboardSummary(): Promise<SummaryRow & { totalRevenue: string }> {
  const rows = await PrismaService.client().$queryRaw<SummaryRow[]>`
    SELECT
      (SELECT COUNT(*)::int FROM users) AS "totalUsers",
      (SELECT COUNT(*)::int FROM users WHERE status = 'ACTIVE') AS "activeUsers",
      (SELECT COUNT(*)::int FROM users WHERE status = 'BLOCKED') AS "blockedUsers",
      (SELECT COUNT(*)::int FROM cars) AS "totalCars",
      (SELECT COUNT(*)::int FROM listings WHERE status = 'PUBLISHED') AS "publishedListings",
      (SELECT COUNT(*)::int FROM listings WHERE status = 'PENDING_MODERATION') AS "pendingListings",
      (SELECT COUNT(*)::int FROM cars WHERE status = 'SOLD') AS "soldCars",
      (SELECT COUNT(*)::int FROM cars WHERE status = 'RENTED') AS "rentedCars",
      (SELECT COUNT(*)::int FROM purchases) AS "totalSales",
      (SELECT COUNT(*)::int FROM purchases WHERE status = 'COMPLETED') AS "completedSales",
      (SELECT COUNT(*)::int FROM rental_bookings WHERE status = 'ACTIVE') AS "activeRentals",
      (SELECT COUNT(*)::int FROM rental_bookings WHERE status = 'COMPLETED') AS "completedRentals",
      (SELECT COUNT(*)::int FROM rental_bookings WHERE status = 'PENDING') AS "pendingBookings",
      (SELECT COALESCE(SUM(price), 0)::text FROM purchases WHERE status = 'COMPLETED') AS "salesRevenue",
      (SELECT COALESCE(SUM(total_price), 0)::text FROM rental_bookings WHERE status = 'COMPLETED') AS "rentalRevenue"
  `;
  const row = rows[0];
  if (!row) {
    throw new Error("Dashboard summary query returned no row");
  }
  const salesRevenue = new Prisma.Decimal(row.salesRevenue);
  const rentalRevenue = new Prisma.Decimal(row.rentalRevenue);
  return {
    totalUsers: Number(row.totalUsers),
    activeUsers: Number(row.activeUsers),
    blockedUsers: Number(row.blockedUsers),
    totalCars: Number(row.totalCars),
    publishedListings: Number(row.publishedListings),
    pendingListings: Number(row.pendingListings),
    soldCars: Number(row.soldCars),
    rentedCars: Number(row.rentedCars),
    totalSales: Number(row.totalSales),
    completedSales: Number(row.completedSales),
    activeRentals: Number(row.activeRentals),
    completedRentals: Number(row.completedRentals),
    pendingBookings: Number(row.pendingBookings),
    salesRevenue: salesRevenue.toFixed(2),
    rentalRevenue: rentalRevenue.toFixed(2),
    totalRevenue: salesRevenue.add(rentalRevenue).toFixed(2),
  };
}
