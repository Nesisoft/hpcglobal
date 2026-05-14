import { Link } from 'react-router-dom';
export default function AdminSettings() {
  return (
    <div className="min-h-screen bg-cream p-8">
      <div className="mb-4"><Link to="/admin" className="text-xs text-ink/40 hover:text-ink font-body">← Dashboard</Link></div>
      <h1 className="font-display text-3xl text-ink font-light mb-4">Settings</h1>
      <p className="text-ink/50 font-body">This module is under construction.</p>
    </div>
  );
}
