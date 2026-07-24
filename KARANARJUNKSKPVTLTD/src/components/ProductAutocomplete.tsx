import { useState, useEffect, useRef, useMemo } from 'react';

/** Minimal product shape this picker needs. Compatible with the products collection. */
export interface ProductLite {
  id: string;
  name: string;
  baseUnit?: string;
  unit?: string;
  // Purchase invoice fields
  purchasePrice?: number;
  gstPct?: number;
  retailerPrice?: number;
  boxCapacity?: number;
  unitSize?: number;
  unitMeasure?: string;
}

interface ProductAutocompleteProps {
  value: string;
  /** Free-text typing — keeps the field fully editable. */
  onChange: (text: string) => void;
  /** Fired when a catalog product is picked (mouse or keyboard). */
  onSelect: (product: ProductLite) => void;
  /** Catalog provided by the parent (fetched once per modal open). */
  products: ProductLite[];
  placeholder?: string;
  style?: React.CSSProperties;
}

const MAX_RESULTS = 15;
const DEBOUNCE_MS = 150;

export default function ProductAutocomplete({
  value, onChange, onSelect, products, placeholder, style,
}: ProductAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState(value);
  const [highlight, setHighlight] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);

  // Debounce the query used for filtering (typing stays instant via `value`).
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [value]);

  const matches = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(p => (p.name || '').toLowerCase().includes(q))
      .slice(0, MAX_RESULTS);
  }, [debounced, products]);

  // Keep the highlighted index within the current result set (clamp during render
  // rather than resetting via an effect).
  const activeIndex = matches.length === 0 ? 0 : Math.min(highlight, matches.length - 1);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const showDropdown = open && debounced.trim().length > 0;

  const pick = (p: ProductLite) => {
    onSelect(p);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!showDropdown || matches.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(Math.min(activeIndex + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(Math.max(activeIndex - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(matches[activeIndex]);
    }
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <input
        className="input-field"
        placeholder={placeholder}
        value={value}
        onChange={e => { onChange(e.target.value); setHighlight(0); setOpen(true); }}
        onFocus={() => { if (value.trim()) setOpen(true); }}
        onKeyDown={onKeyDown}
        style={{ width: '100%', margin: 0, ...style }}
        role="combobox"
        aria-expanded={showDropdown}
        aria-autocomplete="list"
        autoComplete="off"
      />
      {showDropdown && (
        <div
          className="glass-panel"
          role="listbox"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 1100,
            maxHeight: '220px', overflowY: 'auto', padding: '0.25rem',
            borderRadius: '10px', boxShadow: '0 8px 24px hsla(220,30%,4%,0.5)',
          }}
        >
          {matches.length === 0 ? (
            <div style={{ padding: '0.6rem 0.7rem', fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>
              No products found
            </div>
          ) : (
            matches.map((p, i) => (
              <div
                key={p.id}
                role="option"
                aria-selected={i === activeIndex}
                onMouseDown={e => { e.preventDefault(); pick(p); }}
                onMouseEnter={() => setHighlight(i)}
                style={{
                  padding: '0.5rem 0.7rem', borderRadius: '7px', cursor: 'pointer',
                  fontSize: '0.85rem',
                  background: i === activeIndex ? 'var(--surface-raised)' : 'transparent',
                  display: 'flex', justifyContent: 'space-between', gap: '0.5rem',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                {(p.baseUnit || p.unit) && (
                  <span style={{ color: 'var(--text-tertiary)', fontSize: '0.72rem', flexShrink: 0 }}>
                    {p.baseUnit || p.unit}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
