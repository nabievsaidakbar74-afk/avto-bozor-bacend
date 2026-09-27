import type { ImageExtension } from "./object-storage.js";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MIN_IMAGE_DIMENSION = 200;
export const MAX_IMAGE_DIMENSION = 8_000;

const MIME_EXTENSION = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type AllowedImageMime = keyof typeof MIME_EXTENSION;

export type DetectedImage = {
  mime: "image/jpeg" | "image/png" | "image/webp";
  extension: ImageExtension;
  width: number;
  height: number;
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readPng(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return null;
  }
  if (buffer.toString("ascii", 12, 16) !== "IHDR") {
    return null;
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width === 0 || height === 0) {
    return null;
  }
  return { width, height };
}

function readJpeg(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      return null;
    }
    const marker = buffer[offset + 1];
    if (marker === undefined || marker === 0xd8 || marker === 0xd9 || marker === 0xda) {
      return null;
    }
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }

    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > buffer.length) {
      return null;
    }

    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame) {
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      if (width === 0 || height === 0) {
        return null;
      }
      return { width, height };
    }

    offset += 2 + segmentLength;
  }

  return null;
}

function readWebp(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF") {
    return null;
  }
  if (buffer.toString("ascii", 8, 12) !== "WEBP") {
    return null;
  }

  const format = buffer.toString("ascii", 12, 16);
  if (format === "VP8X") {
    const width = 1 + buffer.readUIntLE(24, 3);
    const height = 1 + buffer.readUIntLE(27, 3);
    return width > 0 && height > 0 ? { width, height } : null;
  }

  if (format === "VP8 " && buffer.length >= 30) {
    const frame = 20;
    if (buffer[frame + 3] !== 0x9d || buffer[frame + 4] !== 0x01 || buffer[frame + 5] !== 0x2a) {
      return null;
    }
    const width = buffer.readUInt16LE(frame + 6) & 0x3fff;
    const height = buffer.readUInt16LE(frame + 8) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }

  if (format === "VP8L" && buffer[20] === 0x2f) {
    const bits = buffer.readUInt32LE(21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return { width, height };
  }

  return null;
}

export function inspectImage(buffer: Buffer): DetectedImage | null {
  const png = readPng(buffer);
  if (png) {
    return { mime: "image/png", extension: "png", ...png };
  }
  const jpeg = readJpeg(buffer);
  if (jpeg) {
    return { mime: "image/jpeg", extension: "jpg", ...jpeg };
  }
  const webp = readWebp(buffer);
  if (webp) {
    return { mime: "image/webp", extension: "webp", ...webp };
  }
  return null;
}

export function extensionForMime(mime: string): ImageExtension | null {
  if (mime in MIME_EXTENSION) {
    return MIME_EXTENSION[mime as AllowedImageMime];
  }
  return null;
}
