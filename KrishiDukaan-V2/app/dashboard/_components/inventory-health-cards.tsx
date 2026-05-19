import { HelperIcon } from "../../../components/helpers";
import { HelperTextKey } from "../../i18n/helperTexts";

type InventoryHealthCardsProps = {
  inStock: number;
  lowStock: number;
  outOfStock: number;
  score: number;
  label: string;
};

export function InventoryHealthCards({
  inStock,
  lowStock,
  outOfStock,
  score,
  label,
}: InventoryHealthCardsProps) {
  const cards: Array<{ title: string; value: number; tone: string; helperKey: HelperTextKey }> = [
    { title: "In stock", value: inStock, tone: "text-primary", helperKey: "dashInvInStock" },
    { title: "Low stock", value: lowStock, tone: "text-harvest", helperKey: "dashInvLowStock" },
    { title: "Out of stock", value: outOfStock, tone: "text-secondary", helperKey: "dashInvOutOfStock" },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.title}
          className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-ambient"
        >
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-on-surface-variant">{c.title}</p>
            <HelperIcon
              size="xs"
              variant="ghost"
              side="bottom"
              textKey={c.helperKey}
              ariaLabel={`${c.title} help`}
            />
          </div>
          <p className={`mt-2 text-2xl font-bold tabular-nums ${c.tone}`}>{c.value}</p>
        </div>
      ))}
      <div className="rounded-2xl border border-outline-variant/30 bg-primary/5 p-4 shadow-ambient sm:col-span-2 lg:col-span-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-on-surface-variant">Health score</p>
          <HelperIcon
            size="xs"
            variant="ghost"
            side="bottom"
            textKey="dashInvHealthScore"
            ariaLabel="Health score help"
          />
        </div>
        <p className="mt-2 text-2xl font-bold tabular-nums text-primary">{score}</p>
        <p className="mt-1 text-xs font-medium text-primary">{label}</p>
      </div>
    </div>
  );
}
