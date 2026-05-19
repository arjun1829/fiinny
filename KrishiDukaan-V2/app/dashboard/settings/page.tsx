"use client";

import { PageHeader } from "../_components/page-header";
import { SettingsSections } from "../_components/settings-sections";
import { useI18n } from "../../i18n/I18nContext";

export default function SettingsPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader
        title={t('settingsTitle')}
        description={t('settingsDesc')}
        helperKey="dashSettings"
      />
      <SettingsSections />
    </>
  );
}
