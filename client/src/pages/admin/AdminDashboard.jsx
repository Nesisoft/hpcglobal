import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { adminApi } from '../../services/api';
import { HandHeart, UserPlus, Calendar, Play, Heart, Mail, Plus, LogOut } from 'lucide-react';
import Spinner from '../../components/ui/Spinner';

function StatCard({ icon: Icon, label, value, to }) {
  return (
    <Link to={to} className="bg-white rounded-xl p-6 border border-purple-brand/10 hover:border-gold/30 transition-colors flex items-center gap-4">
      <div className="w-12 h-12 rounded-full bg-purple-deep/5 flex items-center justify-center flex-shrink-0">
        <Icon size={22} className="text-gold" />
      </div>
      <div>
        <div className="font-display text-3xl text-purple-deep font-light">{value ?? '—'}</div>
        <div className="text-ink/50 font-body text-xs uppercase tracking-widest">{label}</div>
      </div>
    </Link>
  );
}

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { data, loading } = useApi(adminApi.getDashboard);

  async function handleLogout() {
    await logout();
    navigate('/admin/login');
  }

  return (
    <div className="min-h-screen bg-cream">
      {/* Top bar */}
      <header className="bg-purple-deep border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gold flex items-center justify-center text-purple-deep font-semibold text-sm">H</div>
          <span className="text-white font-body font-medium">HPC Global Admin</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-white/50 font-body text-xs">{user?.name} · {user?.role?.replace('_', ' ')}</span>
          <button onClick={handleLogout} className="flex items-center gap-1.5 text-white/50 hover:text-white text-xs font-body transition-colors">
            <LogOut size={13} /> Logout
          </button>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-56 min-h-screen bg-white border-r border-purple-brand/10 p-4">
          <nav className="space-y-1">
            {[
              { label: 'Dashboard',    to: '/admin'              },
              { label: 'Hero / Home',  to: '/admin/hero'         },
              { label: 'Sermons',      to: '/admin/sermons'      },
              { label: 'Events',       to: '/admin/events'       },
              { label: 'Blog',         to: '/admin/blog'         },
              { label: 'Gallery',      to: '/admin/gallery'      },
              { label: 'Ministries',   to: '/admin/ministries'   },
              { label: 'Leadership',   to: '/admin/leadership'   },
              { label: 'About',        to: '/admin/about'        },
              { label: 'Services',     to: '/admin/services'     },
              { label: 'Prayer',       to: '/admin/prayer'       },
              { label: 'Visitors',     to: '/admin/visitors'     },
              { label: 'Giving',       to: '/admin/giving'       },
              { label: 'Messages',     to: '/admin/contact'      },
              { label: 'Settings',     to: '/admin/settings'     },
              ...(user?.role === 'SUPER_ADMIN' ? [{ label: 'Users', to: '/admin/users' }] : []),
            ].map(({ label, to }) => (
              <Link key={to} to={to}
                className="block px-3 py-2.5 text-sm font-body text-ink/60 hover:text-purple-brand hover:bg-purple-deep/5 rounded transition-colors">
                {label}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-8">
          <div className="mb-8">
            <h1 className="font-display text-3xl text-ink font-light">Dashboard</h1>
            <p className="text-ink/50 font-body text-sm mt-1">Welcome back, {user?.name}</p>
          </div>

          {loading ? <Spinner /> : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
                <StatCard icon={HandHeart} label="New Prayer Requests"  value={data?.newPrayerRequests}    to="/admin/prayer"   />
                <StatCard icon={UserPlus}  label="New Visitors (7d)"    value={data?.newVisitorsThisWeek}  to="/admin/visitors" />
                <StatCard icon={Mail}      label="Unread Messages"       value={data?.unreadMessages}       to="/admin/contact"  />
                <StatCard icon={Heart}     label="Giving This Month (GHS)" value={data?.givingThisMonth?.total?.toLocaleString()} to="/admin/giving" />
                <StatCard icon={Play}      label="Latest Sermon"         value={data?.latestSermon?.title?.slice(0,20)+'…'} to="/admin/sermons" />
                <StatCard icon={Calendar}  label="Upcoming Events"       value={data?.upcomingEvents?.length} to="/admin/events" />
              </div>

              <div className="flex gap-3 flex-wrap">
                <Link to="/admin/sermons" className="btn-primary text-xs px-4 py-2"><Plus size={13} /> New Sermon</Link>
                <Link to="/admin/events"  className="btn-primary text-xs px-4 py-2"><Plus size={13} /> New Event</Link>
                <Link to="/admin/blog"    className="btn-primary text-xs px-4 py-2"><Plus size={13} /> New Post</Link>
                <Link to="/" target="_blank" className="btn-outline text-xs px-4 py-2 border-purple-brand text-purple-brand hover:bg-purple-brand hover:text-white">View Site</Link>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
