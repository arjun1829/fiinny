"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "../../i18n/I18nContext";
// Settings have been merged into the Profile page (Settings tab).
export default function SettingsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/profile?tab=settings");
  }, [router]);
  return null;
}
