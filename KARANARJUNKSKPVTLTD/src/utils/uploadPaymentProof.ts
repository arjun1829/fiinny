import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

export interface AttachmentMeta {
  url: string;
  name: string;
  type: string;
}

/**
 * Downscales large phone-camera photos before upload (max 1600px on the long
 * edge, JPEG q0.8) so a multi-MB screenshot doesn't stall on a slow/mobile
 * upload connection. PDFs and already-small images pass through untouched.
 */
async function compressImageIfNeeded(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.size < 400_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxDim = 1600;
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
  } catch {
    return file; // Fall back to the original file if compression isn't supported/fails.
  }
}

/**
 * Uploads a payment proof file to Firebase Storage.
 * Path: tenants/{tenantId}/paymentProofs/{paymentId}-{timestamp}.{ext}
 */
export async function uploadPaymentProof(
  tenantId: string,
  paymentId: string,
  file: File,
): Promise<AttachmentMeta> {
  const upload = await compressImageIfNeeded(file);
  const ext = upload.name.split('.').pop()?.toLowerCase() || 'bin';
  const path = `tenants/${tenantId}/paymentProofs/${paymentId}-${Date.now()}.${ext}`;
  const fileRef = storageRef(storage, path);
  await uploadBytes(fileRef, upload);
  const url = await getDownloadURL(fileRef);
  return { url, name: file.name, type: upload.type };
}
