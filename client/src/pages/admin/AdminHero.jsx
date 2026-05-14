import AdminLayout from '../../components/admin/AdminLayout';
import AdminPageHeader from '../../components/admin/AdminPageHeader';

export default function AdminHero() {
  return (
    <AdminLayout title="Hero / Home">
      <AdminPageHeader
        title="Hero / Home"
        subtitle="Manage homepage hero slides."
      />
      <div className="bg-white rounded-xl border border-purple-brand/8 p-8 text-center">
        <p className="text-ink/40 font-body text-sm">This module is coming soon.</p>
      </div>
    </AdminLayout>
  );
}
