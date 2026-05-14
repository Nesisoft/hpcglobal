import AdminLayout from '../../components/admin/AdminLayout';
import AdminPageHeader from '../../components/admin/AdminPageHeader';

export default function AdminGallery() {
  return (
    <AdminLayout title="Gallery">
      <AdminPageHeader
        title="Gallery"
        subtitle="Manage photo albums and gallery."
      />
      <div className="bg-white rounded-xl border border-purple-brand/8 p-8 text-center">
        <p className="text-ink/40 font-body text-sm">This module is coming soon.</p>
      </div>
    </AdminLayout>
  );
}
