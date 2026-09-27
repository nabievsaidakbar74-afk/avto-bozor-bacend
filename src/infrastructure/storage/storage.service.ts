import path from "node:path";
import { env } from "../../config/env.js";
import { LocalObjectStorage } from "./local-object-storage.js";
import type { StorageProvider } from "./storage-provider.js";

export const UPLOAD_PUBLIC_BASE_PATH = "/uploads";

export function storageRoot(): string {
  return path.resolve(env.STORAGE_LOCAL_ROOT);
}

export const storageProvider: StorageProvider = new LocalObjectStorage(
  env.STORAGE_LOCAL_ROOT,
  UPLOAD_PUBLIC_BASE_PATH,
);

export const objectStorage: StorageProvider = storageProvider;
