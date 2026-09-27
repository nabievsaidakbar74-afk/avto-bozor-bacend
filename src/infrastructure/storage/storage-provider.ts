export type StoredObject = {
  storageKey: string;
  url: string;
};

export type ImageExtension = "jpg" | "png" | "webp";

export type ImageContentType = "image/jpeg" | "image/png" | "image/webp";

export type StoragePutInput = {
  body: Buffer;
  extension: ImageExtension;
  contentType: ImageContentType;
};

/**
 * Object storage for image bytes. Development uses the local driver.
 * An S3-compatible driver implements the same methods with S3StorageConfig.
 */
export interface StorageProvider {
  readonly driver: "local" | "s3";
  put(input: StoragePutInput): Promise<StoredObject>;
  delete(storageKey: string): Promise<void>;
}

export type S3StorageConfig = {
  bucket: string;
  region: string;
  endpoint?: string;
  publicBaseUrl: string;
  forcePathStyle?: boolean;
};

export type ObjectStorage = StorageProvider;
