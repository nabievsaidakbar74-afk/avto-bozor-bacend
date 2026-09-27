import type { RentalBookingStatus } from "@prisma/client";
import type { z } from "zod";
import type { bookingIdParamSchema, bookingListQuerySchema, createBookingSchema } from "./bookings.validation.js";

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type BookingIdParams = z.infer<typeof bookingIdParamSchema>;
export type BookingListQuery = z.infer<typeof bookingListQuerySchema>;

export type BookingView = {
  id: string;
  carId: string;
  renterId: string;
  ownerId: string;
  startDate: string;
  endDate: string;
  numberOfDays: number;
  dailyPrice: string;
  totalPrice: string;
  status: RentalBookingStatus;
  createdAt: Date;
  updatedAt: Date;
  car: {
    id: string;
    brand: string;
    model: string;
    location: string;
  };
  renter: {
    id: string;
    firstName: string;
    lastName: string;
  };
  owner: {
    id: string;
    firstName: string;
    lastName: string;
  };
};

export type BookingList = {
  bookings: BookingView[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};
