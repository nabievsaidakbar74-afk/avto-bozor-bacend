import type { PurchaseStatus } from "@prisma/client";
import type { z } from "zod";
import type {
  createPurchaseSchema,
  purchaseIdParamSchema,
  purchaseListQuerySchema,
  updatePurchaseStatusSchema,
} from "./purchases.validation.js";

export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
export type PurchaseIdParams = z.infer<typeof purchaseIdParamSchema>;
export type UpdatePurchaseStatusInput = z.infer<typeof updatePurchaseStatusSchema>;
export type PurchaseListQuery = z.infer<typeof purchaseListQuerySchema>;

export type PurchaseParty = {
  id: string;
  firstName: string;
  lastName: string;
};

export type PurchaseView = {
  id: string;
  carId: string;
  buyerId: string;
  sellerId: string;
  price: string;
  status: PurchaseStatus;
  createdAt: Date;
  updatedAt: Date;
  car: {
    id: string;
    brand: string;
    model: string;
    year: number;
    location: string;
  };
  buyer: PurchaseParty;
  seller: PurchaseParty;
  payment: {
    id: string;
    amount: string;
    currency: string;
    status: string;
    provider: string;
  } | null;
};

export type PurchaseList = {
  purchases: PurchaseView[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};
