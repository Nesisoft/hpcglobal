import AdminLayout from '../../components/admin/AdminLayout';
import AdminPageHeader from '../../components/admin/AdminPageHeader';

export default function AdminAbout() {
  return (
    <AdminLayout title="About">
      <AdminPageHeader
        title="About"
        subtitle="Edit the About page content."
      />
      <div className="bg-white rounded-xl border border-purple-brand/8 p-8 text-center">
        <p className="text-ink/40 font-body text-sm">This module is coming soon.</p>
      </div>
    </AdminLayout>
  );
}
