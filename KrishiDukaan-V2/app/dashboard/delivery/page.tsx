import { Suspense } from "react";
import { DeliverySettingsPage } from "../_components/delivery-settings-page";

export default function DeliveryPage() {
  // DeliverySettingsPage reads `?setup` via useSearchParams, which requires a
  // Suspense boundary under the App Router.
  return (
    <Suspense fallback={null}>
      <DeliverySettingsPage />
    </Suspense>
  );
}
