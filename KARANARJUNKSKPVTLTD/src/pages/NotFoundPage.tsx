import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Home, ArrowLeft, FileQuestion } from 'lucide-react';

export default function NotFoundPage() {
    const { currentUser, userRole } = useAuth();
    const navigate = useNavigate();

    // Unauthenticated users have no business on any app route
    if (!currentUser) {
        return <Navigate to="/login" replace />;
    }

    const homeRoute = userRole === 'sales' ? '/worklist' : '/dashboard';
    const homeLabel = userRole === 'sales' ? 'Go to Worklist' : 'Go to Dashboard';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center', padding: '3rem 2rem' }}>
            <FileQuestion size={64} style={{ color: 'var(--surface-border)', marginBottom: '1.5rem' }} />
            <h1 style={{ fontSize: '5rem', fontWeight: 900, margin: 0, lineHeight: 1, background: 'linear-gradient(135deg, var(--primary-light), var(--primary-dark))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                404
            </h1>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0.75rem 0 0.5rem', color: 'var(--text-primary)' }}>
                Page Not Found
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', maxWidth: '360px', lineHeight: 1.6, marginBottom: '2rem' }}>
                The page you're looking for doesn't exist or may have been moved.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                    onClick={() => navigate(-1)}
                    className="btn btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}
                >
                    <ArrowLeft size={16} /> Go Back
                </button>
                <button
                    onClick={() => navigate(homeRoute, { replace: true })}
                    className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}
                >
                    <Home size={16} /> {homeLabel}
                </button>
            </div>
        </div>
    );
}
