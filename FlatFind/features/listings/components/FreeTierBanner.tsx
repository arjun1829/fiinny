import { Button } from '@/components/ui';
import { FREE_CONTACTS } from '@/constants/listing-display';

// Mirrors .free-ticker/#free-ticker (index (1).html). Shows the static
// FREE_CONTACTS ceiling since there's no real session/reveal-count state
// until Phase 8 (auth) + the reveals subcollection (Phase 3/architecture
// doc, §3.5) exist. The original hides this entirely once S.isPaid is true
// — that condition doesn't exist yet either, so it always renders for now.
export function FreeTierBanner() {
  return (
    <div className="mt-7 rounded-r2 border-[1.5px] border-border bg-white p-[22px] text-center">
      <div className="mb-3 text-[13.5px] text-muted">
        Free contact reveals remaining: <strong className="text-brand-2">{FREE_CONTACTS}</strong> · All listings
        visible — upgrade to unlock unlimited contacts
      </div>
      {/* Phase 11 (payments) wires this to the real upgrade flow. */}
      <Button variant="brand" className="px-7 py-[11px] text-sm" disabled>
        ⚡ Unlock Unlimited — ₹499/mo
      </Button>
    </div>
  );
}
