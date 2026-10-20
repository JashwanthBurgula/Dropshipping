import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export type AllowedImageMime = "image/jpeg" | "image/png" | "image/webp";

export interface DetectedImageSignature {
  mime: AllowedImageMime;
  extension: "jpg" | "png" | "webp";
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface StoredImageRecord {
  storageKey: string;
  url: string;
  mime: AllowedImageMime;
  sizeBytes: number;
  sha256: string;
  dimensions?: ImageDimensions | null;
  provider?: "local" | "cloudinary" | "s3";
}

export interface ImageStorageAdapter {
  storeSanitizedImage(params: {
    buffer: Buffer;
    aspectRatio?: "1:1" | "4:5";
  }): Promise<StoredImageRecord>;
}

export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMAGE_PIXEL_DIMENSION = 4096; // Max 4096 x 4096 px

/**
 * Validates that an upload filename is a strict UUID + allowed extension
 * and contains zero path traversal sequences (`..`, `/`, `\`, `%2e`, null bytes).
 */
export function isSafeUploadFilename(filename: string): boolean {
  if (!filename || typeof filename !== "string") {
    return false;
  }
  const decoded = (() => {
    try {
      return decodeURIComponent(filename);
    } catch {
      return filename;
    }
  })();

  if (
    decoded.includes("..") ||
    decoded.includes("/") ||
    decoded.includes("\\") ||
    decoded.includes("\0") ||
    filename.includes("..") ||
    filename.includes("/") ||
    filename.includes("\\")
  ) {
    return false;
  }

  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(jpg|png|webp)$/i.test(
    filename
  );
}

/**
 * Inspects the raw magic bytes of a file buffer to determine its true image format.
 * Never trusts the user-supplied filename or Content-Type header.
 * Explicitly rejects SVG (`<svg`, `<?xml`) and all non-JPEG/PNG/WebP signatures.
 */
export function detectImageMimeFromMagicBytes(
  buffer: Buffer
): DetectedImageSignature | null {
  if (!buffer || buffer.length < 12) {
    return null;
  }

  // Explicitly reject XML/SVG/HTML text prefixes even if padded
  const headAscii = buffer.subarray(0, 64).toString("utf8").trimStart().toLowerCase();
  if (
    headAscii.startsWith("<svg") ||
    headAscii.startsWith("<?xml") ||
    headAscii.startsWith("<!doctype") ||
    headAscii.startsWith("<html")
  ) {
    return null;
  }

  // 1. JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: "image/jpeg", extension: "jpg" };
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mime: "image/png", extension: "png" };
  }

  // 3. WebP: "RIFF" (0..3) + 4-byte size + "WEBP" (8..11)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { mime: "image/webp", extension: "webp" };
  }

  return null;
}

/**
 * Extracts pixel width and height directly from PNG IHDR, JPEG SOFn, or WebP VP8/VP8L/VP8X headers.
 */
export function extractImageDimensions(
  buffer: Buffer,
  mime: AllowedImageMime
): ImageDimensions | null {
  if (mime === "image/png") {
    // PNG IHDR chunk starts at offset 8: length (4), "IHDR" (4), width (4 BE), height (4 BE)
    if (buffer.length >= 24) {
      const chunkType = buffer.subarray(12, 16).toString("ascii");
      if (chunkType === "IHDR") {
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        return { width, height };
      }
    }
    return null;
  }

  if (mime === "image/jpeg") {
    let offset = 2;
    while (offset + 1 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        break;
      }
      while (offset < buffer.length && buffer[offset] === 0xff) {
        offset += 1;
      }
      if (offset >= buffer.length) break;
      const marker = buffer[offset];
      if (marker === undefined) break;
      offset += 1;

      if (
        marker === 0xd8 ||
        marker === 0xd9 ||
        marker === 0x01 ||
        (marker >= 0xd0 && marker <= 0xd7)
      ) {
        if (marker === 0xd9) break;
        continue;
      }

      if (marker === 0xda) {
        break;
      }

      if (offset + 2 > buffer.length) break;
      const segmentLength = buffer.readUInt16BE(offset);
      if (segmentLength < 2 || offset + segmentLength > buffer.length) break;

      // SOF0..SOF15 markers (0xC0..0xCF excluding 0xC4 DHT, 0xC8 JPG, 0xCC DAC)
      const isSofMarker =
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc;

      if (isSofMarker && offset + 7 <= buffer.length) {
        const height = buffer.readUInt16BE(offset + 3);
        const width = buffer.readUInt16BE(offset + 5);
        return { width, height };
      }

      offset += segmentLength;
    }
    return null;
  }

  if (mime === "image/webp") {
    if (buffer.length < 24) return null;
    const fourCc = buffer.subarray(12, 16).toString("ascii");
    if (fourCc === "VP8 " && buffer.length >= 30) {
      if (
        buffer[23] === 0x9d &&
        buffer[24] === 0x01 &&
        buffer[25] === 0x2a
      ) {
        const width = buffer.readUInt16LE(26) & 0x3fff;
        const height = buffer.readUInt16LE(28) & 0x3fff;
        return { width, height };
      }
    } else if (fourCc === "VP8L" && buffer.length >= 25) {
      if (buffer[20] === 0x2f) {
        const bits = buffer.readUInt32LE(21);
        const width = (bits & 0x3fff) + 1;
        const height = ((bits >> 14) & 0x3fff) + 1;
        return { width, height };
      }
    } else if (fourCc === "VP8X" && buffer.length >= 30) {
      const width = buffer.readUIntLE(24, 3) + 1;
      const height = buffer.readUIntLE(27, 3) + 1;
      return { width, height };
    }
    return null;
  }

  return null;
}

/**
 * Strips EXIF, GPS, XMP, and comment metadata segments from JPEG buffers.
 */
function stripJpegMetadata(buffer: Buffer): Buffer {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return buffer;
  }

  const chunks: Buffer[] = [buffer.subarray(0, 2)]; // SOI (FF D8)
  let offset = 2;

  while (offset + 1 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      chunks.push(buffer.subarray(offset));
      break;
    }

    while (offset < buffer.length && buffer[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= buffer.length) break;

    const marker = buffer[offset];
    if (marker === undefined) break;
    offset += 1;

    if (
      marker === 0xd8 ||
      marker === 0xd9 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      chunks.push(Buffer.from([0xff, marker]));
      if (marker === 0xd9) break;
      continue;
    }

    if (marker === 0xda) {
      chunks.push(Buffer.from([0xff, marker]));
      chunks.push(buffer.subarray(offset));
      break;
    }

    if (offset + 2 > buffer.length) {
      break;
    }

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      chunks.push(Buffer.from([0xff, marker]));
      chunks.push(buffer.subarray(offset));
      break;
    }

    // Strip APP1..APP15 (0xE1..0xEF, which hold EXIF/GPS/XMP) and COM (0xFE)
    const isMetadataSegment =
      (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;

    if (!isMetadataSegment) {
      chunks.push(Buffer.from([0xff, marker]));
      chunks.push(buffer.subarray(offset, offset + segmentLength));
    }

    offset += segmentLength;
  }

  return Buffer.concat(chunks);
}

/**
 * Strips ancillary text, EXIF, and timestamp chunks from PNG buffers.
 */
function stripPngMetadata(buffer: Buffer): Buffer {
  if (buffer.length < 8) return buffer;
  const signature = buffer.subarray(0, 8);
  const chunks: Buffer[] = [signature];
  let offset = 8;

  const strippedChunkTypes = new Set([
    "tEXt",
    "zTXt",
    "iTXt",
    "eXIf",
    "tIME",
  ]);

  while (offset + 8 <= buffer.length) {
    const dataLength = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const totalChunkSize = 4 + 4 + dataLength + 4;

    if (offset + totalChunkSize > buffer.length) {
      chunks.push(buffer.subarray(offset));
      break;
    }

    if (!strippedChunkTypes.has(type)) {
      chunks.push(buffer.subarray(offset, offset + totalChunkSize));
    }

    offset += totalChunkSize;
    if (type === "IEND") break;
  }

  return Buffer.concat(chunks);
}

/**
 * Strips EXIF and XMP RIFF chunks from WebP buffers.
 */
function stripWebpMetadata(buffer: Buffer): Buffer {
  if (buffer.length < 12) return buffer;
  const keptChunks: Buffer[] = [];
  let offset = 12;

  while (offset + 8 <= buffer.length) {
    const fourCc = buffer.subarray(offset, offset + 4).toString("ascii");
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const paddedSize = chunkSize + (chunkSize % 2);
    const totalChunkBytes = 8 + paddedSize;

    if (offset + totalChunkBytes > buffer.length) {
      keptChunks.push(buffer.subarray(offset));
      break;
    }

    if (fourCc !== "EXIF" && fourCc !== "XMP ") {
      keptChunks.push(buffer.subarray(offset, offset + totalChunkBytes));
    }

    offset += totalChunkBytes;
  }

  const body = Buffer.concat(keptChunks);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(4 + body.length, 4);
  header.write("WEBP", 8, "ascii");

  return Buffer.concat([header, body]);
}

/**
 * Removes embedded EXIF/GPS/XMP/comment metadata from a verified image buffer.
 */
export function stripImageMetadata(
  buffer: Buffer,
  mime: AllowedImageMime
): Buffer {
  switch (mime) {
    case "image/jpeg":
      return stripJpegMetadata(buffer);
    case "image/png":
      return stripPngMetadata(buffer);
    case "image/webp":
      return stripWebpMetadata(buffer);
  }
}

/**
 * Validates magic bytes, enforces the 5 MB size cap, enforces maximum pixel dimensions
 * (`4096 x 4096`), and strips EXIF/GPS/comment metadata.
 */
export function validateAndSanitizeImageBuffer(buffer: Buffer): {
  sanitizedBuffer: Buffer;
  signature: DetectedImageSignature;
  dimensions: ImageDimensions | null;
} {
  if (!buffer || buffer.length === 0) {
    throw new Error("Uploaded file is empty.");
  }

  if (buffer.length > MAX_IMAGE_UPLOAD_BYTES) {
    throw new Error(
      `Image exceeds the maximum allowed size of ${Math.round(
        MAX_IMAGE_UPLOAD_BYTES / (1024 * 1024)
      )} MB.`
    );
  }

  const signature = detectImageMimeFromMagicBytes(buffer);
  if (!signature) {
    throw new Error(
      "Unsupported or invalid image file signature. Only genuine JPEG, PNG, and WebP images are permitted."
    );
  }

  const dimensions = extractImageDimensions(buffer, signature.mime);
  if (dimensions) {
    if (dimensions.width <= 0 || dimensions.height <= 0) {
      throw new Error("Image has invalid zero pixel dimensions.");
    }
    if (
      dimensions.width > MAX_IMAGE_PIXEL_DIMENSION ||
      dimensions.height > MAX_IMAGE_PIXEL_DIMENSION
    ) {
      throw new Error(
        `Image dimensions (${dimensions.width}x${dimensions.height}px) exceed the maximum allowed ${MAX_IMAGE_PIXEL_DIMENSION}x${MAX_IMAGE_PIXEL_DIMENSION} pixels.`
      );
    }
  }

  const sanitizedBuffer = stripImageMetadata(buffer, signature.mime);
  return { sanitizedBuffer, signature, dimensions };
}

/**
 * Local storage adapter writing files to `.storage/uploads` OUTSIDE `public/`.
 */
export class LocalOutsidePublicStorageAdapter implements ImageStorageAdapter {
  private readonly storageDir: string;

  constructor(customDir?: string) {
    this.storageDir =
      customDir ?? path.join(process.cwd(), ".storage", "uploads");
  }

  async storeSanitizedImage(params: {
    buffer: Buffer;
    aspectRatio?: "1:1" | "4:5";
  }): Promise<StoredImageRecord> {
    const { sanitizedBuffer, signature, dimensions } =
      validateAndSanitizeImageBuffer(params.buffer);

    await fs.mkdir(this.storageDir, { recursive: true });

    const sha256 = crypto
      .createHash("sha256")
      .update(sanitizedBuffer)
      .digest("hex");
    const uniqueId = crypto.randomUUID();
    const filename = `${uniqueId}.${signature.extension}`;
    const targetPath = path.join(
      /*turbopackIgnore: true*/ this.storageDir,
      filename
    );

    await fs.writeFile(targetPath, sanitizedBuffer, { flag: "wx" });

    return {
      storageKey: filename,
      url: `/api/uploads/${filename}`,
      mime: signature.mime,
      sizeBytes: sanitizedBuffer.length,
      sha256,
      dimensions,
      provider: "local",
    };
  }
}

export interface CloudStorageAdapterConfig {
  provider: "cloudinary" | "s3";
  cloudinaryCloudName?: string;
  cloudinaryApiKey?: string;
  cloudinaryApiSecret?: string;
  s3EndpointUrl?: string;
  s3Bucket?: string;
  s3PublicBaseUrl?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  s3Region?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Production S3 / Cloudinary adapter behind `ImageStorageAdapter`.
 * Always runs `validateAndSanitizeImageBuffer` (magic bytes, 5 MB cap, max 4096x4096 px,
 * EXIF/GPS stripping) on the server BEFORE uploading the sanitized buffer to Cloudinary or S3.
 */
export class CloudObjectStorageAdapter implements ImageStorageAdapter {
  private readonly config: CloudStorageAdapterConfig;

  constructor(config: CloudStorageAdapterConfig) {
    this.config = config;
  }

  async storeSanitizedImage(params: {
    buffer: Buffer;
    aspectRatio?: "1:1" | "4:5";
  }): Promise<StoredImageRecord> {
    const { sanitizedBuffer, signature, dimensions } =
      validateAndSanitizeImageBuffer(params.buffer);

    const sha256 = crypto
      .createHash("sha256")
      .update(sanitizedBuffer)
      .digest("hex");
    const uniqueId = crypto.randomUUID();
    const filename = `${uniqueId}.${signature.extension}`;
    const fetchFn = this.config.fetchImpl ?? fetch;

    if (this.config.provider === "cloudinary") {
      const cloudName = this.config.cloudinaryCloudName;
      const apiKey = this.config.cloudinaryApiKey;
      const apiSecret = this.config.cloudinaryApiSecret;
      if (!cloudName || !apiKey || !apiSecret) {
        throw new Error(
          "Cloudinary adapter requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET."
        );
      }

      const timestamp = String(Math.floor(Date.now() / 1000));
      const publicId = `kala-and-kiln/${uniqueId}`;
      const toSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
      const uploadSignature = crypto
        .createHash("sha1")
        .update(toSign)
        .digest("hex");

      const dataUri = `data:${signature.mime};base64,${sanitizedBuffer.toString("base64")}`;
      const formBody = new URLSearchParams({
        file: dataUri,
        api_key: apiKey,
        timestamp,
        public_id: publicId,
        signature: uploadSignature,
      });

      const response = await fetchFn(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: formBody.toString(),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Cloudinary image upload failed with status ${response.status}.`
        );
      }

      const payload = (await response.json()) as {
        secure_url?: string;
        public_id?: string;
      };

      return {
        storageKey: payload.public_id ?? publicId,
        url:
          payload.secure_url ??
          `https://res.cloudinary.com/${cloudName}/image/upload/${publicId}.${signature.extension}`,
        mime: signature.mime,
        sizeBytes: sanitizedBuffer.length,
        sha256,
        dimensions,
        provider: "cloudinary",
      };
    }

    // S3-compatible PUT upload with SHA-256 content integrity header and immutable Cache-Control
    const endpoint = (
      this.config.s3EndpointUrl ?? "https://s3.ap-south-1.amazonaws.com"
    ).replace(/\/$/, "");
    const bucket = this.config.s3Bucket;
    if (!bucket) {
      throw new Error("S3 storage adapter requires S3_UPLOAD_BUCKET.");
    }

    const objectKey = `products/${filename}`;
    const targetUrl = `${endpoint}/${encodeURIComponent(bucket)}/${objectKey}`;
    const response = await fetchFn(targetUrl, {
      method: "PUT",
      headers: {
        "Content-Type": signature.mime,
        "Content-Length": String(sanitizedBuffer.length),
        "Cache-Control": "public, max-age=31536000, immutable",
        "x-amz-content-sha256": sha256,
      },
      body: new Uint8Array(sanitizedBuffer),
    });

    if (!response.ok) {
      throw new Error(`S3 image upload failed with status ${response.status}.`);
    }

    const publicBase = (
      this.config.s3PublicBaseUrl ?? `${endpoint}/${bucket}`
    ).replace(/\/$/, "");

    return {
      storageKey: objectKey,
      url: `${publicBase}/${objectKey}`,
      mime: signature.mime,
      sizeBytes: sanitizedBuffer.length,
      sha256,
      dimensions,
      provider: "s3",
    };
  }
}

let activeStorageAdapter: ImageStorageAdapter | null = null;

export function getImageStorageAdapter(
  env: NodeJS.ProcessEnv = process.env
): ImageStorageAdapter {
  if (
    env.STORAGE_PROVIDER === "cloudinary" ||
    (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET)
  ) {
    return new CloudObjectStorageAdapter({
      provider: "cloudinary",
      cloudinaryCloudName: env.CLOUDINARY_CLOUD_NAME,
      cloudinaryApiKey: env.CLOUDINARY_API_KEY,
      cloudinaryApiSecret: env.CLOUDINARY_API_SECRET,
    });
  }

  if (env.STORAGE_PROVIDER === "s3" || env.S3_UPLOAD_BUCKET) {
    return new CloudObjectStorageAdapter({
      provider: "s3",
      s3EndpointUrl: env.S3_ENDPOINT_URL,
      s3Bucket: env.S3_UPLOAD_BUCKET,
      s3PublicBaseUrl: env.S3_PUBLIC_BASE_URL,
      s3AccessKeyId: env.S3_ACCESS_KEY_ID,
      s3SecretAccessKey: env.S3_SECRET_ACCESS_KEY,
      s3Region: env.S3_REGION ?? "ap-south-1",
    });
  }

  if (!activeStorageAdapter) {
    activeStorageAdapter = new LocalOutsidePublicStorageAdapter();
  }
  return activeStorageAdapter;
}
