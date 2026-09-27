import path from "node:path";
import type { Prisma } from "@prisma/client";
import { AppError } from "../../common/errors/app-error.js";
import { assertCanModifyCar } from "../../common/security/ownership.js";
import type { RoleName } from "../../common/security/roles.js";
import {
  extensionForMime,
  inspectImage,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  MIN_IMAGE_DIMENSION,
} from "../../infrastructure/storage/image-file.js";
import type { ImageExtension } from "../../infrastructure/storage/object-storage.js";
import { storageProvider } from "../../infrastructure/storage/storage.service.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";

const MAX_IMAGES_PER_CAR = 10;

const INVALID_IMAGE = new AppError(
  "Image must be a JPEG, PNG, or WebP file up to 5 MB, between 200 and 8000 pixels on each side",
  422,
  "INVALID_IMAGE",
);
const NOT_FOUND = new AppError("Car not found", 404, "NOT_FOUND");
const IMAGE_NOT_FOUND = new AppError("Image not found", 404, "NOT_FOUND");
const IMAGE_LIMIT = new AppError("This car already has the maximum number of images", 409, "IMAGE_LIMIT");
const IMAGE_ORDER = new AppError(
  "imageIds must list every image of this car exactly once",
  422,
  "VALIDATION_ERROR",
);

const imageSelect = {
  id: true,
  carId: true,
  url: true,
  sortOrder: true,
  createdAt: true,
} as const;

const EXTENSION_ALIAS: Record<string, ImageExtension> = {
  jpg: "jpg",
  jpeg: "jpg",
  png: "png",
  webp: "webp",
};

export type CarImageRecord = {
  id: string;
  carId: string;
  url: string;
  sortOrder: number;
  createdAt: Date;
};

type Actor = {
  id: string;
  role: RoleName;
};

function claimedExtension(filename: string | undefined): ImageExtension | null {
  if (!filename) {
    return null;
  }
  const base = path.win32.basename(path.posix.basename(filename));
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) {
    return null;
  }
  const extension = base.slice(dot + 1).toLowerCase();
  const mapped = EXTENSION_ALIAS[extension];
  if (!mapped) {
    throw INVALID_IMAGE;
  }
  return mapped;
}

async function ownedCar(actor: Actor, carId: string): Promise<{ id: string; ownerId: string }> {
  const car = await PrismaService.client().car.findUnique({
    where: { id: carId },
    select: { id: true, ownerId: true },
  });
  if (!car) {
    throw NOT_FOUND;
  }
  assertCanModifyCar(actor.id, actor.role, car.ownerId);
  return car;
}

export const carImagesService = {
  async add(actor: Actor, carId: string, file: Express.Multer.File | undefined): Promise<CarImageRecord> {
    if (!file) {
      throw INVALID_IMAGE;
    }
    await ownedCar(actor, carId);

    if (file.size <= 0 || file.size > MAX_IMAGE_BYTES || file.buffer.length > MAX_IMAGE_BYTES) {
      throw INVALID_IMAGE;
    }

    const detected = inspectImage(file.buffer);
    const mimeExtension = extensionForMime(file.mimetype);
    if (!detected || !mimeExtension || mimeExtension !== detected.extension) {
      throw INVALID_IMAGE;
    }

    const filenameExtension = claimedExtension(file.originalname);
    if (filenameExtension && filenameExtension !== detected.extension) {
      throw INVALID_IMAGE;
    }

    if (
      detected.width < MIN_IMAGE_DIMENSION ||
      detected.height < MIN_IMAGE_DIMENSION ||
      detected.width > MAX_IMAGE_DIMENSION ||
      detected.height > MAX_IMAGE_DIMENSION
    ) {
      throw INVALID_IMAGE;
    }

    const imageCount = await PrismaService.client().carImage.count({ where: { carId } });
    if (imageCount >= MAX_IMAGES_PER_CAR) {
      throw IMAGE_LIMIT;
    }

    const stored = await storageProvider.put({
      body: file.buffer,
      extension: detected.extension,
      contentType: detected.mime,
    });

    try {
      return await PrismaService.client().carImage.create({
        data: {
          carId,
          url: stored.url,
          storageKey: stored.storageKey,
          metadata: {
            mime: detected.mime,
            width: detected.width,
            height: detected.height,
            bytes: file.buffer.length,
          },
          sortOrder: imageCount,
        },
        select: imageSelect,
      });
    } catch (error) {
      await storageProvider.delete(stored.storageKey);
      throw error;
    }
  },

  async remove(actor: Actor, carId: string, imageId: string): Promise<void> {
    await ownedCar(actor, carId);
    const image = await PrismaService.client().carImage.findFirst({
      where: { id: imageId, carId },
      select: { id: true, storageKey: true },
    });
    if (!image) {
      throw IMAGE_NOT_FOUND;
    }

    await PrismaService.client().carImage.delete({ where: { id: image.id } });
    await storageProvider.delete(image.storageKey);
  },

  async setMain(actor: Actor, carId: string, imageId: string): Promise<CarImageRecord[]> {
    await ownedCar(actor, carId);
    return PrismaService.client().$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM cars WHERE id = ${carId}::uuid FOR UPDATE`;
      const images = await tx.carImage.findMany({
        where: { carId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: imageSelect,
      });
      const chosen = images.find((image) => image.id === imageId);
      if (!chosen) {
        throw IMAGE_NOT_FOUND;
      }
      const ordered = [chosen, ...images.filter((image) => image.id !== imageId)];
      return writeSortOrder(tx, ordered);
    });
  },

  async reorder(actor: Actor, carId: string, imageIds: string[]): Promise<CarImageRecord[]> {
    await ownedCar(actor, carId);
    return PrismaService.client().$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM cars WHERE id = ${carId}::uuid FOR UPDATE`;
      const images = await tx.carImage.findMany({
        where: { carId },
        select: imageSelect,
      });
      if (imageIds.length !== images.length || new Set(imageIds).size !== imageIds.length) {
        throw IMAGE_ORDER;
      }
      const byId = new Map(images.map((image) => [image.id, image]));
      const ordered: CarImageRecord[] = [];
      for (const id of imageIds) {
        const image = byId.get(id);
        if (!image) {
          throw IMAGE_ORDER;
        }
        ordered.push(image);
      }
      return writeSortOrder(tx, ordered);
    });
  },
};

async function writeSortOrder(tx: Prisma.TransactionClient, images: CarImageRecord[]): Promise<CarImageRecord[]> {
  const updated: CarImageRecord[] = [];
  for (const [sortOrder, image] of images.entries()) {
    const row = await tx.carImage.update({
      where: { id: image.id },
      data: { sortOrder },
      select: imageSelect,
    });
    updated.push(row);
  }
  return updated;
}
