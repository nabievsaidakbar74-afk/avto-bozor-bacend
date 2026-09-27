import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { AppError } from "../../common/errors/app-error.js";
import { MAX_IMAGE_BYTES } from "../../infrastructure/storage/image-file.js";

const INVALID_IMAGE = new AppError(
  "Image must be a JPEG, PNG, or WebP file up to 5 MB",
  422,
  "INVALID_IMAGE",
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_BYTES,
    files: 1,
    fields: 0,
  },
}).single("image");

export function uploadCarImage(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError) {
      next(INVALID_IMAGE);
      return;
    }
    next(INVALID_IMAGE);
  });
}
