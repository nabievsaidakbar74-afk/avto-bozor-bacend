import type { CarStatus, ListingStatus, ListingType, RentalBookingStatus } from "@prisma/client";
import type { z } from "zod";
import type { SafeUser } from "../auth/auth.dto.js";
import type {
  analyticsQuerySchema,
  listBookingsQuerySchema,
  listCarsQuerySchema,
  listListingsQuerySchema,
  listUsersQuerySchema,
  updateUserStatusSchema,
  userIdParamSchema,
} from "./admin.validation.js";

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type UserIdParams = z.infer<typeof userIdParamSchema>;
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
export type ListCarsQuery = z.infer<typeof listCarsQuerySchema>;
export type ListListingsQuery = z.infer<typeof listListingsQuerySchema>;
export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;

export type Page = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type UserList = {
  users: SafeUser[];
  pagination: Page;
};

export type AdminCar = {
  id: string;
  brand: string;
  model: string;
  year: number;
  price: string;
  location: string;
  status: CarStatus;
  createdAt: Date;
  owner: { id: string; firstName: string; lastName: string };
};

export type AdminListing = {
  id: string;
  title: string;
  type: ListingType;
  status: ListingStatus;
  createdAt: Date;
  owner: { id: string; firstName: string; lastName: string };
  car: { id: string; brand: string; model: string };
};

export type AdminBooking = {
  id: string;
  status: RentalBookingStatus;
  startDate: string;
  endDate: string;
  totalPrice: string;
  createdAt: Date;
  car: { id: string; brand: string; model: string };
  renter: { id: string; firstName: string; lastName: string };
  owner: { id: string; firstName: string; lastName: string };
};
