import imageCompression from "browser-image-compression";
import type { UploadMetadata } from "firebase/storage";

const COMPRESSION_OPTIONS = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1200,
  useWebWorker: true,
  initialQuality: 0.78,
};

/**
 * Upload metadata for public images. Every uploader writes to a new
 * timestamped path, so the bytes behind a download URL never change and
 * browsers can keep them for a year instead of re-checking each image with
 * Storage on every page view (as banners and reels already do).
 */
export function imageUploadMetadata(file: Blob): UploadMetadata {
  return {
    contentType: file.type || "image/jpeg",
    cacheControl: "public, max-age=31536000, immutable",
  };
}

/** True if any pixel is not fully opaque. Errs towards true when unsure. */
async function hasTransparency(file: File): Promise<boolean> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return true;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const pixels = ctx.getImageData(0, 0, width, height).data;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] < 255) return true;
    }
    return false;
  } catch {
    return true;
  }
}

/**
 * Compresses an image File before upload: at most 1200px on the longest side.
 * Photos are saved as JPEG, so a PNG photo shrinks about tenfold; images with
 * transparency stay PNG so cut-out product shots keep their background. JPEG
 * rather than WebP because product images double as link-preview images
 * (og:image), and WhatsApp previews do not reliably show WebP.
 * GIF and SVG are uploaded unchanged, and so is any image that compression
 * would not make smaller. If compression fails, returns the original file so
 * the upload can still proceed.
 */
export async function compressImage(file: File): Promise<File> {
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;
  try {
    const keepPng = file.type !== "image/jpeg" && (await hasTransparency(file));
    const fileType = keepPng ? "image/png" : "image/jpeg";
    const compressed = await imageCompression(file, { ...COMPRESSION_OPTIONS, fileType });
    if (compressed.size >= file.size) return file;
    const extension = compressed.type === "image/png" ? "png" : "jpg";
    const name = `${file.name.replace(/\.[^./]+$/, "")}.${extension}`;
    return new File([compressed], name, { type: compressed.type });
  } catch {
    return file;
  }
}
