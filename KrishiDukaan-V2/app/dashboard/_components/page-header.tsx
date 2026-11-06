"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { HelperIcon } from "../../../components/helpers";
import { HelperTextKey } from "../../i18n/helperTexts";

type PageHeaderProps = {
  title: string;
  description?: string;
  helperKey?: HelperTextKey;
  /** Shows a Back link: goes back in history, or to this page when opened directly. */
  backHref?: string;
};

function BackLink({ href }: { href: string }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      onClick={(e) => {
        if (window.history.length > 1) {
          e.preventDefault();
          router.back();
        }
      }}
      className="mb-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 -ml-2 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
    >
      <ArrowLeft className="h-4 w-4" /> Back
    </Link>
  );
}

export function PageHeader({ title, description, helperKey, backHref }: PageHeaderProps) {
  return (
    <div className="mb-6 md:mb-8">
      {backHref ? <BackLink href={backHref} /> : null}
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-on-surface md:text-3xl">
          {title}
        </h1>
        {helperKey ? (
          <HelperIcon
            size="sm"
            variant="ghost"
            side="right"
            textKey={helperKey}
            ariaLabel={`${title} help`}
          />
        ) : null}
      </div>
      {description ? (
        <p className="mt-1 max-w-2xl text-sm text-on-surface-variant md:text-base">
          {description}
        </p>
      ) : null}
    </div>
  );
}
