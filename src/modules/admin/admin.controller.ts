import type { Request, Response } from "express";
import { AppError } from "../../common/errors/app-error.js";
import { sendSuccess } from "../../common/utils/api-response.js";
import { asyncHandler } from "../../common/utils/async-handler.js";
import type {
  AnalyticsQuery,
  ListBookingsQuery,
  ListCarsQuery,
  ListListingsQuery,
  ListUsersQuery,
  UpdateUserStatusInput,
  UserIdParams,
} from "./admin.dto.js";
import { adminService } from "./admin.service.js";

function actor(req: Request): { id: string; role: NonNullable<Request["actor"]>["role"] } {
  if (!req.actor) {
    throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  }
  return { id: req.actor.id, role: req.actor.role };
}

function requestMeta(req: Request): { ip: string | null; userAgent: string | null } {
  return {
    ip: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null,
  };
}

export const adminController = {
  listUsers: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await adminService.listUsers(req.query as unknown as ListUsersQuery);
    sendSuccess(res, "Users", result);
  }),

  getUser: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as UserIdParams;
    const user = await adminService.getUser(params.id);
    sendSuccess(res, "User", { user });
  }),

  updateStatus: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as UserIdParams;
    const user = await adminService.updateUserStatus(
      actor(req),
      params.id,
      req.body as UpdateUserStatusInput,
      requestMeta(req),
    );
    sendSuccess(res, "User status updated", { user });
  }),

  dashboard: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const dashboard = await adminService.dashboard();
    sendSuccess(res, "Dashboard", { dashboard });
  }),

  salesAnalytics: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const query = req.query as unknown as AnalyticsQuery;
    const points = await adminService.salesAnalytics(query.period);
    sendSuccess(res, "Sales analytics", { period: query.period, points });
  }),

  rentalAnalytics: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const query = req.query as unknown as AnalyticsQuery;
    const points = await adminService.rentalAnalytics(query.period);
    sendSuccess(res, "Rental analytics", { period: query.period, points });
  }),

  userAnalytics: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const query = req.query as unknown as AnalyticsQuery;
    const points = await adminService.userAnalytics(query.period);
    sendSuccess(res, "User analytics", { period: query.period, points });
  }),

  revenueAnalytics: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const query = req.query as unknown as AnalyticsQuery;
    const points = await adminService.revenueAnalytics(query.period);
    sendSuccess(res, "Revenue analytics", { period: query.period, points });
  }),

  listCars: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await adminService.listCars(req.query as unknown as ListCarsQuery);
    sendSuccess(res, "Cars", result);
  }),

  listListings: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await adminService.listListings(req.query as unknown as ListListingsQuery);
    sendSuccess(res, "Listings", result);
  }),

  listBookings: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await adminService.listBookings(req.query as unknown as ListBookingsQuery);
    sendSuccess(res, "Bookings", result);
  }),
};
