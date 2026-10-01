"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, Send } from "lucide-react";
import { cn } from "../../../dashboard/_lib/cn";

const TABS = [
  {
    href: "/admin/whatsapp",
    label: "Support Inbox",
    description: "Customer conversations & replies",
    icon: MessageSquare,
  },
  {
    href: "/admin/whatsapp/templates",
    label: "Send Messages",
    description: "Send approved WhatsApp templates",
    icon: Send,
  },
] as const;

export function WaSubNav() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 border-b border-gray-200 mb-4">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = href === "/admin/whatsapp"
          ? pathname === "/admin/whatsapp"
          : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              active
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
