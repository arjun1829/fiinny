import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { ArrowRight, Briefcase, MapPin, Clock, Building2, Sparkles, Loader2, CheckCircle2 } from 'lucide-react';
import { db } from '../firebase';
import { JOB_OPENINGS_COLLECTION, type JobOpening } from '../types/careers';
import Navbar from '../components/landing/Navbar';
import Footer from '../components/landing/Footer';

// Firestore Timestamp | Date | millis → epoch millis (newest-first sort). 0 when absent.
const tsToMillis = (ts: unknown): number => {
    if (!ts) return 0;
    try {
        const d = typeof ts === 'object' && ts !== null && 'toDate' in ts
            ? (ts as { toDate: () => Date }).toDate()
            : new Date(ts as string | number);
        const m = d.getTime();
        return isNaN(m) ? 0 : m;
    } catch {
        return 0;
    }
};

export default function CareersPage() {
    const [openings, setOpenings] = useState<JobOpening[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [searchParams] = useSearchParams();
    // A Super Admin "View" click deep-links to a specific opening (?job=<id>).
    const focusJobId = searchParams.get('job');

    const scrollToOpenings = () => {
        document.getElementById('open-positions')?.scrollIntoView({ behavior: 'smooth' });
    };

    // Read only published openings — the security rule allows this exact query
    // for unauthenticated visitors; drafts and closed roles are never returned.
    useEffect(() => {
        let alive = true;
        (async () => {
            setLoading(true);
            setError(false);
            try {
                const snap = await getDocs(
                    query(collection(db, JOB_OPENINGS_COLLECTION), where('status', '==', 'published')),
                );
                if (!alive) return;
                const rows: JobOpening[] = snap.docs.map(d => ({
                    id: d.id,
                    ...(d.data() as Omit<JobOpening, 'id'>),
                }));
                // Sort newest-first in memory (avoids a composite index on status + createdAt).
                rows.sort((a, b) => tsToMillis(b.createdAt) - tsToMillis(a.createdAt));
                setOpenings(rows);
            } catch {
                if (alive) setError(true);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, []);

    return (
        <div style={{
            background: 'var(--bg-color)',
            color: 'var(--text-primary)',
            minHeight: '100vh',
            overflowX: 'hidden',
        }}>
            <Navbar />

            <main>
                {/* ── Hero ───────────────────────────────────────────────────── */}
                <section style={{
                    padding: '11rem 2rem 5rem',
                    maxWidth: '900px',
                    margin: '0 auto',
                    textAlign: 'center',
                }}>
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.9, ease: 'easeOut' }}
                    >
                        <span style={{
                            background: 'hsla(152, 60%, 40%, 0.15)',
                            color: 'var(--primary-light)',
                            padding: '0.5rem 1rem',
                            borderRadius: '99px',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            marginBottom: '1.5rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            border: '1px solid hsla(152, 60%, 40%, 0.3)',
                        }}>
                            <Sparkles size={16} /> We’re hiring
                        </span>

                        <h1 style={{
                            fontSize: '4rem',
                            lineHeight: 1.1,
                            fontWeight: 800,
                            margin: '1.5rem 0',
                            letterSpacing: '-0.04em',
                            color: 'var(--text-primary)',
                        }}>
                            Careers at <span className="primary-gradient-text">Fiinny ERP</span>
                        </h1>

                        <p style={{
                            fontSize: '1.35rem',
                            color: 'var(--text-secondary)',
                            lineHeight: 1.6,
                            maxWidth: '640px',
                            margin: '0 auto 2.5rem',
                        }}>
                            We’re building the operating system for Bharat’s retail. Join a small,
                            fast-moving team shipping software that thousands of businesses rely on every day.
                        </p>

                        <button
                            onClick={scrollToOpenings}
                            style={{
                                background: 'var(--primary)',
                                color: 'white',
                                border: 'none',
                                padding: '1.1rem 2.8rem',
                                borderRadius: '14px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                fontSize: '1.15rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                boxShadow: '0 10px 25px -5px hsla(152, 60%, 32%, 0.3)',
                            }}
                        >
                            View Open Positions <ArrowRight size={20} />
                        </button>
                    </motion.div>
                </section>

                {/* ── Open Positions ─────────────────────────────────────────── */}
                <section id="open-positions" style={{ padding: '4rem 2rem 8rem', maxWidth: '1000px', margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
                        <span style={{ color: 'var(--primary-light)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.9rem' }}>
                            Open Positions
                        </span>
                        <h2 style={{ fontSize: '2.75rem', fontWeight: 800, marginTop: '1rem', letterSpacing: '-0.03em' }}>
                            Find your <span style={{ color: 'var(--primary-light)' }}>next role.</span>
                        </h2>
                    </div>

                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>
                            <Loader2 size={28} className="animate-spin" style={{ marginBottom: '0.75rem' }} />
                            <div style={{ fontSize: '1.05rem' }}>Loading open positions…</div>
                        </div>
                    ) : error ? (
                        <div className="glass-panel" style={{ padding: '3rem 2rem', textAlign: 'center', border: '1px solid var(--surface-border)' }}>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', margin: 0 }}>
                                We couldn’t load open positions right now. Please try again in a moment.
                            </p>
                        </div>
                    ) : openings.length === 0 ? (
                        <EmptyState />
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {openings.map((job, i) => (
                                <JobCard key={job.id} job={job} index={i} focused={focusJobId === job.id} />
                            ))}
                        </div>
                    )}
                </section>
            </main>

            <Footer />
        </div>
    );
}

// A single opening card. Scrolls itself into view + highlights when deep-linked.
function JobCard({ job, index, focused }: { job: JobOpening; index: number; focused: boolean }) {
    const ref = useRef<HTMLDivElement>(null);
    const requirements = useMemo(() => (job.requirements ?? []).filter(Boolean), [job.requirements]);

    useEffect(() => {
        if (focused && ref.current) {
            ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [focused]);

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.1, duration: 0.7 }}
            whileHover={{ y: -6, borderColor: 'var(--primary)' }}
            className="glass-panel"
            style={{
                padding: '2rem 2.25rem',
                border: `1px solid ${focused ? 'var(--primary)' : 'var(--surface-border)'}`,
                boxShadow: focused ? 'var(--neon-glow)' : undefined,
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '2rem',
                flexWrap: 'wrap',
            }}
        >
            <div style={{ flex: '1 1 460px', minWidth: 0 }}>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.9rem' }}>{job.title}</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '1rem' }}>
                    <Chip icon={<Building2 size={14} />}>{job.department}</Chip>
                    <Chip icon={<MapPin size={14} />}>{job.location}</Chip>
                    <Chip icon={<Clock size={14} />}>{job.employmentType}</Chip>
                </div>
                <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0, maxWidth: '620px' }}>
                    {job.description}
                </p>

                {requirements.length > 0 && (
                    <div style={{ marginTop: '1.25rem' }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: '0.6rem' }}>
                            What we’re looking for
                        </div>
                        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            {requirements.map((req, r) => (
                                <li key={r} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.55rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                    <CheckCircle2 size={16} style={{ color: 'var(--primary-light)', flexShrink: 0, marginTop: '3px' }} />
                                    {req}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            <a
                href="mailto:careers@fiinny.com"
                style={{
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--surface-border)',
                    padding: '0.85rem 1.6rem',
                    borderRadius: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: '0.95rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.2s ease',
                    flexShrink: 0,
                }}
                onMouseOver={e => { e.currentTarget.style.background = 'var(--surface-raised)'; e.currentTarget.style.borderColor = 'var(--primary)'; }}
                onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--surface-border)'; }}
            >
                Apply Now <ArrowRight size={16} />
            </a>
        </motion.div>
    );
}

// A compact metadata pill used on each opening card.
function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: '0.82rem',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            background: 'var(--surface-raised)',
            border: '1px solid var(--surface-border)',
            padding: '0.35rem 0.75rem',
            borderRadius: '99px',
        }}>
            <span style={{ color: 'var(--primary-light)' }}>{icon}</span>
            {children}
        </span>
    );
}

// Shown when there are no published openings.
function EmptyState() {
    return (
        <div className="glass-panel" style={{
            padding: '4rem 2rem',
            textAlign: 'center',
            border: '1px solid var(--surface-border)',
        }}>
            <div style={{
                width: '72px',
                height: '72px',
                background: 'hsla(152, 60%, 40%, 0.1)',
                borderRadius: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary-light)',
                margin: '0 auto 1.5rem',
            }}>
                <Briefcase size={34} />
            </div>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.75rem' }}>
                No open positions right now
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', lineHeight: 1.6, maxWidth: '480px', margin: '0 auto 2rem' }}>
                We’re not actively hiring at the moment, but we’re always glad to hear from talented people.
                Check back soon or drop us a line.
            </p>
            <a
                href="mailto:careers@fiinny.com"
                style={{
                    background: 'var(--primary)',
                    color: 'white',
                    padding: '0.85rem 1.75rem',
                    borderRadius: '12px',
                    textDecoration: 'none',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 8px 20px -5px hsla(152, 60%, 32%, 0.4)',
                }}
            >
                Get in touch <ArrowRight size={16} />
            </a>
        </div>
    );
}
