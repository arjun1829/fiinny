/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ICONS } from '../constants';
import { useI18n } from '../i18n/I18nContext';
import { HELP_SECTIONS, HelpBlock, HelpSection } from './helpContent';
import { getHelpEnrichment, HelpEnrichment } from './helpMedia';
import { ScreenshotGallery, SectionActions } from './helpComponents';

/** The translator function shape returned by useI18n().t — derived so it stays in sync. */
type TFn = ReturnType<typeof useI18n>['t'];

interface HelpViewProps {
  /** Navigate back into the rest of the app (re-uses the parent router). */
  onNavigate?: (view: string) => void;
  /** Current Firebase user (for auth-aware dashboard deep links). */
  user?: unknown;
  /** Current user role (customer | retailer | manufacturer | admin). */
  userRole?: string;
}

/**
 * KrishiDukan Help / Documentation page.
 *
 * Documentation-style layout:
 *  - Hero intro (matches the existing primary-color hero used across the portal)
 *  - Sticky "On this page" table of contents with scroll-spy + live search filter
 *  - Collapsible/expandable section cards rendering the full functional-flow docs
 *  - Smooth scrolling, expand/collapse-all and back-to-top affordances
 *
 * This view is fully self-contained: it reuses the shared design tokens, ICONS and
 * i18n utilities and does not touch any existing routing, state or component logic.
 */
export default function HelpView({ onNavigate, user, userRole }: HelpViewProps) {
  const { t } = useI18n();
  const router = useRouter();
  // Dashboard deep links are only offered to logged-in retailers/manufacturers,
  // mirroring the navbar's canAccessDashboard rule so guests aren't bounced to the paywall.
  const canAccessDashboard =
    !!user && (userRole === 'retailer' || userRole === 'manufacturer');
  // 'route' deep links open real Next pages via the router (same pattern as the navbar).
  const onOpenRoute = useCallback((route: string) => router.push(route), [router]);
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string>(HELP_SECTIONS[0]?.id ?? '');
  const [showTop, setShowTop] = useState(false);
  // Track which sections are open. Default: all open for a documentation read-through.
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(HELP_SECTIONS.map((s) => s.id)));
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const normalizedQuery = query.trim().toLowerCase();

  // Searchable text per section (title + summary + all block text) for the filter.
  // Every field is an i18n key resolved through t(), so search works in the active language.
  const sectionMatches = useCallback(
    (section: HelpSection): boolean => {
      if (!normalizedQuery) return true;
      const haystack: string[] = [t(section.titleKey), t(section.summaryKey)];
      section.blocks.forEach((b) => {
        if (b.kind === 'p' || b.kind === 'sub' || b.kind === 'note') haystack.push(t(b.key));
        else if (b.kind === 'list' || b.kind === 'steps' || b.kind === 'states')
          haystack.push(...b.keys.map((k) => t(k)));
        else if (b.kind === 'flow')
          b.layers.forEach((l) => haystack.push(t(l.titleKey), ...l.keys.map((k) => t(k))));
      });
      // Fold in screenshot captions + deep-link labels so search covers them too.
      const enrichment = getHelpEnrichment(section.id);
      enrichment?.media?.forEach((m) => haystack.push(t(m.captionKey)));
      enrichment?.links?.forEach((l) => haystack.push(t(l.labelKey)));
      return haystack.join(' ').toLowerCase().includes(normalizedQuery);
    },
    [normalizedQuery, t],
  );

  const visibleSections = useMemo(
    () => HELP_SECTIONS.filter(sectionMatches),
    [sectionMatches],
  );

  // When searching, auto-expand the matching sections so results are readable.
  useEffect(() => {
    if (normalizedQuery) {
      setOpenIds(new Set(visibleSections.map((s) => s.id)));
    }
  }, [normalizedQuery, visibleSections]);

  // Scroll-spy: highlight the TOC item for the section currently in view.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target?.id) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-30% 0px -60% 0px', threshold: 0 },
    );
    Object.values(sectionRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [visibleSections]);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 600);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToSection = (id: string) => {
    setOpenIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    // Defer so a freshly-expanded section has its full height before scrolling.
    requestAnimationFrame(() => {
      const el = sectionRefs.current[id];
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY - 90;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  };

  const toggleSection = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const expandAll = () => setOpenIds(new Set(HELP_SECTIONS.map((s) => s.id)));
  const collapseAll = () => setOpenIds(new Set());
  const allOpen = openIds.size === HELP_SECTIONS.length;

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative bg-primary overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.6) 1px, transparent 0)',
            backgroundSize: '22px 22px',
          }}
        />
        <div className="relative z-10 px-4 md:px-10 max-w-7xl mx-auto w-full py-12 md:py-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <span className="inline-flex items-center gap-2 text-primary-on-container text-[11px] font-black uppercase tracking-widest mb-4 bg-white/10 px-3 py-1.5 rounded-full">
              <ICONS.Docs className="w-3.5 h-3.5" />
              {t('helpHeroBadge')}
            </span>
            <h1 className="text-white text-3xl md:text-5xl font-bold tracking-tight leading-tight mb-4 max-w-3xl">
              {t('helpHeroTitle')}
            </h1>
            <p className="text-white/80 text-base md:text-lg max-w-2xl leading-relaxed">
              {t('helpHeroSubtitle')}
            </p>
            <div className="mt-6 flex items-center gap-2 text-white/70 text-xs font-bold uppercase tracking-widest">
              <ICONS.Compass className="w-4 h-4" />
              <span>{t('helpReadingTime')}</span>
              <span className="opacity-40">•</span>
              <span>{HELP_SECTIONS.length} sections</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Body */}
      <div className="px-4 md:px-10 max-w-7xl mx-auto w-full py-8 md:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8 lg:gap-10 items-start">
          {/* Sidebar — Table of contents */}
          <aside className="lg:sticky lg:top-[88px] lg:max-h-[calc(100vh-110px)] flex flex-col gap-3">
            {/* Search */}
            <div className="relative">
              <div className="flex items-center bg-white border border-outline-variant rounded-2xl overflow-hidden shadow-sm group focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
                <ICONS.Search className="w-4 h-4 text-outline group-focus-within:text-primary transition-colors shrink-0 ml-3" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('helpSearchPlaceholder')}
                  aria-label={t('helpSearchPlaceholder')}
                  className="flex-1 min-w-0 bg-transparent border-none focus:ring-0 text-xs text-on-surface px-2 py-2.5 placeholder-on-surface-variant font-medium"
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    aria-label={t('helpClearSearch')}
                    className="mr-2 text-outline hover:text-on-surface transition-colors"
                  >
                    <ICONS.X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Expand / collapse all */}
            <div className="hidden lg:flex items-center justify-between px-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                {t('helpOnThisPage')}
              </span>
              <button
                onClick={allOpen ? collapseAll : expandAll}
                className="text-[10px] font-bold text-primary hover:underline"
              >
                {allOpen ? t('helpCollapseAll') : t('helpExpandAll')}
              </button>
            </div>

            {/* TOC list */}
            <nav className="bg-white border border-surface-container rounded-2xl p-2 overflow-y-auto shadow-sm">
              {visibleSections.length === 0 ? (
                <p className="px-3 py-4 text-xs text-on-surface-variant">{t('helpNoResults')}</p>
              ) : (
                <ul className="flex flex-col">
                  {visibleSections.map((section, i) => {
                    const Icon = ICONS[section.icon];
                    const isActive = activeId === section.id;
                    return (
                      <li key={section.id}>
                        <button
                          onClick={() => scrollToSection(section.id)}
                          className={`w-full flex items-center gap-2.5 text-left px-3 py-2 rounded-xl transition-colors ${
                            isActive
                              ? 'bg-primary/10 text-primary font-bold'
                              : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
                          }`}
                        >
                          <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary' : 'text-outline'}`} />
                          <span className="text-xs leading-snug">
                            <span className="opacity-50 mr-1 font-mono">{i + 1}.</span>
                            {t(section.titleKey)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </nav>
          </aside>

          {/* Main content */}
          <main className="flex flex-col gap-5">
            {visibleSections.length === 0 ? (
              <div className="bg-white border border-surface-container rounded-3xl p-10 text-center shadow-sm">
                <ICONS.Search className="w-8 h-8 text-outline mx-auto mb-3" />
                <p className="font-bold text-on-surface mb-1">{t('helpNoResults')}</p>
                <button
                  onClick={() => setQuery('')}
                  className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline"
                >
                  {t('helpClearSearch')}
                </button>
              </div>
            ) : (
              visibleSections.map((section, i) => (
                <SectionCard
                  key={section.id}
                  index={i + 1}
                  section={section}
                  enrichment={getHelpEnrichment(section.id)}
                  open={openIds.has(section.id)}
                  onToggle={() => toggleSection(section.id)}
                  registerRef={(el) => {
                    sectionRefs.current[section.id] = el;
                  }}
                  title={t(section.titleKey)}
                  summary={t(section.summaryKey)}
                  canAccessDashboard={canAccessDashboard}
                  onNavigate={onNavigate}
                  onOpenRoute={onOpenRoute}
                  t={t}
                />
              ))
            )}

            {/* Need more help CTA */}
            <div className="bg-gradient-to-br from-primary to-primary-container rounded-3xl p-6 md:p-8 text-white shadow-ambient mt-2">
              <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
                <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
                  <ICONS.Help className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold mb-1">{t('helpNeedMoreHelp')}</h3>
                  <p className="text-white/80 text-sm leading-relaxed">{t('helpNeedMoreHelpDesc')}</p>
                </div>
                <div className="flex flex-wrap gap-3 shrink-0">
                  <button
                    onClick={() => onNavigate?.('home')}
                    className="inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 transition-colors text-white text-sm font-bold px-4 py-2.5 rounded-xl"
                  >
                    <ICONS.Home className="w-4 h-4" /> {t('helpGoHome')}
                  </button>
                  <button
                    onClick={() => onNavigate?.('about')}
                    className="inline-flex items-center gap-2 bg-white text-primary hover:bg-white/90 transition-colors text-sm font-bold px-4 py-2.5 rounded-xl"
                  >
                    <ICONS.Chat className="w-4 h-4" /> {t('helpContactSupport')}
                  </button>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* Back to top */}
      {showTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label={t('helpBackToTop')}
          title={t('helpBackToTop')}
          className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50 w-11 h-11 rounded-full bg-primary text-white shadow-ambient flex items-center justify-center hover:bg-primary/90 transition-colors"
        >
          <ICONS.ChevronRight className="w-5 h-5 -rotate-90" />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section card                                                        */
/* ------------------------------------------------------------------ */

interface SectionCardProps {
  index: number;
  section: HelpSection;
  /** Optional screenshot/deep-link enrichment merged from helpMedia.ts. */
  enrichment?: HelpEnrichment;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  registerRef: (el: HTMLElement | null) => void;
  /** Whether dashboard-gated deep links should be offered (logged-in seller). */
  canAccessDashboard: boolean;
  /** In-app SPA navigation (parent router). */
  onNavigate?: (view: string) => void;
  /** Real Next route navigation for /dashboard/* deep links. */
  onOpenRoute?: (route: string) => void;
  /** Translator from useI18n — used to resolve block content keys in the active language. */
  t: TFn;
}

function SectionCard({
  index,
  section,
  enrichment,
  title,
  summary,
  open,
  onToggle,
  registerRef,
  canAccessDashboard,
  onNavigate,
  onOpenRoute,
  t,
}: SectionCardProps) {
  const Icon = ICONS[section.icon];
  const media = enrichment?.media ?? [];
  const links = enrichment?.links ?? [];
  return (
    <section
      id={section.id}
      ref={registerRef}
      className="scroll-mt-24 bg-white border border-surface-container rounded-3xl shadow-sm overflow-hidden"
    >
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-4 px-5 md:px-6 py-4 md:py-5 text-left hover:bg-surface-container-low/60 transition-colors"
      >
        <div className="w-10 h-10 md:w-11 md:h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-primary/60 font-mono">
              {String(index).padStart(2, '0')}
            </span>
            <h2 className="text-base md:text-lg font-bold text-on-surface leading-tight">{title}</h2>
          </div>
          <p className="text-xs md:text-sm text-on-surface-variant mt-0.5 truncate">{summary}</p>
        </div>
        <ICONS.ChevronRight
          className={`w-5 h-5 text-outline shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
        />
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div className="px-5 md:px-6 pb-6 pt-1 border-t border-surface-container">
            <div className="flex flex-col gap-3 pt-4">
              {section.blocks.map((block, idx) => (
                <Block key={idx} block={block} t={t} />
              ))}

              {/* Visual screenshot preview(s) — lazy-loaded with graceful fallback */}
              {media.length > 0 && (
                <div className="pt-2">
                  <ScreenshotGallery media={media} fallbackIcon={section.icon} t={t} />
                </div>
              )}

              {/* Deep-link actions — open the actual portal screen */}
              {links.length > 0 && (
                <div className="pt-1">
                  <SectionActions
                    links={links}
                    canAccessDashboard={canAccessDashboard}
                    onNavigate={onNavigate}
                    onOpenRoute={onOpenRoute}
                    t={t}
                  />
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Content blocks                                                      */
/* ------------------------------------------------------------------ */

function Block({ block, t }: { block: HelpBlock; t: TFn }) {
  switch (block.kind) {
    case 'p':
      return <p className="text-sm md:text-[15px] text-on-surface-variant leading-relaxed">{t(block.key)}</p>;

    case 'sub':
      return (
        <h3 className="text-sm font-black uppercase tracking-wide text-on-surface mt-2 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-harvest shrink-0" />
          {t(block.key)}
        </h3>
      );

    case 'list':
      return (
        <ul className="flex flex-col gap-1.5">
          {block.keys.map((key, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm text-on-surface-variant leading-relaxed">
              <ICONS.Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>
      );

    case 'steps':
      return (
        <ol className="flex flex-col gap-2">
          {block.keys.map((key, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-on-surface leading-relaxed">
              <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              <span className="pt-0.5">{t(key)}</span>
            </li>
          ))}
        </ol>
      );

    case 'states':
      return (
        <div className="flex flex-wrap gap-2">
          {block.keys.map((key, i) => (
            <span
              key={i}
              className="inline-flex items-center px-3 py-1.5 rounded-full bg-surface-container-low border border-outline-variant text-xs font-bold text-on-surface"
            >
              {t(key)}
            </span>
          ))}
        </div>
      );

    case 'note':
      return (
        <div className="flex items-start gap-3 bg-primary/5 border border-primary/15 rounded-2xl px-4 py-3">
          <ICONS.Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-sm text-on-surface leading-relaxed font-medium">{t(block.key)}</p>
        </div>
      );

    case 'flow':
      return (
        <div className="flex flex-col gap-0">
          {block.layers.map((layer, i) => (
            <div key={i} className="flex flex-col items-center">
              <div className="w-full bg-surface-container-low border border-surface-container rounded-2xl px-4 py-3">
                <div className="text-xs font-black uppercase tracking-widest text-primary mb-2">{t(layer.titleKey)}</div>
                <div className="flex flex-wrap gap-2">
                  {layer.keys.map((key, j) => (
                    <span
                      key={j}
                      className="inline-flex items-center px-2.5 py-1 rounded-lg bg-white border border-outline-variant text-xs font-semibold text-on-surface"
                    >
                      {t(key)}
                    </span>
                  ))}
                </div>
              </div>
              {i < block.layers.length - 1 && (
                <div className="py-1.5 text-outline">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      );

    default:
      return null;
  }
}
