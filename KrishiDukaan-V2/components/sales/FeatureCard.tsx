"use client";

import { useRouter } from "next/navigation";
import { ChevronRight, type LucideIcon } from "lucide-react";

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  accentColor?: string;
}

export default function FeatureCard({
  icon: Icon,
  title,
  description,
  href,
  accentColor = "bg-primary",
}: FeatureCardProps) {
  const router = useRouter();

  return (
    <button
      onClick={() => router.push(href)}
      className="group flex w-full items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-outline/10 transition active:scale-[0.98] hover:shadow-md hover:ring-primary/30 text-left"
    >
      <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${accentColor}`}>
        <Icon className="h-7 w-7 text-white" strokeWidth={1.75} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-on-surface">{title}</p>
        <p className="mt-0.5 text-xs text-on-surface-variant">{description}</p>
      </div>

      <ChevronRight className="h-5 w-5 shrink-0 text-outline/60 transition group-hover:text-primary group-hover:translate-x-0.5" />
    </button>
  );
}
