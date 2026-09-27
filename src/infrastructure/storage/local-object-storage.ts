import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "../../common/errors/app-error.js";
import type { StorageProvider, StoragePutInput, StoredObject } from "./storage-provider.js";

const STORAGE_KEY = /^car-images\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

const INVALID_KEY = new AppError("Invalid storage key", 400, "INVALID_STORAGE_KEY");

export class LocalObjectStorage implements StorageProvider {
  readonly driver = "local" as const;

  constructor(
    private readonly root: string,
    private readonly publicBasePath: string,
  ) {}

  async put(input: StoragePutInput): Promise<StoredObject> {
    const storageKey = `car-images/${randomUUID()}.${input.extension}`;
    const target = this.resolveKey(storageKey);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, input.body, { flag: "wx" });
    return {
      storageKey,
      url: `${this.publicBasePath}/${storageKey}`,
    };
  }

  async delete(storageKey: string): Promise<void> {
    const target = this.resolveKey(storageKey);
    await unlink(target).catch((error: unknown) => {
      if (isMissingFile(error)) {
        return;
      }
      throw error;
    });
  }

  private resolveKey(storageKey: string): string {
    if (!STORAGE_KEY.test(storageKey) || storageKey.includes("..") || storageKey.includes("\\")) {
      throw INVALID_KEY;
    }

    const root = path.resolve(this.root);
    const target = path.resolve(root, storageKey);
    const relative = path.relative(root, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw INVALID_KEY;
    }
    return target;
  }
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
