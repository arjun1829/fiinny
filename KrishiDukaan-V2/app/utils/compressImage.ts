import imageCompression from "browser-image-compression";

const COMPRESSION_OPTIONS = {
  maxSizeMB: 2,
  maxWidthOrHeight: 1200,
  useWebWorker: true,
  initialQuality: 0.78,
};

/**
 * Compresses an image File before upload.
 * If compression fails, returns the original file so the upload can still proceed.
 */
export async function compressImage(file: File): Promise<File> {
  try {
    const compressed = await imageCompression(file, COMPRESSION_OPTIONS);
    // imageCompression returns a Blob; preserve the original filename
    return new File([compressed], file.name, { type: compressed.type });
  } catch {
    return file;
  }
}
