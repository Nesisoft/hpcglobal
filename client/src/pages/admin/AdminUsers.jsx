import AdminLayout from '../../components/admin/AdminLayout';
import AdminPageHeader from '../../components/admin/AdminPageHeader';

export default function AdminUsers() {
  return (
    <AdminLayout title="Admin Users">
      <AdminPageHeader
        title="Admin Users"
        subtitle="Manage admin user accounts."
      />
      <div className="bg-white rounded-xl border border-purple-brand/8 p-8 text-center">
        <p className="text-ink/40 font-body text-sm">This module is coming soon.</p>
      </div>
    </AdminLayout>
  );
}
