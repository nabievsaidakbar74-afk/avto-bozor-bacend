import type { z } from "zod";
import type { auditListQuerySchema } from "./audit.validation.js";

export type AuditListParams = z.infer<typeof auditListQuerySchema>;
