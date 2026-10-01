import { motion } from 'framer-motion';
import { NotebookPen, PackageX, HandCoins, ReceiptText, LineChart, ArrowRight } from 'lucide-react';
import { home, container, eyebrow } from './tokens';

// Problems are the real pain points FIINNY already positions against on the
// pricing page ("Manual Methods / Hidden Costs"), paired with the module that
// resolves each one.
const problems = [
    {
        icon: NotebookPen,
        problem: 'Hours lost to manual tallying',
        solution: 'POS & GST billing generate a compliant invoice in seconds — no re-keying.',
    },
    {
        icon: PackageX,
        problem: 'Stock leakage & silent losses',
        solution: 'Live inventory with batch, expiry and low-stock alerts across every warehouse.',
    },
    {
        icon: HandCoins,
        problem: 'Forgotten udhaar (credit)',
        solution: 'Digital khata tracks every balance and sends WhatsApp payment reminders.',
    },
    {
        icon: ReceiptText,
        problem: 'GST errors & filing headaches',
        solution: 'HSN-aware invoicing with ready GSTR-1 and GSTR-3B summaries.',
    },
    {
        icon: LineChart,
        problem: 'No real view of profit',
        solution: 'Analytics on margins, top sellers and daily growth — plus P&L reports.',
    },
];

export default function HomeProblems() {
    return (
        <section style={{ background: home.color.surface, padding: '6.5rem 2rem' }}>
            <div style={container}>
                <div style={{ maxWidth: '720px', marginBottom: '3.25rem' }}>
                    <span style={eyebrow}>The problems FIINNY solves</span>
                    <h2 style={{
                        fontFamily: home.font.heading, fontWeight: 800, color: home.color.ink,
                        fontSize: '2.9rem', letterSpacing: '-0.03em', margin: '0.9rem 0 0.75rem',
                    }}>
                        Stop patching your shop together with registers and spreadsheets
                    </h2>
                    <p style={{ fontFamily: home.font.body, color: home.color.body, fontSize: '1.15rem', lineHeight: 1.6, margin: 0 }}>
                        Every manual workaround has a hidden cost. Here's what quietly drains Indian
                        businesses — and how FIINNY replaces it.
                    </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {problems.map((p, i) => (
                        <motion.div
                            key={p.problem}
                            initial={{ opacity: 0, x: -20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.06, duration: 0.5 }}
                            style={{
                                display: 'grid', gridTemplateColumns: '56px 1fr auto 1.15fr', alignItems: 'center', gap: '1.5rem',
                                background: home.color.cream, border: `1px solid ${home.color.line}`,
                                borderRadius: home.radius.md, padding: '1.35rem 1.75rem',
                            }}
                            className="home-problem-row"
                        >
                            <div style={{
                                width: 56, height: 56, borderRadius: home.radius.sm,
                                background: home.color.goldSoft, color: '#B9820A',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <p.icon size={26} />
                            </div>
                            <div style={{
                                fontFamily: home.font.heading, fontWeight: 700, fontSize: '1.1rem', color: home.color.ink,
                            }}>
                                {p.problem}
                            </div>
                            <ArrowRight size={20} color={home.color.emerald} className="home-problem-arrow" />
                            <div style={{
                                fontFamily: home.font.body, fontSize: '1rem', color: home.color.body, lineHeight: 1.5,
                            }}>
                                {p.solution}
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
