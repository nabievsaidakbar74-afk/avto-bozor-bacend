import type { z } from "zod";
import type {
  listingIdParamSchema,
  pendingListingsQuerySchema,
  rejectListingSchema,
} from "./moderation.validation.js";

export type PendingListingsQuery = z.infer<typeof pendingListingsQuerySchema>;
export type RejectListingInput = z.infer<typeof rejectListingSchema>;
export type ModerationListingParams = z.infer<typeof listingIdParamSchema>;
