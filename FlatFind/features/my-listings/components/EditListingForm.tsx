'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Textarea, Select, FieldLabel, useToast } from '@/components/ui';
import { updateMyListing } from '../lib/my-listings-firestore';
import type { PostListingInput } from '@/features/posting/lib/posting-firestore';
import type { Listing, ListingCity, ListingType } from '@/types/listing';

const CITY_CHOICES: ListingCity[] = ['Bangalore', 'Hyderabad', 'Gurgaon'];
const TYPE_CHOICES: ListingType[] = ['1BHK', '2BHK', 'Flatmate'];

interface EditListingFormProps {
  listing: Listing;
}

function toFormInput(listing: Listing): PostListingInput {
  return {
    title: listing.title,
    description: listing.description,
    rent: listing.rent,
    location: listing.location,
    city: listing.city,
    type: listing.type,
    ownerName: listing.owner_name,
    phone: listing.contact_phone ?? '',
    email: listing.contact_email,
    imageUrl1: listing.image_urls[0] ?? '',
    imageUrl2: listing.image_urls[1] ?? '',
  };
}

// The edit counterpart to PostListingForm (features/posting/components) —
// same field set and layout so editing feels like the same form pre-filled,
// not a different experience. Kept as its own component rather than a
// shared base with PostListingForm: the two differ in what they submit to
// (submitListing's create vs. updateMyListing's update-by-id) and in scope
// rules (create always defaults to 'pending' status; edit never touches
// status/ownerId at all — see firestore.rules' Phase 13 update branch), so
// sharing one component would need branching logic where two small,
// separately-readable components are clearer.
export function EditListingForm({ listing }: EditListingFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [form, setForm] = useState<PostListingInput>(() => toFormInput(listing));
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = <K extends keyof PostListingInput>(key: K, value: PostListingInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await updateMyListing(listing.id, form);
      toast('✅ Listing updated.');
      router.push('/profile');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update listing. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-[540px] rounded-r2 border-[1.5px] border-border bg-white p-[30px]">
      <h1 className="mb-5 font-display text-2xl font-extrabold tracking-tight">Edit Listing</h1>

      <div className="mb-4">
        <FieldLabel>TITLE *</FieldLabel>
        <Input
          placeholder="e.g. 2BHK in Koramangala"
          value={form.title}
          onChange={(e) => update('title', e.target.value)}
          required
        />
      </div>

      <div className="mb-4">
        <FieldLabel>DESCRIPTION</FieldLabel>
        <Textarea
          placeholder="Describe the flat — furnishings, rules, contact…"
          value={form.description}
          onChange={(e) => update('description', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-[14px]">
        <div>
          <FieldLabel>RENT (₹/mo) *</FieldLabel>
          <Input
            type="number"
            placeholder="e.g. 20000"
            value={form.rent || ''}
            onChange={(e) => update('rent', Number(e.target.value))}
            required
          />
        </div>
        <div>
          <FieldLabel>CITY *</FieldLabel>
          <Select value={form.city} onChange={(e) => update('city', e.target.value as ListingCity)}>
            {CITY_CHOICES.map((city) => (
              <option key={city}>{city}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="mt-[14px]">
        <FieldLabel>LOCATION / AREA *</FieldLabel>
        <Input
          placeholder="e.g. Koramangala 5th Block"
          value={form.location}
          onChange={(e) => update('location', e.target.value)}
          required
        />
      </div>

      <div className="mt-[14px] grid grid-cols-2 gap-[14px]">
        <div>
          <FieldLabel>TYPE</FieldLabel>
          <Select value={form.type} onChange={(e) => update('type', e.target.value as ListingType)}>
            {TYPE_CHOICES.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </Select>
        </div>
        <div>
          <FieldLabel>YOUR NAME</FieldLabel>
          <Input placeholder="Full name" value={form.ownerName} onChange={(e) => update('ownerName', e.target.value)} />
        </div>
      </div>

      <div className="mt-[14px] grid grid-cols-2 gap-[14px]">
        <div>
          <FieldLabel>PHONE</FieldLabel>
          <Input placeholder="10-digit number" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
        </div>
        <div>
          <FieldLabel>EMAIL</FieldLabel>
          <Input placeholder="optional" value={form.email} onChange={(e) => update('email', e.target.value)} />
        </div>
      </div>

      <div className="mt-[14px]">
        <FieldLabel>PHOTO URL 1</FieldLabel>
        <Input placeholder="https://…" value={form.imageUrl1} onChange={(e) => update('imageUrl1', e.target.value)} />
      </div>
      <div className="mt-4">
        <FieldLabel>PHOTO URL 2 (optional)</FieldLabel>
        <Input placeholder="https://…" value={form.imageUrl2} onChange={(e) => update('imageUrl2', e.target.value)} />
      </div>

      {error && <p className="mt-3 text-[12.5px] text-red-600">{error}</p>}

      <div className="mt-4 flex gap-3">
        <Button variant="outline" type="button" className="flex-1 py-[13px] text-[15px]" onClick={() => router.push('/profile')}>
          Cancel
        </Button>
        <Button variant="brand" type="submit" className="flex-1 py-[13px] text-[15px]" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
}
