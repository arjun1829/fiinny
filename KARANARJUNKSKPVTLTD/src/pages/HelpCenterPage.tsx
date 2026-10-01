import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, BookOpen, Users, BarChart3, ShieldAlert, HelpCircle, FileText, ChevronRight, X, LifeBuoy } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { HELP_ARTICLES, SECTIONS, searchArticles, type HelpSection, type HelpArticle } from '../data/helpArticles';

const SECTION_ICONS: Record<HelpSection, React.ReactNode> = {
  'getting-started': <BookOpen size={22} />,
  'accountant':      <BarChart3 size={22} />,
  'sales':           <Users size={22} />,
  'admin':           <ShieldAlert size={22} />,
  'faq':             <HelpCircle size={22} />,
  'release-notes':   <FileText size={22} />,
};

const SECTION_COLORS: Record<HelpSection, string> = {
  'getting-started': 'hsla(152,60%,40%,0.12)',
  'accountant':      'hsla(220,70%,50%,0.10)',
  'sales':           'hsla(45,93%,47%,0.12)',
  'admin':           'hsla(0,72%,51%,0.10)',
  'faq':             'hsla(280,60%,55%,0.10)',
  'release-notes':   'hsla(195,70%,45%,0.10)',
};

const SECTION_ACCENT: Record<HelpSection, string> = {
  'getting-started': 'var(--primary-light)',
  'accountant':      '#4a90d9',
  'sales':           'var(--secondary-dark)',
  'admin':           '#e05c5c',
  'faq':             '#9b6dd6',
  'release-notes':   '#3ab8d4',
};

function roleDefaultSection(role: string | null): HelpSection | null {
  if (role === 'analyst') return 'accountant';
  if (role === 'sales') return 'sales';
  if (role === 'admin') return null;
  return null;
}

function ArticleCard({ article, accent }: { article: HelpArticle; accent: string }) {
  return (
    <Link
      to={`/help/${article.id}`}
      style={{
        display: 'block',
        padding: '0.875rem 1rem',
        borderRadius: '10px',
        background: 'var(--surface-raised)',
        border: '1px solid var(--surface-border)',
        textDecoration: 'none',
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLAnchorElement).style.borderColor = accent;
        (e.currentTarget as HTMLAnchorElement).style.boxShadow = `0 2px 8px rgba(0,0,0,0.06)`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--surface-border)';
        (e.currentTarget as HTMLAnchorElement).style.boxShadow = 'none';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
        <div>
          <p style={{ margin: 0, fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
            {article.title}
          </p>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--text-tertiary)', lineHeight: 1.4 }}>
            {article.summary}
          </p>
        </div>
        <ChevronRight size={15} style={{ color: 'var(--text-tertiary)', flexShrink: 0, marginTop: '0.2rem' }} />
      </div>
      <span style={{
        display: 'inline-block',
        marginTop: '0.5rem',
        fontSize: '0.72rem',
        fontWeight: 600,
        color: accent,
        background: `color-mix(in srgb, ${accent} 12%, transparent)`,
        padding: '0.15rem 0.5rem',
        borderRadius: '4px',
      }}>
        {article.module}
      </span>
    </Link>
  );
}

function SectionCard({
  section,
  articles,
  expanded,
  onToggle,
}: {
  section: typeof SECTIONS[0];
  articles: HelpArticle[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const accent = SECTION_ACCENT[section.id];
  const bg = SECTION_COLORS[section.id];

  if (section.id === 'release-notes') {
    return (
      <div style={{ border: '1px solid var(--surface-border)', borderRadius: '14px', overflow: 'hidden', background: 'var(--surface-raised)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '1.1rem 1.25rem', background: bg }}>
          <span style={{ color: accent }}>{SECTION_ICONS[section.id]}</span>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>{section.label}</p>
            <p style={{ margin: '0.1rem 0 0', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>{section.description}</p>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Coming soon</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ border: '1px solid var(--surface-border)', borderRadius: '14px', overflow: 'hidden', background: 'var(--surface-raised)' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '0.875rem',
          padding: '1.1rem 1.25rem',
          background: expanded ? bg : 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'background 0.15s',
        }}
      >
        <span style={{ color: accent }}>{SECTION_ICONS[section.id]}</span>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>{section.label}</p>
          <p style={{ margin: '0.1rem 0 0', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>{section.description}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{articles.length} articles</span>
          <ChevronRight
            size={16}
            style={{
              color: 'var(--text-tertiary)',
              transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }}
          />
        </div>
      </button>

      {expanded && (
        <div style={{ padding: '0.75rem 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', borderTop: '1px solid var(--surface-border)' }}>
          {articles.map(a => (
            <ArticleCard key={a.id} article={a} accent={accent} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function HelpCenterPage() {
  const { userRole } = useAuth();
  const [query, setQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<HelpSection>>(() => {
    const defaultSection = roleDefaultSection(userRole ?? null);
    return new Set(defaultSection ? [defaultSection, 'getting-started'] : ['getting-started']);
  });

  const searchResults = useMemo(() => searchArticles(query), [query]);

  const articlesBySection = useMemo(() => {
    const map: Partial<Record<HelpSection, HelpArticle[]>> = {};
    for (const section of SECTIONS) {
      map[section.id] = HELP_ARTICLES.filter(a => a.section === section.id);
    }
    return map;
  }, []);

  function toggleSection(id: HelpSection) {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const isSearching = query.trim().length > 0;

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', padding: '2rem 1.25rem 4rem' }}>

      {/* Header */}
      <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '52px', height: '52px', borderRadius: '14px',
            background: 'hsla(152,60%,40%,0.12)', color: 'var(--primary-light)',
          }}>
            <HelpCircle size={28} />
          </span>
        </div>
        <h1 style={{ margin: '0 0 0.4rem', fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>
          Help Center
        </h1>
        <p style={{ margin: 0, color: 'var(--text-tertiary)', fontSize: '1rem' }}>
          Find guides, step-by-step instructions, and answers for every module.
        </p>
      </div>

      {/* Support Tickets CTA — raise & track an issue with the Fiinny team */}
      <Link
        to="/support"
        style={{
          display: 'flex', alignItems: 'center', gap: '0.875rem',
          padding: '1rem 1.25rem', marginBottom: '1.5rem',
          borderRadius: '14px', textDecoration: 'none',
          background: 'hsla(152,60%,40%,0.08)', border: '1px solid hsla(152,60%,40%,0.25)',
        }}
      >
        <span style={{ color: 'var(--primary-light)', flexShrink: 0 }}><LifeBuoy size={24} /></span>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-primary)' }}>
            Support Tickets
          </span>
          <span style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>
            Can't find an answer? Raise a ticket and track its progress with our team.
          </span>
        </span>
        <ChevronRight size={18} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
      </Link>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '2rem' }}>
        <Search
          size={18}
          style={{
            position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-tertiary)', pointerEvents: 'none',
          }}
        />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by module, feature, or keyword (e.g. GST Invoice, POS, Supplier Ledger)…"
          style={{
            width: '100%',
            padding: '0.875rem 2.75rem 0.875rem 2.75rem',
            fontSize: '0.95rem',
            border: '1.5px solid var(--surface-border)',
            borderRadius: '12px',
            background: 'var(--surface-raised)',
            color: 'var(--text-primary)',
            outline: 'none',
            boxSizing: 'border-box',
            transition: 'border-color 0.15s',
            fontFamily: 'inherit',
          }}
          onFocus={e => (e.target.style.borderColor = 'var(--primary-light)')}
          onBlur={e => (e.target.style.borderColor = 'var(--surface-border)')}
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            style={{
              position: 'absolute', right: '0.875rem', top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)',
              display: 'flex', alignItems: 'center', padding: '0.25rem',
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Search Results */}
      {isSearching && (
        <div>
          <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>
            {searchResults.length > 0
              ? `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''} for "${query}"`
              : `No results for "${query}"`}
          </p>
          {searchResults.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-tertiary)' }}>
              <HelpCircle size={36} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
              <p style={{ margin: 0 }}>Try different keywords, or browse the sections below.</p>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {searchResults.map(a => (
              <ArticleCard
                key={a.id}
                article={a}
                accent={SECTION_ACCENT[a.section]}
              />
            ))}
          </div>
        </div>
      )}

      {/* Sections */}
      {!isSearching && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {SECTIONS.map(section => (
            <SectionCard
              key={section.id}
              section={section}
              articles={articlesBySection[section.id] ?? []}
              expanded={expandedSections.has(section.id)}
              onToggle={() => toggleSection(section.id)}
            />
          ))}
        </div>
      )}

      {/* Footer note */}
      {!isSearching && (
        <p style={{ marginTop: '2.5rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
          Can't find what you're looking for?{' '}
          <a href="mailto:support@fiinny.com" style={{ color: 'var(--primary-light)', textDecoration: 'none' }}>
            Contact support
          </a>
        </p>
      )}
    </div>
  );
}
