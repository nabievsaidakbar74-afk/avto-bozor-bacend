import type { z } from "zod";
import type { createReviewSchema, reviewCarParamSchema, reviewListQuerySchema } from "./reviews.validation.js";

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type ReviewCarParams = z.infer<typeof reviewCarParamSchema>;
export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;

export type ReviewView = {
  id: string;
  carId: string;
  rating: number;
  comment: string;
  createdAt: Date;
  author: {
    id: string;
    firstName: string;
    lastName: string;
  };
};

export type ReviewList = {
  reviews: ReviewView[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};
