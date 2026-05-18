import type { Metadata } from "next";
import { PageHeader } from "../_components/page-header";
import { SettingsSections } from "../_components/settings-sections";

export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Shop profile, contact channels, address, and business preferences."
        helperKey="dashSettings"
      />
      <SettingsSections />
    </>
  );
}
