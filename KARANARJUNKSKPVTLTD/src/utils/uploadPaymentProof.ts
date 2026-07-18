import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

export interface AttachmentMeta {
  url: string;
  name: string;
  type: string;
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
  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const path = `tenants/${tenantId}/paymentProofs/${paymentId}-${Date.now()}.${ext}`;
  const fileRef = storageRef(storage, path);
  await uploadBytes(fileRef, file);
  const url = await getDownloadURL(fileRef);
  return { url, name: file.name, type: file.type };
}
