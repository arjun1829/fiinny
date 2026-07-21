import { Button } from '@/components/ui';

interface ResultsBarProps {
  count: number;
  mapOpen: boolean;
  onToggleMap: () => void;
}

// Mirrors #rcount + #map-btn/toggleMap() (index (1).html, results bar row +
// MAP block). The "free reveals left" suffix depends on auth/payments state
// (Phase 8/11) — still omitted. The debug-sync button (`debugFetch()`) is
// dead developer tooling per the architecture report (§1.9) and is not
// ported at all. Map View button text/color swap matches the original's
// exact toggleMap() DOM mutation (🗺️ Map View <-> 📋 List View,
// brand-filled when active).
export function ResultsBar({ count, mapOpen, onToggleMap }: ResultsBarProps) {
  return (
    <div className="mb-[14px] flex flex-wrap items-center justify-between gap-2">
      <div className="text-sm text-muted">
        <strong className="font-extrabold text-ink">{count}</strong> listings found
      </div>
      <Button variant={mapOpen ? 'brand' : 'outline'} size="xs" onClick={onToggleMap}>
        {mapOpen ? '📋 List View' : '🗺️ Map View'}
      </Button>
    </div>
  );
}
