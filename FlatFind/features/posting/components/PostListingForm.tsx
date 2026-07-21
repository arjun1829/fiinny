'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Textarea, Select, FieldLabel, useToast } from '@/components/ui';
import { useAuth } from '@/providers/auth-provider';
import { submitListing, type PostListingInput } from '../lib/posting-firestore';
import type { ListingCity, ListingType } from '@/types/listing';

const CITY_CHOICES: ListingCity[] = ['Bangalore', 'Hyderabad', 'Gurgaon'];
const TYPE_CHOICES: ListingType[] = ['1BHK', '2BHK', 'Flatmate'];

const EMPTY_FORM: PostListingInput = {
  title: '',
  description: '',
  rent: 0,
  location: '',
  city: 'Bangalore',
  type: '1BHK',
  ownerName: '',
  phone: '',
  email: '',
  imageUrl1: '',
  imageUrl2: '',
};

// Mirrors #post-overlay's .post-box form (index (1).html, POST MODAL block)
// — same fields, same layout (.fgrid two-column pairs), same required-field
// set (title/rent/location). Two real differences from submitPost():
//
//   1. This is a full page at /post, not a modal (the original's
//      "+ Post" button opened #post-overlay over whatever tab was
//      showing). A dedicated route is more consistent with the rest of
//      this rebuild's routing (§3.9) and means a direct link to /post
//      works, which `onclick="openPost()"` never could.
//   2. On success, the listing is written as 'pending' (submitListing(),
//      posting-firestore.ts) and the user is redirected home with a toast
//      explaining moderation — the original's "✅ Your listing has been
//      posted!" implied it was already live, which would now be
//      inaccurate.
export function PostListingForm() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<PostListingInput>(EMPTY_FORM);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = <K extends keyof PostListingInput>(key: K, value: PostListingInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return; // the page itself is auth-gated; this is just a type-narrowing guard

    setError('');
    setSubmitting(true);
    try {
      await submitListing(form, user.uid);
      toast('✅ Listing submitted! It will appear once an admin reviews it.');
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit listing. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-[540px] rounded-r2 border-[1.5px] border-border bg-white p-[30px]">
      <h1 className="mb-5 font-display text-2xl font-extrabold tracking-tight">Post a Listing</h1>

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

      <Button variant="brand" type="submit" className="mt-4 w-full py-[13px] text-[15px]" disabled={submitting}>
        {submitting ? 'Submitting…' : 'Submit Listing'}
      </Button>
    </form>
  );
}
