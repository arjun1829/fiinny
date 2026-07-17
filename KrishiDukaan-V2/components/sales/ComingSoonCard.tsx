import { type LucideIcon } from "lucide-react";

interface ComingSoonCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export default function ComingSoonCard({ icon: Icon, title, description }: ComingSoonCardProps) {
  return (
    <div className="flex w-full items-center gap-4 rounded-2xl bg-white/60 p-4 ring-1 ring-outline/10 opacity-60">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-surface-container">
        <Icon className="h-7 w-7 text-outline" strokeWidth={1.5} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-on-surface">{title}</p>
          <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-outline">
            Soon
          </span>
        </div>
        <p className="mt-0.5 text-xs text-on-surface-variant">{description}</p>
      </div>
    </div>
  );
}
