'use client';

/**
 * A tiny local-development-only badge showing which Firebase backend the
 * running app is wired to, so PRODUCTION and UAT are impossible to confuse
 * while developing locally.
 *
 * Visibility is gated on the BUILD-TIME dev flag `process.env.NODE_ENV`
 * (Next.js's equivalent of Vite's `import.meta.env.DEV`). It is `development`
 * only under `next dev` — which is what BOTH `npm run dev` and `npm run dev:uat`
 * (scripts/dev-uat.js spawns `next dev`) run. Hosted builds run
 * `next build`/`next start`, where NODE_ENV is `production`, so this whole
 * component is dead-code-eliminated from the shipped bundle and can never
 * appear on the hosted production OR hosted UAT sites.
 *
 * The LABEL is derived from the actual backend (NEXT_PUBLIC_FIREBASE_PROJECT_ID),
 * not from the command name — `npm run dev` genuinely points at the production
 * Firebase project (krishidukan-e8315), so that is reported honestly as
 * PRODUCTION. The UAT project (karan-arjun-uat) is reported as UAT.
 */

const UAT_PROJECT_ID = 'karan-arjun-uat';

export function EnvBadge() {
  if (process.env.NODE_ENV !== 'development') return null;

  const projectId =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'krishidukan-e8315';
  const isUat = projectId === UAT_PROJECT_ID;

  const label = isUat ? 'UAT' : 'PRODUCTION';
  const classes = isUat
    ? 'bg-orange-100 text-orange-700 border-orange-300'
    : 'bg-red-100 text-red-700 border-red-300';

  return (
    <span
      className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest leading-none ${classes}`}
      title={`Local dev — connected to ${isUat ? 'UAT' : 'PRODUCTION'} Firebase (${projectId})`}
    >
      {label}
    </span>
  );
}
