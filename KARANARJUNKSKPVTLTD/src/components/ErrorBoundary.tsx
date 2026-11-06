import React from 'react';
import * as Sentry from '@sentry/react';
import { isStaleChunkError, reloadForNewBuild } from '../utils/staleBuild';

interface State { hasError: boolean; error: Error | null; }

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  State
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // A page chunk from a previous deploy is gone: load the new build instead of
    // showing an error screen. Falls through to the screen if a reload just failed.
    if (isStaleChunkError(error) && reloadForNewBuild()) return;
    console.error('[ErrorBoundary]', error, info);
    // ✅ Report to Sentry — no-op if Sentry wasn't initialised (e.g. missing DSN in dev)
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
  }


  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{
          minHeight: '60vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <h2 style={{ marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Something went wrong</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', maxWidth: '400px' }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            style={{ padding: '0.75rem 2rem', background: 'var(--primary-light)', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, font: 'inherit' }}
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
