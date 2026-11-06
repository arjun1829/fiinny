"use client";

import { createContext, useContext } from "react";
import type { StaffPermission } from "../../lib/shop-team";

/** Set when a shop helper (app/lib/shop-team.ts) is managing someone else's shop. */
export type StaffSession = {
  ownerPhone: string;
  ownerName: string;
  staffName: string;
  permissions: StaffPermission[];
};

export type EffectiveUser = {
  /** UID of the user whose data should be loaded (may differ from auth user in admin view). */
  uid: string | null;
  /** Firestore profile of the effective user. */
  profile: any | null;
  /** True when an admin is viewing another user's dashboard. */
  isAdminView: boolean;
  /** Display label used in the admin banner. */
  displayName: string;
  /** Non-null while a helper manages the shop with their own login. */
  staff?: StaffSession | null;
};

export const EffectiveUserContext = createContext<EffectiveUser>({
  uid: null,
  profile: null,
  isAdminView: false,
  displayName: "",
  staff: null,
});

export function useEffectiveUser(): EffectiveUser {
  return useContext(EffectiveUserContext);
}
