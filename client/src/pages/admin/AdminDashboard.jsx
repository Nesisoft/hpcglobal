import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { adminApi } from '../../services/api';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import StatCard from '../../components/admin/StatCard';
import { HandHeart, UserPlus, Calendar, Mic2, Heart, Mail, Plus, Coins, ArrowRight } from 'lucide-react';

export default function AdminDashboard() {
  const { user } = useAuth();
  const { data, loading } = useApi(adminApi.getDashboard);

  // Tithes paid on the website that could not be put on the register by
  // themselves. Super admins only, like the Tithes page. A reminder, not a
  // report: if the count can't be read, nothing is shown.
  const isSuper = user?.role === 'SUPER_ADMIN';
  const [onlineTithes, setOnlineTithes] = useState(0);
  useEffect(() => {
    if (!isSuper) return undefined;
    let active = true;
    adminApi.countOnlineTithes()
      .then(({ data: count }) => { if (active) setOnlineTithes(count?.needsMatch || 0); })
      .catch(() => {});
    return () => { active = false; };
  }, [isSuper]);

  return (
    <AdminLayout title="Dashboard">
      <AdminPageHeader
        title={`Welcome back, ${user?.name ?? 'Admin'}`}
        subtitle="Here's what's happening at HPC Global today."
      />

      {isSuper && onlineTithes > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 flex-shrink-0">
              <Coins size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-body font-medium text-amber-900">
                {onlineTithes === 1
                  ? '1 online tithe needs adding to the register'
                  : `${onlineTithes} online tithes need adding to the register`}
              </p>
              <p className="text-xs font-body text-amber-800/80 mt-0.5">
                Paid on the website without a tithe number, or with one that isn't on the register.
              </p>
            </div>
          </div>
          <Link to="/admin/tithes?tab=online" className="btn-primary text-xs px-4 py-2.5 self-start sm:self-auto whitespace-nowrap">
            Review <ArrowRight size={13} />
          </Link>
        </div>
      )}

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
          value={loading ? undefined : (data?.latestSermon?.title ? data.latestSermon.title.slice(0, 22) + (data.latestSermon.title.length > 22 ? '…' : '') : '—')}
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
