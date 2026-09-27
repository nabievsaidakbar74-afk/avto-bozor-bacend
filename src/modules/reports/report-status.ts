import { ReportStatus } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";

const transitions: Record<ReportStatus, readonly ReportStatus[]> = {
  [ReportStatus.OPEN]: [ReportStatus.IN_REVIEW, ReportStatus.RESOLVED, ReportStatus.REJECTED],
  [ReportStatus.IN_REVIEW]: [ReportStatus.RESOLVED, ReportStatus.REJECTED],
  [ReportStatus.RESOLVED]: [],
  [ReportStatus.REJECTED]: [],
};

export function canTransitionReport(from: ReportStatus, to: ReportStatus): boolean {
  if (from === to) {
    return false;
  }
  return transitions[from].includes(to);
}

export function assertReportTransition(from: ReportStatus, to: ReportStatus): void {
  if (!canTransitionReport(from, to)) {
    throw new AppError("This status change is not allowed", 409, "INVALID_STATUS_TRANSITION");
  }
}
