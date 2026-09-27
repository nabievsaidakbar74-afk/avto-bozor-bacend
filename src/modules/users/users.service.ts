import { Prisma } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";
import { requireActorId } from "../../common/security/ownership.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { AuditAction, auditService } from "../audit/audit.service.js";
import { safeUserSelect, type SafeUser } from "../auth/auth.dto.js";
import type { UpdateProfileInput } from "./users.dto.js";

function uniqueConstraintMessage(error: Prisma.PrismaClientKnownRequestError): AppError {
  const target = error.meta?.["target"];
  const normalized = Array.isArray(target)
    ? target.join(" ")
    : typeof target === "string"
      ? target
      : "";
  const field = normalized.toLowerCase();
  if (field.includes("email")) {
    return new AppError("An account with this email already exists", 409, "EMAIL_TAKEN");
  }
  if (field.includes("phone")) {
    return new AppError("An account with this phone number already exists", 409, "PHONE_TAKEN");
  }
  return new AppError("Resource already exists", 409, "CONFLICT");
}

function profileData(input: UpdateProfileInput): Prisma.UserUpdateInput {
  const data: Prisma.UserUpdateInput = {};
  if (input.email !== undefined) {
    data.email = input.email;
  }
  if (input.phone !== undefined) {
    data.phone = input.phone;
  }
  if (input.firstName !== undefined) {
    data.firstName = input.firstName;
  }
  if (input.lastName !== undefined) {
    data.lastName = input.lastName;
  }
  if (input.avatar !== undefined) {
    data.avatar = input.avatar;
  }
  return data;
}

export const usersService = {
  async getOwnProfile(actorId: string): Promise<SafeUser> {
    const user = await PrismaService.client().user.findUnique({
      where: { id: requireActorId({ sub: actorId }) },
      select: safeUserSelect,
    });
    if (!user) {
      throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    }
    return user;
  },

  async updateOwnProfile(actorId: string, input: UpdateProfileInput): Promise<SafeUser> {
    try {
      const user = await PrismaService.client().user.update({
        where: { id: requireActorId({ sub: actorId }) },
        data: profileData(input),
        select: safeUserSelect,
      });
      const fields = Object.keys(input).filter((key) => input[key as keyof UpdateProfileInput] !== undefined);
      await auditService.persist({
        actorId: user.id,
        action: AuditAction.USER_UPDATED,
        resource: "user",
        resourceId: user.id,
        metadata: { fields: fields.join(",") },
      });
      return user;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw uniqueConstraintMessage(error);
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new AppError("Authentication required", 401, "UNAUTHORIZED");
      }
      throw error;
    }
  },
};
