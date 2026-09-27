import type { Request, Response } from "express";
import { AppError } from "../../common/errors/app-error.js";
import { isRoleName, type RoleName } from "../../common/security/roles.js";
import { sendSuccess } from "../../common/utils/api-response.js";
import { asyncHandler } from "../../common/utils/async-handler.js";
import type { CarIdParams, CreateCarInput, ListCarsQuery, UpdateCarInput } from "./cars.dto.js";
import { carImagesService } from "./car-images.service.js";
import { carsService } from "./cars.service.js";

function viewer(req: Request): { id: string; role: RoleName } {
  if (!req.actor || !isRoleName(req.actor.role)) {
    throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  }
  return { id: req.actor.id, role: req.actor.role };
}

function optionalViewer(req: Request): { id: string; role: NonNullable<Request["actor"]>["role"] } | undefined {
  if (!req.actor || !isRoleName(req.actor.role)) {
    return undefined;
  }
  return { id: req.actor.id, role: req.actor.role };
}

export const carsController = {
  list: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await carsService.list(req.query as unknown as ListCarsQuery);
    sendSuccess(res, "Cars", result);
  }),

  getById: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as CarIdParams;
    const car = await carsService.getById(params.id, optionalViewer(req));
    sendSuccess(res, "Car", { car });
  }),

  create: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const actor = viewer(req);
    const car = await carsService.create(actor.id, req.body as CreateCarInput);
    sendSuccess(res, "Car created", { car }, 201);
  }),

  update: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as CarIdParams;
    const car = await carsService.update(viewer(req), params.id, req.body as UpdateCarInput);
    sendSuccess(res, "Car updated", { car });
  }),

  remove: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as CarIdParams;
    const car = await carsService.deactivate(viewer(req), params.id);
    sendSuccess(res, "Car deactivated", { car });
  }),

  addImage: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as { carId: string };
    const image = await carImagesService.add(viewer(req), params.carId, req.file);
    sendSuccess(res, "Image added", { image }, 201);
  }),

  removeImage: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as { carId: string; imageId: string };
    await carImagesService.remove(viewer(req), params.carId, params.imageId);
    sendSuccess(res, "Image deleted");
  }),

  setMainImage: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as { carId: string; imageId: string };
    const images = await carImagesService.setMain(viewer(req), params.carId, params.imageId);
    sendSuccess(res, "Main image updated", { images });
  }),

  reorderImages: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const params = req.params as unknown as { carId: string };
    const body = req.body as { imageIds: string[] };
    const images = await carImagesService.reorder(viewer(req), params.carId, body.imageIds);
    sendSuccess(res, "Image order updated", { images });
  }),
};
