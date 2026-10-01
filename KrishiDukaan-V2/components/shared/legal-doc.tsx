/**
 * Shared shell for the legal documents (/terms, /seller-terms).
 *
 * These are server components with no interactivity — deliberately. A legal
 * page must render identically for a crawler, a farmer on a 2G connection and a
 * lawyer printing it to PDF, so there is no client JS, no accordion hiding
 * clauses behind a tap, and no data fetching in the layout.
 *
 * The two documents cross-link to each other and to the Privacy Policy on every
 * page, because the whole point of the structure is that a seller can get from
 * any one of them to the other two.
 */
import Link from "next/link";
import { COMPANY, LEGAL_EFFECTIVE_DATE, LEGAL_ROUTES } from "../../app/lib/legal";

/** The document set, for the cross-link strip. */
const DOCS: { href: string; label: string }[] = [
  { href: LEGAL_ROUTES.terms, label: "Terms & Conditions" },
  { href: LEGAL_ROUTES.privacy, label: "Privacy Policy" },
  { href: LEGAL_ROUTES.returns, label: "Return & Exchange Policy" },
  { href: LEGAL_ROUTES.sellerTerms, label: "Seller & Manufacturer Subscription Terms" },
];

export function LegalLinks({ current }: { current?: string }) {
  return (
    <nav
      aria-label="Legal documents"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold"
    >
      {DOCS.map((d) =>
        d.href === current ? (
          <span key={d.href} className="text-on-surface-variant">
            {d.label}
          </span>
        ) : (
          <Link key={d.href} href={d.href} className="text-primary hover:underline">
            {d.label}
          </Link>
        ),
      )}
    </nav>
  );
}

export function LegalDoc({
  title,
  intro,
  route,
  children,
}: {
  title: string;
  intro: React.ReactNode;
  /** This document's own route, so the cross-link strip can flatten it. */
  route: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-surface">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <nav
          aria-label="Breadcrumb"
          className="mb-8 flex items-center gap-2 text-xs font-semibold text-on-surface-variant"
        >
          <Link href="/" className="hover:text-primary">
            KrishiDukan
          </Link>
          <span>›</span>
          <span className="text-primary">{title}</span>
        </nav>

        <h1 className="text-3xl font-black leading-tight text-on-surface sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
          Effective {LEGAL_EFFECTIVE_DATE} · {COMPANY.brand}, operated by {COMPANY.name}
        </p>

        <div className="mt-6 rounded-2xl border border-surface-container bg-surface-container-low p-5 text-sm leading-relaxed text-on-surface-variant">
          {intro}
        </div>

        <div className="mt-10 space-y-9">{children}</div>

        <div className="mt-14 border-t border-surface-container pt-6">
          <p className="mb-3 text-[11px] font-black uppercase tracking-wider text-outline">
            Related documents
          </p>
          <LegalLinks current={route} />
        </div>
      </div>
    </main>
  );
}

/** One numbered clause. `n` is passed explicitly so the numbering is auditable. */
export function Clause({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  const id = `clause-${n}`;
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-lg font-black text-on-surface">
        <span className="text-primary">{n}.</span> {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-on-surface-variant">
        {children}
      </div>
    </section>
  );
}

/** A lettered sub-point inside a clause. */
export function Points({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="ml-1 space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
