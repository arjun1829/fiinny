import type { Amenity, Availability, Furnishing, ListingCity, ListingTag, ListingType, TenantPreference } from '@/types/listing';

// Mirrors CITIES/TYPES/BUDGETS (index (1).html, main IIFE) and
// FP_CITIES/FP_TYPES/FP_BUDGETS/FP_TAGS/FP_FURNISH/FP_AVAIL/FP_TENANT/
// FP_AMENITY (head script). The original's FP_CITIES included Mumbai and
// Noida (matching the page's SEO copy) while the actual filterable CITIES
// list — and every seed/CSV/Sheet listing — only ever covers Bangalore,
// Hyderabad, Gurgaon (architecture report §1.5 flags this inconsistency).
// Mumbai/Noida are omitted here rather than reproduced as options that
// would always return zero results.
export const CITY_OPTIONS: Array<ListingCity | 'All'> = ['All', 'Bangalore', 'Hyderabad', 'Gurgaon'];
export const TYPE_OPTIONS: Array<ListingType | 'All'> = ['All', '1BHK', '2BHK', 'Flatmate'];

export interface BudgetBucket {
  label: string;
  min: number;
  max: number;
}

export const BUDGET_OPTIONS: BudgetBucket[] = [
  { label: 'Any', min: 0, max: Infinity },
  { label: 'Under ₹15K', min: 0, max: 15000 },
  { label: '₹15K–25K', min: 15000, max: 25000 },
  { label: 'Above ₹25K', min: 25000, max: Infinity },
];

export const TAG_OPTIONS: Array<ListingTag | 'All'> = ['All', 'owner', 'broker', 'flatmate'];
export const TAG_LABELS: Record<ListingTag | 'All', string> = {
  All: 'All',
  owner: 'Owner',
  broker: 'Broker',
  flatmate: 'Flatmate',
};

export const FURNISHING_OPTIONS: Array<Furnishing | 'All'> = ['All', 'Fully Furnished', 'Semi Furnished', 'Unfurnished'];
export const AVAILABILITY_OPTIONS: Array<Availability | 'All'> = ['All', 'Immediate', 'Within 15 Days', 'Within 30 Days'];
export const TENANT_OPTIONS: Array<TenantPreference | 'All'> = ['All', 'Anyone', 'Family', 'Male', 'Female'];
export const AMENITY_OPTIONS: Array<Amenity | 'All'> = ['All', 'Gym', 'Parking', 'Pool', 'Power Backup', 'Security', 'Lift'];

export type SortKey = 'newest' | 'price_up' | 'price_dn' | 'nearest';

export const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'newest', label: '🕐 Newest First' },
  { value: 'price_up', label: '↑ Price: Low to High' },
  { value: 'price_dn', label: '↓ Price: High to Low' },
  { value: 'nearest', label: '📍 Nearest First' },
];
