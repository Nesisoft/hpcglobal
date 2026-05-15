import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { adminApi } from '../../services/api';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import StatCard from '../../components/admin/StatCard';
import { HandHeart, UserPlus, Calendar, Mic2, Heart, Mail, Plus } from 'lucide-react';

export default function AdminDashboard() {
  const { user } = useAuth();
  const { data, loading } = useApi(adminApi.getDashboard);

  return (
    <AdminLayout title="Dashboard">
      <AdminPageHeader
        title={`Welcome back, ${user?.name ?? 'Admin'}`}
        subtitle="Here's what's happening at HPC Global today."
      />

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
        <StatCard
          icon={HandHeart}
          label="New Prayer Requests"
          value={loading ? undefined : (data?.newPrayerRequests ?? 0)}
          to="/admin/prayer"
          color="purple"
          loading={loading}
        />
        <StatCard
          icon={UserPlus}
          label="New Visitors (7 days)"
          value={loading ? undefined : (data?.newVisitorsThisWeek ?? 0)}
          to="/admin/visitors"
          color="green"
          loading={loading}
        />
        <StatCard
          icon={Mail}
          label="Unread Messages"
          value={loading ? undefined : (data?.unreadMessages ?? 0)}
          to="/admin/contact"
          color="purple"
          loading={loading}
        />
        <StatCard
          icon={Heart}
          label="Giving This Month (GHS)"
          value={loading ? undefined : (data?.givingThisMonth?.total?.toLocaleString() ?? '0')}
          to="/admin/giving"
          color="gold"
          loading={loading}
        />
        <StatCard
          icon={Mic2}
          label="Latest Sermon"
          value={loading ? undefined : (data?.latestSermon?.title?.slice(0, 22) + (data?.latestSermon?.title?.length > 22 ? '…' : '') ?? '—')}
          to="/admin/sermons"
          color="gold"
          loading={loading}
        />
        <StatCard
          icon={Calendar}
          label="Upcoming Events"
          value={loading ? undefined : (data?.upcomingEvents?.length ?? 0)}
          to="/admin/events"
          color="green"
          loading={loading}
        />
      </div>

      {/* Quick actions */}
      <div className="bg-white rounded-xl border border-purple-brand/8 p-6">
        <h3 className="font-display text-lg text-ink font-light mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          <Link to="/admin/sermons" className="btn-primary text-xs px-4 py-2.5">
            <Plus size={13} /> New Sermon
          </Link>
          <Link to="/admin/events" className="btn-primary text-xs px-4 py-2.5">
            <Plus size={13} /> New Event
          </Link>
          <Link to="/admin/blog" className="btn-primary text-xs px-4 py-2.5">
            <Plus size={13} /> New Post
          </Link>
          <Link to="/admin/gallery" className="btn-outline text-xs px-4 py-2.5">
            <Plus size={13} /> New Album
          </Link>
        </div>
      </div>
    </AdminLayout>
  );
}
