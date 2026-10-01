import { Dashboard } from './components/Dashboard';

/**
 * Phase 2: monthly demographic analytics. The app is rendered behind the auth
 * gate (see main.tsx), so everything here is for an authorized super admin.
 */
export default function App() {
  return <Dashboard />;
}
