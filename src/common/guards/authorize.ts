import type { RequestHandler } from "express";
import { AppError } from "../errors/app-error.js";
import { hasPermission, type Permission } from "../security/permissions.js";
import { RoleName, type RoleName as RoleNameValue } from "../security/roles.js";

type AuthorizationRequirement = {
  roles?: readonly RoleNameValue[];
  permissions?: readonly Permission[];
};

export function authorize(requirement: AuthorizationRequirement): RequestHandler {
  return (req, _res, next) => {
    const auth = req.auth;
    if (!auth) {
      next(new AppError("Authentication required", 401, "UNAUTHORIZED"));
      return;
    }

    if (auth.role === RoleName.SUPER_ADMIN) {
      next();
      return;
    }

    if (requirement.roles && !requirement.roles.includes(auth.role)) {
      next(new AppError("You do not have access to this resource", 403, "FORBIDDEN"));
      return;
    }

    const missingPermission = requirement.permissions?.some(
      (permission) => !hasPermission(auth.role, permission),
    );
    if (missingPermission) {
      next(new AppError("You do not have access to this resource", 403, "FORBIDDEN"));
      return;
    }

    next();
  };
}
