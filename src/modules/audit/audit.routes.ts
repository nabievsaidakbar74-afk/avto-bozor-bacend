import { Router } from "express";
import { authenticate } from "../../common/guards/authenticate.js";
import { authorize } from "../../common/guards/authorize.js";
import { requireActiveAccount } from "../../common/guards/require-active-account.js";
import { validate } from "../../common/middleware/validate.middleware.js";
import { Permission } from "../../common/security/permissions.js";
import { RoleName } from "../../common/security/roles.js";
import { auditController } from "./audit.controller.js";
import { auditValidation } from "./audit.validation.js";

export const auditRouter = Router();

const staffRoles = [RoleName.ADMIN, RoleName.SUPER_ADMIN] as const;

auditRouter.get(
  "/",
  authenticate,
  requireActiveAccount,
  authorize({ roles: staffRoles, permissions: [Permission.AUDIT_READ] }),
  validate({ query: auditValidation.list }),
  auditController.list,
);
