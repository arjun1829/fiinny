import { useState, useRef, useEffect } from 'react';
import {
    ShieldAlert, Users, Store, Layers, Palette, Database,
    Factory, UserCog, ChevronLeft, ChevronRight,
} from 'lucide-react';

// Import sub-pages directly (AdministrationPage itself is lazy-loaded by App.tsx)
import AdminPage from './AdminPage';
import ManageRolesPage from './ManageRolesPage';
import ManageRetailersPage from './ManageRetailersPage';
import ManufacturersPage from './ManufacturersPage';
import AdminStoreProductsPage from './AdminStoreProductsPage';
import InvoiceTemplateBuilderPage from './InvoiceTemplateBuilderPage';
import InvoiceSettingsPage from './InvoiceSettingsPage';
import SchemaBuilderPage from './SchemaBuilderPage';

// ─── Types ────────────────────────────────────────────────────────────────────

type AdminTab =
    | 'retailers'
    | 'schema-builder'
    | 'users'
    | 'store'
    | 'manufacturers'
    | 'invoice-templates'
    | 'invoice-branding'
    | 'roles';

const ADMIN_TABS: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: 'users',             label: 'Manage Users',       icon: <Users size={16} /> },
    { id: 'roles',             label: 'Role Matrix',        icon: <ShieldAlert size={16} /> },
    { id: 'retailers',         label: 'Manage Retailers',   icon: <UserCog size={16} /> },
    { id: 'store',             label: 'Manage Store',       icon: <Store size={16} /> },
    { id: 'manufacturers',     label: 'Manufacturers',      icon: <Factory size={16} /> },
    { id: 'invoice-templates', label: 'Invoice Templates',  icon: <Layers size={16} /> },
    { id: 'invoice-branding',  label: 'Invoice Branding',   icon: <Palette size={16} /> },
    { id: 'schema-builder',    label: 'UI Layout Builder',  icon: <Database size={16} /> },
];
// ─── Scroll Arrow Button ──────────────────────────────────────────────────────

function ScrollArrow({ dir, onClick }: { dir: 'left' | 'right'; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            aria-label={dir === 'left' ? 'Scroll tabs left' : 'Scroll tabs right'}
            style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                [dir]: 0,
                zIndex: 10,
                display: 'flex',
                alignItems: 'center',
                padding: '0 0.5rem',
                background: dir === 'left'
                    ? 'linear-gradient(to right, var(--surface-base) 60%, transparent)'
                    : 'linear-gradient(to left,  var(--surface-base) 60%, transparent)',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
            }}
        >
            {dir === 'left' ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdministrationPage() {
    const [activeTab, setActiveTab] = useState<AdminTab>('users');
    const scrollRef = useRef<HTMLDivElement>(null);
    const [showLeft, setShowLeft]   = useState(false);
    const [showRight, setShowRight] = useState(false);

    const updateArrows = () => {
        const el = scrollRef.current;
        if (!el) return;
        setShowLeft(el.scrollLeft > 1);
        setShowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    };

    useEffect(() => {
        updateArrows();
        const el = scrollRef.current;
        if (!el) return;
        el.addEventListener('scroll', updateArrows, { passive: true });
        window.addEventListener('resize', updateArrows);
        return () => {
            el.removeEventListener('scroll', updateArrows);
            window.removeEventListener('resize', updateArrows);
        };
    }, []);

    const scrollBy = (dir: 'left' | 'right') => {
        scrollRef.current?.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
    };

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1400px', margin: '0 auto' }}>

            {/* ── Sticky Tab Bar ── */}
            <div style={{
                position: 'sticky',
                top: 0,
                zIndex: 50,
                // Extend to page edges under the parent's 2rem padding
                marginLeft: '-2rem',
                marginRight: '-2rem',
                marginTop: '-2rem',
                marginBottom: '1.75rem',
            }}>
                {/* Scroll arrows — only rendered when tabs actually overflow */}
                {showLeft  && <ScrollArrow dir="left"  onClick={() => scrollBy('left')} />}
                {showRight && <ScrollArrow dir="right" onClick={() => scrollBy('right')} />}

                <div
                    ref={scrollRef}
                    style={{
                        background: 'var(--surface-base)',
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        display: 'flex',
                        gap: '0.25rem',
                        borderBottom: '2px solid var(--surface-border)',
                        overflowX: 'auto',
                        scrollbarWidth: 'none',
                        paddingLeft: '2rem',
                        paddingRight: '2rem',
                        paddingTop: '0.75rem',
                    }}
                >
                    {ADMIN_TABS.map(tab => {
                        const active = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0.65rem 1.1rem',
                                    background: 'transparent',
                                    border: 'none',
                                    borderBottom: active
                                        ? '2px solid var(--primary-light)'
                                        : '2px solid transparent',
                                    marginBottom: '-2px',
                                    color: active ? 'var(--primary-light)' : 'var(--text-tertiary)',
                                    fontWeight: active ? 700 : 400,
                                    fontSize: '0.875rem',
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                    whiteSpace: 'nowrap',
                                    transition: 'color 0.15s ease, border-color 0.15s ease',
                                    flexShrink: 0,
                                }}
                                onMouseEnter={e => {
                                    if (!active) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
                                }}
                                onMouseLeave={e => {
                                    if (!active) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)';
                                }}
                            >
                                <span style={{ opacity: active ? 1 : 0.6, display: 'flex' }}>{tab.icon}</span>
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Tab Content ── */}
{activeTab === 'retailers'         && <ManageRetailersPage />}
{activeTab === 'schema-builder'    && <SchemaBuilderPage />}
{activeTab === 'users'             && <AdminPage />}
{activeTab === 'store'             && <AdminStoreProductsPage />}
{activeTab === 'manufacturers'     && <ManufacturersPage />}
{activeTab === 'invoice-templates' && <InvoiceTemplateBuilderPage />}
{activeTab === 'invoice-branding'  && <InvoiceSettingsPage />}
{activeTab === 'roles'             && <ManageRolesPage />}
        </div>
    );
}
