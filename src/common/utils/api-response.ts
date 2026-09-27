import type { Response } from "express";

export function sendSuccess<T>(
  res: Response,
  message: string,
  data?: T,
  statusCode = 200,
): void {
  if (data === undefined) {
    res.status(statusCode).json({
      success: true,
      message,
    });
    return;
  }

  res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}
