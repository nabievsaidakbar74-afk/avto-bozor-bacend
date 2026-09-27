import type { PaymentStatus } from "@prisma/client";
import type { z } from "zod";
import type { createPaymentSchema, paymentIdParamSchema, paymentListQuerySchema } from "./payments.validation.js";

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type PaymentIdParams = z.infer<typeof paymentIdParamSchema>;
export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;

export type PaymentView = {
  id: string;
  userId: string;
  purchaseId: string | null;
  bookingId: string | null;
  amount: string;
  currency: string;
  status: PaymentStatus;
  provider: string;
  providerTransactionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PaymentList = {
  payments: PaymentView[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};
