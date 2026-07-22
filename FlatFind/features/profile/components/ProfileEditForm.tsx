'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Button, Input, FieldLabel, useToast } from '@/components/ui';
import { useAuth } from '@/providers/auth-provider';
import { isValidIndianMobile } from '@/features/auth/lib/phone-auth';
import { updateUserProfile } from '../lib/profile-firestore';
import { uploadProfilePhoto, deleteProfilePhoto, validateProfilePhoto, ProfilePhotoValidationError } from '../lib/profile-storage';
import type { UserProfile } from '@/types/user';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ProfileEditFormProps {
  profile: UserProfile;
  maskedPhone: string;
  avatarGlyph: string;
}

// New in Phase 14 (User Profile Management) — the /profile/edit route's
// content. Matches EditListingForm's established shape (features/my-listings/
// components) — full-page form, useToast on success, router.push back to
// the parent page — rather than a modal, per the task's "avoid modal
// overload" and this app's own precedent for editing existing records.
//
// primaryPhone/uid/createdAt are deliberately absent from this form (the
// task's own "Non-editable" list) — primaryPhone is shown read-only via
// maskedPhone instead, exactly as ProfileInfoCard/the old avatar block
// already displayed it, so a user always sees which number they're signed
// in as without being able to change it here.
export function ProfileEditForm({ profile, maskedPhone, avatarGlyph }: ProfileEditFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { user, refreshProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Captured once from the profile this form was loaded with — not re-read
  // after save, so the UI doesn't flicker mid-submit (updateUserProfile's
  // own profileCompleted recompute happens after this render). Drives both
  // the onboarding-vs-editing copy below and handleSubmit's post-save
  // redirect (see ProfileCompletionGuard for the other half of this flow:
  // it's what sent an incomplete user here in the first place).
  const isOnboarding = !profile.profileCompleted;

  const [fullName, setFullName] = useState(profile.fullName ?? '');
  const [email, setEmail] = useState(profile.email ?? '');
  const [alternatePhone, setAlternatePhone] = useState(profile.alternatePhone ?? '');
  const [photoURL, setPhotoURL] = useState(profile.profilePhotoURL ?? null);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [pendingPhotoPreview, setPendingPhotoPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);

  const [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file after a validation error
    if (!file) return;

    try {
      validateProfilePhoto(file);
    } catch (err) {
      setError(err instanceof ProfilePhotoValidationError ? err.message : 'Could not use this image.');
      return;
    }

    setError('');
    setRemovePhoto(false);
    setPendingPhotoFile(file);
    // Local object URL for an immediate preview — the actual upload only
    // happens on Save, matching the task's "preserve the previous image
    // until a new upload succeeds" (nothing is written to Storage or
    // Firestore yet, so the currently-saved photo is untouched if the user
    // navigates away without saving).
    setPendingPhotoPreview(URL.createObjectURL(file));
  };

  const handleRemovePhoto = () => {
    setPendingPhotoFile(null);
    setPendingPhotoPreview(null);
    setRemovePhoto(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!fullName.trim()) {
      setError('Full name is required.');
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    const altDigits = alternatePhone.trim().replace(/\D/g, '');
    if (altDigits && !isValidIndianMobile(altDigits)) {
      setError('Alternate phone must be a valid 10-digit Indian mobile number.');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      let nextPhotoURL = photoURL ?? undefined;

      if (pendingPhotoFile) {
        setUploadProgress(0);
        nextPhotoURL = await uploadProfilePhoto(user.uid, pendingPhotoFile, setUploadProgress);
      } else if (removePhoto && photoURL) {
        await deleteProfilePhoto(user.uid);
        nextPhotoURL = undefined;
      }

      await updateUserProfile(user.uid, {
        fullName,
        email,
        alternatePhone: altDigits,
        // Only pass profilePhotoURL through when it actually changed this
        // save (new upload, or explicit removal) — updateUserProfile
        // leaves the stored field alone when this key is omitted, so an
        // edit that doesn't touch the photo can't accidentally null it out.
        ...(pendingPhotoFile || removePhoto ? { profilePhotoURL: nextPhotoURL ?? '' } : {}),
      });

      await refreshProfile();
      toast('✅ Profile updated.');
      // First-time completion lands on Home (spec's redirect diagram); a
      // routine edit by an already-complete user lands back on /profile,
      // same as before this change.
      router.push(isOnboarding ? '/' : '/profile');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile. Please try again.');
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  };

  const displayedPhoto = pendingPhotoPreview ?? (removePhoto ? null : photoURL);

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-[540px] rounded-r2 border-[1.5px] border-border bg-white p-[30px]">
      <h1 className="mb-1 font-display text-2xl font-extrabold tracking-tight">
        {isOnboarding ? 'Complete Your Profile' : 'Edit Profile'}
      </h1>
      <p className="mb-6 text-sm text-muted">
        {isOnboarding ? 'Add a few details to continue using FlatFind.' : 'Keep your details up to date.'}
      </p>

      <div className="mb-6 flex items-center gap-4">
        <div className="relative h-[76px] w-[76px] flex-shrink-0">
          {displayedPhoto ? (
            <Image
              src={displayedPhoto}
              alt="Profile photo preview"
              width={76}
              height={76}
              unoptimized={displayedPhoto.startsWith('blob:')}
              className="h-[76px] w-[76px] rounded-full object-cover shadow-card"
            />
          ) : (
            <div className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-2 font-display text-[26px] font-extrabold text-white shadow-card">
              {avatarGlyph}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoChange} />
          <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            {displayedPhoto ? 'Change Photo' : 'Upload Photo'}
          </Button>
          {displayedPhoto && (
            <button type="button" onClick={handleRemovePhoto} className="text-left text-[12.5px] font-semibold text-red-600 hover:underline">
              Remove Photo
            </button>
          )}
        </div>
      </div>

      {uploadProgress !== null && (
        <div className="mb-5">
          <div className="mb-1 flex items-center justify-between text-[11.5px] font-semibold text-muted">
            <span>Uploading photo…</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="h-[6px] w-full overflow-hidden rounded-full bg-bg">
            <div className="h-full rounded-full bg-brand transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      <div className="mb-4">
        <FieldLabel>FULL NAME *</FieldLabel>
        <Input placeholder="Your full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      </div>

      <div className="mb-4">
        <FieldLabel>EMAIL ADDRESS *</FieldLabel>
        <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>

      <div className="mb-4">
        <FieldLabel>PRIMARY PHONE NUMBER</FieldLabel>
        <div className="flex items-center gap-2 rounded-xl border-[1.5px] border-border bg-[#f5f4f2] px-[14px] py-[10px] text-sm text-muted">
          {maskedPhone}
          <span className="ml-auto rounded-full bg-white px-2 py-[2px] text-[10px] font-bold tracking-wide text-[#a8a29e]">VERIFIED</span>
        </div>
      </div>

      <div className="mb-2">
        <FieldLabel>ALTERNATE PHONE NUMBER (OPTIONAL)</FieldLabel>
        <div className="flex gap-[10px]">
          <div className="whitespace-nowrap rounded-xl border-[1.5px] border-border bg-[#f5f4f2] px-[14px] py-[10px] text-sm font-semibold text-ink">
            +91
          </div>
          <Input
            type="tel"
            maxLength={10}
            placeholder="10-digit mobile number"
            value={alternatePhone}
            onChange={(e) => setAlternatePhone(e.target.value.replace(/\D/g, ''))}
            className="flex-1"
          />
        </div>
      </div>

      {error && <p className="mt-3 text-[12.5px] text-red-600">{error}</p>}

      <div className="mt-6 flex gap-3">
        {/* No Cancel while onboarding — ProfileCompletionGuard would just redirect straight back here, so there's nowhere valid to cancel to yet. */}
        {!isOnboarding && (
          <Button variant="outline" type="button" className="flex-1 py-[13px] text-[15px]" onClick={() => router.push('/profile')}>
            Cancel
          </Button>
        )}
        <Button variant="brand" type="submit" className="flex-1 py-[13px] text-[15px]" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
}
