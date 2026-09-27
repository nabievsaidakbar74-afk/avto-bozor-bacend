import { describe, expect, it } from "vitest";
import { inspectImage } from "../../src/infrastructure/storage/image-file.js";
import { LocalObjectStorage } from "../../src/infrastructure/storage/local-object-storage.js";

function png(width: number, height: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(13, 0);
  const type = Buffer.from("IHDR");
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8;
  data[9] = 2;
  return Buffer.concat([signature, length, type, data, Buffer.alloc(4)]);
}

describe("image inspection", () => {
  it("reads PNG dimensions and rejects a non-image", () => {
    const image = inspectImage(png(640, 480));
    expect(image).toMatchObject({ mime: "image/png", extension: "png", width: 640, height: 480 });
    expect(inspectImage(Buffer.from("not an image"))).toBeNull();
  });

  it("rejects a storage key that leaves the upload directory", async () => {
    const storage = new LocalObjectStorage("storage", "/uploads");
    await expect(storage.delete("../.env")).rejects.toMatchObject({ code: "INVALID_STORAGE_KEY" });
    await expect(storage.delete("car-images/../../.env")).rejects.toMatchObject({
      code: "INVALID_STORAGE_KEY",
    });
  });
});
