import { Router } from "express";
import { authenticate } from "../../common/guards/authenticate.js";
import { authorize } from "../../common/guards/authorize.js";
import { requireActiveAccount } from "../../common/guards/require-active-account.js";
import { validate } from "../../common/middleware/validate.middleware.js";
import { Permission } from "../../common/security/permissions.js";
import { RoleName } from "../../common/security/roles.js";
import { moderationController } from "../moderation/moderation.controller.js";
import { moderationValidation } from "../moderation/moderation.validation.js";
import { purchasesController } from "../purchases/purchases.controller.js";
import { purchasesValidation } from "../purchases/purchases.validation.js";
import { adminController } from "./admin.controller.js";
import { adminValidation } from "./admin.validation.js";
import { adminPaymentsRouter } from "../payments/payments.routes.js";
import { auditRouter } from "../audit/audit.routes.js";
import { adminReportsRouter } from "../reports/reports.routes.js";

export const adminRouter = Router();

const staffRoles = [RoleName.ADMIN, RoleName.SUPER_ADMIN] as const;

adminRouter.get(
  "/dashboard",
  authenticate,
  requireActiveAccount,
  authorize({ roles: staffRoles, permissions: [Permission.DASHBOARD_READ] }),
  adminController.dashboard,
);

adminRouter.get(
  "/analytics/sales",
  authenticate,
  requireActiveAccount,
  authorize({ roles: staffRoles, permissions: [Permission.DASHBOARD_READ] }),
  validate({ query: adminValidation.analytics }),
  adminController.salesAnalytics,
);

adminRouter.get(
  "/analytics/rentals",
  authenticate,
  requireActiveAccount,
  authorize({ roles: staffRoles, permissions: [Permission.DASHBOARD_READ] }),
  validate({ query: adminValidation.analytics }),
  adminController.rentalAnalytics,
);

adminRouter.get(
  "/analytics/users",
  authenticate,
  requireActiveAccount,
  authorize({ roles: staffRoles, permissions: [Permission.DASHBOARD_READ] }),
  validate({ query: adminValidation.analytics }),
  adminController.userAnalytics,
);

adminRouter.get(
  "/analytics/revenue",
  authenticate,
  requireActiveAccount,
  authorize({ roles: staffRoles, permissions: [Permission.DASHBOARD_READ] }),
  validate({ query: adminValidation.analytics }),
  adminController.revenueAnalytics,
);

adminRouter.get(
  "/cars",
  authenticate,
  requireActiveAccount,
  authorize({ roles: staffRoles, permissions: [Permission.DASHBOARD_READ] }),
  validate({ query: adminValidation.listCars }),
  adminController.listCars,
);

adminRouter.get(
  "/listings",
  authenticate,
  requireActiveAccount,
  authorize({ roles: staffRoles, permissions: [Permission.DASHBOARD_READ] }),
  validate({ query: adminValidation.listListings }),
  adminController.listListings,
);

adminRouter.get(
  "/bookings",
  authenticate,
  requireActiveAccount,
  authorize({ roles: staffRoles, permissions: [Permission.DASHBOARD_READ] }),
  validate({ query: adminValidation.listBookings }),
  adminController.listBookings,
);

adminRouter.use("/audit-logs", auditRouter);
adminRouter.use("/reports", adminReportsRouter);
adminRouter.use("/payments", adminPaymentsRouter);

adminRouter.get(
  "/users",
  authenticate,
  requireActiveAccount,
  authorize({ roles: staffRoles, permissions: [Permission.USER_READ] }),
  validate({ query: adminValidation.listUsers }),
  adminController.listUsers,
);

adminRouter.get(
  "/users/:id",
  authenticate,
  requireActiveAccount,
  authorize({ roles: staffRoles, permissions: [Permission.USER_READ] }),
  validate({ params: adminValidation.userId }),
  adminController.getUser,
);

adminRouter.get(
  "/listings/pending",
  authenticate,
  requireActiveAccount,
  authorize({ permissions: [Permission.LISTING_MODERATE] }),
  validate({ query: moderationValidation.pending }),
  moderationController.pending,
);

adminRouter.post(
  "/listings/:id/approve",
  authenticate,
  requireActiveAccount,
  authorize({ permissions: [Permission.LISTING_MODERATE] }),
  validate({ params: moderationValidation.idParam }),
  moderationController.approve,
);

adminRouter.post(
  "/listings/:id/reject",
  authenticate,
  requireActiveAccount,
  authorize({ permissions: [Permission.LISTING_MODERATE] }),
  validate({ params: moderationValidation.idParam, body: moderationValidation.reject }),
  moderationController.reject,
);

adminRouter.get(
  "/sales",
  authenticate,
  requireActiveAccount,
  authorize({ roles: staffRoles, permissions: [Permission.SALE_READ] }),
  validate({ query: purchasesValidation.list }),
  purchasesController.adminList,
);

adminRouter.get(
  "/sales/:id",
  authenticate,
  requireActiveAccount,
  authorize({ roles: staffRoles, permissions: [Permission.SALE_READ] }),
  validate({ params: purchasesValidation.idParam }),
  purchasesController.adminGet,
);

adminRouter.patch(
  "/sales/:id/status",
  authenticate,
  requireActiveAccount,
  authorize({ roles: staffRoles, permissions: [Permission.SALE_READ] }),
  validate({ params: purchasesValidation.idParam, body: purchasesValidation.updateStatus }),
  purchasesController.adminUpdateStatus,
);

adminRouter.patch(
  "/users/:id/status",
  authenticate,
  requireActiveAccount,
  authorize({ roles: staffRoles, permissions: [Permission.USER_BLOCK] }),
  validate({ params: adminValidation.userId, body: adminValidation.updateStatus }),
  adminController.updateStatus,
);
