import Link from "next/link";
import { Package, PlusCircle, BarChart3, ReceiptText } from "lucide-react";
import { HelperIcon } from "../../../components/helpers";

const actions = [
  {
    href: "/dashboard/inventory",
    label: "Add product",
    sub: "Create a new listing",
    icon: PlusCircle,
  },
  {
    href: "/dashboard/inventory",
    label: "Adjust stock",
    sub: "Update quantities",
    icon: Package,
  },
  {
    href: "/dashboard/analytics",
    label: "View analytics",
    sub: "Traffic & calls",
    icon: BarChart3,
  },
  {
    href: "/dashboard/orders",
    label: "Manage orders",
    sub: "Incoming delivery orders",
    icon: ReceiptText,
  },
] as const;

export function QuickActions() {
  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-ambient md:p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-on-surface">Quick actions</h2>
        <HelperIcon
          size="xs"
          variant="ghost"
          side="right"
          textKey="dashQuickActions"
          ariaLabel="Quick actions help"
        />
      </div>
      <p className="mt-1 text-sm text-on-surface-variant">
        Shortcuts to common shop tasks
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {actions.map(({ href, label, sub, icon: Icon }) => (
          <li key={label}>
            <Link
              href={href}
              className="flex items-start gap-3 rounded-xl border border-outline-variant/25 bg-surface-container-low/80 p-3 transition-colors hover:border-primary/40 hover:bg-surface-container"
            >
              <span className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
                <Icon className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-sm font-medium text-on-surface">{label}</span>
                <span className="block text-xs text-on-surface-variant">{sub}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
