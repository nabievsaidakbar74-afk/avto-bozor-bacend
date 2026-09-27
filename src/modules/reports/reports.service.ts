import { Prisma, ReportStatus } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";
import { resolvePartyId } from "../../common/security/ownership.js";
import type { RoleName } from "../../common/security/roles.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { AuditAction, auditService } from "../audit/audit.service.js";
import { assertReportTransition } from "./report-status.js";
import type { CreateReportInput, ReportListQuery, ReportView, UpdateReportInput } from "./reports.dto.js";

const NOT_FOUND = new AppError("Report not found", 404, "NOT_FOUND");
const TARGET_NOT_FOUND = new AppError("The reported item was not found", 404, "NOT_FOUND");
const SELF_REPORT = new AppError("You cannot report yourself", 409, "CANNOT_REPORT_SELF");
const DUPLICATE = new AppError("You already reported this", 409, "DUPLICATE_REPORT");

const reportSelect = {
  id: true,
  reporterId: true,
  targetUserId: true,
  carId: true,
  listingId: true,
  reviewId: true,
  reason: true,
  description: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ReportSelect;

type ReportRecord = Prisma.ReportGetPayload<{ select: typeof reportSelect }>;

type Actor = { id: string; role: RoleName };

type RequestMeta = { ip?: string | null; userAgent?: string | null };

const OPEN_REPORTS = [ReportStatus.OPEN, ReportStatus.IN_REVIEW] as const;

function toView(report: ReportRecord): ReportView {
  return report;
}

function pageOf(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

export const reportsService = {
  async create(actorId: string, input: CreateReportInput): Promise<ReportView> {
    const reporterId = resolvePartyId(actorId);
    const target = await resolveTarget(reporterId, input);
    const existing = await PrismaService.client().report.findFirst({
      where: {
        reporterId,
        status: { in: [...OPEN_REPORTS] },
        ...target,
      },
      select: { id: true },
    });
    if (existing) {
      throw DUPLICATE;
    }
    const report = await PrismaService.client().report.create({
      data: {
        reporterId,
        reason: input.reason,
        description: input.description,
        status: ReportStatus.OPEN,
        ...target,
      },
      select: reportSelect,
    });
    return toView(report);
  },

  async listOwn(actorId: string, query: ReportListQuery): Promise<{ reports: ReportView[]; pagination: ReturnType<typeof pageOf> }> {
    const reporterId = resolvePartyId(actorId);
    const where: Prisma.ReportWhereInput = {
      reporterId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, reports] = await PrismaService.client().$transaction([
      PrismaService.client().report.count({ where }),
      PrismaService.client().report.findMany({
        where,
        select: reportSelect,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return { reports: reports.map(toView), pagination: pageOf(query.page, query.limit, total) };
  },

  async getForReporter(actorId: string, id: string): Promise<ReportView> {
    const report = await PrismaService.client().report.findFirst({
      where: { id, reporterId: resolvePartyId(actorId) },
      select: reportSelect,
    });
    if (!report) {
      throw NOT_FOUND;
    }
    return toView(report);
  },

  async listForStaff(query: ReportListQuery): Promise<{ reports: ReportView[]; pagination: ReturnType<typeof pageOf> }> {
    const where: Prisma.ReportWhereInput = query.status ? { status: query.status } : {};
    const [total, reports] = await PrismaService.client().$transaction([
      PrismaService.client().report.count({ where }),
      PrismaService.client().report.findMany({
        where,
        select: reportSelect,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return { reports: reports.map(toView), pagination: pageOf(query.page, query.limit, total) };
  },

  async updateStatus(actor: Actor, id: string, input: UpdateReportInput, meta: RequestMeta = {}): Promise<ReportView> {
    const report = await PrismaService.client().$transaction(async (tx) => {
      const existing = await tx.report.findUnique({
        where: { id },
        select: reportSelect,
      });
      if (!existing) {
        throw NOT_FOUND;
      }
      assertReportTransition(existing.status, input.status);
      const updated = await tx.report.update({
        where: { id: existing.id },
        data: { status: input.status },
        select: reportSelect,
      });
      await auditService.write(tx, {
        actorId: actor.id,
        action: AuditAction.ADMIN_ACTION,
        resource: "report",
        resourceId: updated.id,
        metadata: { from: existing.status, to: updated.status },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return updated;
    });
    return toView(report);
  },
};

async function resolveTarget(
  reporterId: string,
  input: CreateReportInput,
): Promise<{ carId?: string; listingId?: string; targetUserId?: string; reviewId?: string }> {
  if (input.carId) {
    const car = await PrismaService.client().car.findUnique({ where: { id: input.carId }, select: { id: true } });
    if (!car) {
      throw TARGET_NOT_FOUND;
    }
    return { carId: car.id };
  }
  if (input.listingId) {
    const listing = await PrismaService.client().listing.findUnique({
      where: { id: input.listingId },
      select: { id: true },
    });
    if (!listing) {
      throw TARGET_NOT_FOUND;
    }
    return { listingId: listing.id };
  }
  if (input.userId) {
    if (input.userId === reporterId) {
      throw SELF_REPORT;
    }
    const user = await PrismaService.client().user.findUnique({ where: { id: input.userId }, select: { id: true } });
    if (!user) {
      throw TARGET_NOT_FOUND;
    }
    return { targetUserId: user.id };
  }
  const review = await PrismaService.client().review.findUnique({
    where: { id: input.reviewId ?? "" },
    select: { id: true, authorId: true },
  });
  if (!review) {
    throw TARGET_NOT_FOUND;
  }
  if (review.authorId === reporterId) {
    throw SELF_REPORT;
  }
  return { reviewId: review.id };
}
