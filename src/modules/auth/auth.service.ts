import { NotificationType, Prisma, UserStatus } from "@prisma/client";
import { env } from "../../config/env.js";
import { AppError } from "../../common/errors/app-error.js";
import { hashPassword, verifyPasswordForLogin } from "../../common/security/password.js";
import { signAccessToken } from "../../common/security/jwt.js";
import { isRoleName } from "../../common/security/roles.js";
import { durationToMs } from "../../common/utils/duration.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { AuditAction, auditService } from "../audit/audit.service.js";
import { writeNotifications } from "../notifications/notifications.service.js";
import {
  safeUserSelect,
  type AuthSession,
  type LoginInput,
  type RegisterInput,
  type SafeUser,
} from "./auth.dto.js";
import { generateRefreshToken, hashRefreshToken } from "./refresh-token.js";

const INVALID_LOGIN = new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
const INVALID_SESSION = new AppError("Invalid or expired session", 401, "UNAUTHORIZED");
const ACCOUNT_DISABLED = new AppError("This account cannot sign in", 403, "ACCOUNT_DISABLED");

type RequestMeta = { ip?: string | null; userAgent?: string | null };

function canSignIn(status: UserStatus): boolean {
  return status === UserStatus.ACTIVE || status === UserStatus.PENDING;
}

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

function refreshExpiry(): Date {
  return new Date(Date.now() + durationToMs(env.JWT_REFRESH_EXPIRES_IN));
}

async function issueSession(user: SafeUser): Promise<AuthSession> {
  if (!isRoleName(user.role)) {
    throw new AppError("Internal server error", 500, "INTERNAL_ERROR", { isOperational: false });
  }

  const refreshToken = generateRefreshToken();
  await PrismaService.client().refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshExpiry(),
    },
  });

  return {
    accessToken: signAccessToken({ sub: user.id, role: user.role }),
    refreshToken,
    user,
  };
}

export const authService = {
  async register(input: RegisterInput, meta: RequestMeta = {}): Promise<SafeUser> {
    try {
      return await PrismaService.client().$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: input.email,
            phone: input.phone,
            passwordHash: await hashPassword(input.password),
            firstName: input.firstName,
            lastName: input.lastName,
            role: "USER",
            status: UserStatus.ACTIVE,
          },
          select: safeUserSelect,
        });
        await writeNotifications(tx, [
          {
            userId: user.id,
            type: NotificationType.SYSTEM,
            title: "Welcome to Avto Bozor",
            message: "Your account is ready.",
          },
        ]);
        await auditService.write(tx, {
          actorId: user.id,
          action: AuditAction.USER_CREATED,
          resource: "user",
          resourceId: user.id,
          ip: meta.ip,
          userAgent: meta.userAgent,
        });
        return user;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw uniqueConstraintMessage(error);
      }
      throw error;
    }
  },

  async login(input: LoginInput, meta: RequestMeta = {}): Promise<AuthSession> {
    const user = await PrismaService.client().user.findUnique({
      where: { email: input.email },
      select: {
        ...safeUserSelect,
        passwordHash: true,
      },
    });

    const passwordMatches = await verifyPasswordForLogin(
      user?.passwordHash ?? null,
      input.password,
    );
    if (!user || !passwordMatches) {
      throw INVALID_LOGIN;
    }
    if (!canSignIn(user.status)) {
      throw ACCOUNT_DISABLED;
    }

    const safeUser: SafeUser = {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
    const session = await issueSession(safeUser);
    await auditService.persist({
      actorId: user.id,
      action: AuditAction.LOGIN,
      resource: "user",
      resourceId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return session;
  },

  async refresh(rawToken: string | undefined): Promise<AuthSession> {
    if (!rawToken) {
      throw INVALID_SESSION;
    }

    const existing = await PrismaService.client().refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(rawToken) },
      include: { user: { select: safeUserSelect } },
    });
    if (!existing) {
      throw INVALID_SESSION;
    }

    if (existing.revokedAt) {
      await PrismaService.client().refreshToken.updateMany({
        where: { userId: existing.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw INVALID_SESSION;
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw INVALID_SESSION;
    }
    if (!canSignIn(existing.user.status)) {
      throw ACCOUNT_DISABLED;
    }
    if (!isRoleName(existing.user.role)) {
      throw new AppError("Internal server error", 500, "INTERNAL_ERROR", { isOperational: false });
    }

    const refreshToken = generateRefreshToken();
    const rotated = await PrismaService.client().$transaction(async (tx) => {
      const revoked = await tx.refreshToken.updateMany({
        where: { id: existing.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (revoked.count !== 1) {
        return false;
      }
      await tx.refreshToken.create({
        data: {
          userId: existing.userId,
          tokenHash: hashRefreshToken(refreshToken),
          expiresAt: refreshExpiry(),
        },
      });
      return true;
    });

    if (!rotated) {
      throw INVALID_SESSION;
    }

    return {
      accessToken: signAccessToken({ sub: existing.user.id, role: existing.user.role }),
      refreshToken,
      user: existing.user,
    };
  },

  async logout(rawToken: string | undefined, meta: RequestMeta = {}): Promise<void> {
    if (!rawToken) {
      return;
    }
    const tokenHash = hashRefreshToken(rawToken);
    const existing = await PrismaService.client().refreshToken.findFirst({
      where: { tokenHash, revokedAt: null },
      select: { userId: true },
    });
    await PrismaService.client().refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (existing) {
      await auditService.persist({
        actorId: existing.userId,
        action: AuditAction.LOGOUT,
        resource: "user",
        resourceId: existing.userId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    }
  },

  async getMe(userId: string): Promise<SafeUser> {
    const user = await PrismaService.client().user.findUnique({
      where: { id: userId },
      select: safeUserSelect,
    });
    if (!user || !canSignIn(user.status)) {
      throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    }
    return user;
  },
};
