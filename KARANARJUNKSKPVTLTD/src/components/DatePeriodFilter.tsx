import { type FinancialPeriod, FINANCIAL_PERIOD_LABELS } from '../utils/financialPeriod';

interface Props {
    period: FinancialPeriod;
    customFrom: string;
    customTo: string;
    onPeriodChange: (p: FinancialPeriod) => void;
    onCustomFromChange: (v: string) => void;
    onCustomToChange: (v: string) => void;
}

export default function DatePeriodFilter({
    period, customFrom, customTo,
    onPeriodChange, onCustomFromChange, onCustomToChange,
}: Props) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Period:</span>
            {FINANCIAL_PERIOD_LABELS.map(([p, label]) => (
                <button
                    key={p}
                    onClick={() => onPeriodChange(p)}
                    style={{
                        padding: '0.25rem 0.7rem',
                        borderRadius: '8px',
                        border: `1px solid ${period === p ? 'var(--primary-light)' : 'var(--surface-border)'}`,
                        background: period === p ? 'var(--primary-light)' : 'var(--surface-raised)',
                        color: period === p ? '#fff' : 'var(--text-secondary)',
                        fontSize: '0.78rem',
                        fontWeight: period === p ? 700 : 400,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        transition: 'all 0.15s',
                    }}
                >
                    {label}
                </button>
            ))}
            {period === 'custom' && (
                <>
                    <input
                        type="date"
                        value={customFrom}
                        onChange={e => onCustomFromChange(e.target.value)}
                        className="input-field"
                        style={{ height: '30px', padding: '0 0.5rem', fontSize: '0.82rem', width: 'auto' }}
                    />
                    <span style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>to</span>
                    <input
                        type="date"
                        value={customTo}
                        onChange={e => onCustomToChange(e.target.value)}
                        className="input-field"
                        style={{ height: '30px', padding: '0 0.5rem', fontSize: '0.82rem', width: 'auto' }}
                    />
                </>
            )}
        </div>
    );
}
