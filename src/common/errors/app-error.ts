export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly isOperational: boolean;
  readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    options?: { details?: unknown; isOperational?: boolean },
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = options?.isOperational ?? true;
    if (options?.details !== undefined) {
      this.details = options.details;
    }
  }
}
