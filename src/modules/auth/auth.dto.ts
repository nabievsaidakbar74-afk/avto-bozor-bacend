import type { UserRole, UserStatus } from "@prisma/client";
import type { z } from "zod";
import type { loginBodySchema, registerBodySchema } from "./auth.validation.js";

export type RegisterInput = z.infer<typeof registerBodySchema>;
export type LoginInput = z.infer<typeof loginBodySchema>;

export type SafeUser = {
  id: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  user: SafeUser;
};

export const safeUserSelect = {
  id: true,
  email: true,
  phone: true,
  firstName: true,
  lastName: true,
  avatar: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;
