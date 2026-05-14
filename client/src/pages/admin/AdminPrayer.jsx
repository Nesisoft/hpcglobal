import AdminLayout from '../../components/admin/AdminLayout';
import AdminPageHeader from '../../components/admin/AdminPageHeader';

export default function AdminPrayer() {
  return (
    <AdminLayout title="Prayer Requests">
      <AdminPageHeader
        title="Prayer Requests"
        subtitle="View and respond to prayer requests."
      />
      <div className="bg-white rounded-xl border border-purple-brand/8 p-8 text-center">
        <p className="text-ink/40 font-body text-sm">This module is coming soon.</p>
      </div>
    </AdminLayout>
  );
}
