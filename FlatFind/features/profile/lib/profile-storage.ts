import { ref, uploadBytesResumable, getDownloadURL, deleteObject, type UploadTaskSnapshot } from 'firebase/storage';
import { storage } from '@/firebase/client';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB — generous for a profile photo, small enough to upload quickly on a mobile connection
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export class ProfilePhotoValidationError extends Error {}

/** Throws ProfilePhotoValidationError with a user-facing message if the file isn't an acceptable profile photo. Call before uploadProfilePhoto(). */
export function validateProfilePhoto(file: File): void {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new ProfilePhotoValidationError('Please choose a JPG, PNG, or WEBP image.');
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new ProfilePhotoValidationError('Image must be smaller than 5MB.');
  }
}

// One fixed path per user (profile-photos/{uid}/photo) rather than a
// timestamped/random filename — a new upload overwrites the same Storage
// object, so there's never more than one photo per user left behind to
// clean up, and storage.rules can scope access with a single
// {uid}-matching path segment (see that file). The task's "replace old
// images safely" requirement is satisfied by uploadBytesResumable's own
// atomicity: the old object at this path isn't touched until the new
// upload fully succeeds and this function returns — a failed/interrupted
// upload leaves the previous photo exactly as it was.
function photoRef(uid: string) {
  return ref(storage, `profile-photos/${uid}/photo`);
}

/**
 * Uploads a validated profile photo to Storage at profile-photos/{uid}/photo,
 * reporting progress via onProgress (0-100), and resolves with the photo's
 * download URL once the upload completes. Does NOT write anything to
 * Firestore — the caller (ProfileEditForm) is responsible for saving the
 * returned URL via profile-firestore.ts's updateUserProfile, keeping this
 * function's one job (Storage I/O) separate from the Firestore write, per
 * the existing repository/service pattern (one file per concern).
 */
export function uploadProfilePhoto(
  uid: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<string> {
  validateProfilePhoto(file);

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(photoRef(uid), file, { contentType: file.type });

    task.on(
      'state_changed',
      (snapshot: UploadTaskSnapshot) => {
        onProgress?.(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
      },
      (error) => reject(error),
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve(url);
        } catch (err) {
          reject(err);
        }
      },
    );
  });
}

/** Deletes the user's profile photo from Storage. Safe to call even if no photo was ever uploaded (Storage's "object not found" is swallowed, not thrown). */
export async function deleteProfilePhoto(uid: string): Promise<void> {
  try {
    await deleteObject(photoRef(uid));
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code: unknown }).code : undefined;
    if (code === 'storage/object-not-found') return;
    throw err;
  }
}
