import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { HealthService } from "./health.service.js";

export const healthService = new HealthService(PrismaService);
