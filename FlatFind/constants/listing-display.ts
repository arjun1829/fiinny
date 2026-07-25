import type { ListingCity, ListingTag, ListingType } from '@/types/listing';

// Mirrors TCFG (index (1).html, main IIFE) — badge styling per listing tag.
export const TAG_CONFIG: Record<ListingTag, { badgeVariant: ListingTag; label: string }> = {
  owner: { badgeVariant: 'owner', label: 'Owner' },
  broker: { badgeVariant: 'broker', label: 'Broker' },
  flatmate: { badgeVariant: 'flatmate', label: 'Flatmate' },
};

// Mirrors CCOL — the per-city accent color used for the city dot in card meta.
export const CITY_COLOR_CLASS: Record<ListingCity, string> = {
  Bangalore: 'text-city-blr',
  Hyderabad: 'text-city-hyd',
  Gurgaon: 'text-city-gur',
};

// Mirrors TICO — the emoji placeholder shown when a listing has no photos.
export const TYPE_ICON: Record<ListingType, string> = {
  '1BHK': '🏠',
  '2BHK': '🏡',
  Flatmate: '👥',
};

export const FREE_CONTACTS = 4;
export const EXPIRY_DAYS = 30;
