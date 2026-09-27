import type { UserRole } from "@prisma/client";
import { AppError } from "../errors/app-error.js";
import { RoleName } from "./roles.js";

type AccountRef = {
  id: string;
  role: UserRole;
};

export function canChangeUserStatus(actorRole: UserRole, targetRole: UserRole): boolean {
  if (actorRole === RoleName.SUPER_ADMIN) {
    return true;
  }
  if (actorRole === RoleName.ADMIN) {
    return targetRole === RoleName.USER || targetRole === RoleName.MODERATOR;
  }
  return false;
}

export function assertCanChangeUserStatus(actor: AccountRef, target: AccountRef): void {
  if (actor.id === target.id) {
    throw new AppError("You cannot change your own account status", 403, "SELF_STATUS_CHANGE");
  }
  if (!canChangeUserStatus(actor.role, target.role)) {
    throw new AppError("You cannot change this account", 403, "ROLE_ESCALATION");
  }
}
