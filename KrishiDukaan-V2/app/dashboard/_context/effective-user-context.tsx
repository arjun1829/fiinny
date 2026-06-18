"use client";

import { createContext, useContext } from "react";

export type EffectiveUser = {
  /** UID of the user whose data should be loaded (may differ from auth user in admin view). */
  uid: string | null;
  /** Firestore profile of the effective user. */
  profile: any | null;
  /** True when an admin is viewing another user's dashboard. */
  isAdminView: boolean;
  /** Display label used in the admin banner. */
  displayName: string;
};

export const EffectiveUserContext = createContext<EffectiveUser>({
  uid: null,
  profile: null,
  isAdminView: false,
  displayName: "",
});

export function useEffectiveUser(): EffectiveUser {
  return useContext(EffectiveUserContext);
}
