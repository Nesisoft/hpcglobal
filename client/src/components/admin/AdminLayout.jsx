import { useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard, Image, Mic2, Calendar, BookOpen, Images,
  Users, Church, FileText, Clock, Settings, Mail, Heart,
  HandHeart, UserPlus, Menu, X, LogOut, ExternalLink, ChevronDown, Library,
  Video, MessageSquare, Banknote, CalendarCheck,
} from 'lucide-react';

const NAV = [
  { label: 'Dashboard',   to: '/admin',              icon: LayoutDashboard, exact: true },
  { divider: 'Content' },
  { label: 'Hero / Home', to: '/admin/hero',          icon: Image     },
  { label: 'Sermons',     to: '/admin/sermons',       icon: Mic2      },
  { label: 'Sermon Series', to: '/admin/sermon-series', icon: Library },
  { label: 'Events',      to: '/admin/events',        icon: Calendar  },
  { label: 'Blog',        to: '/admin/blog',          icon: BookOpen  },
  { label: 'Gallery',     to: '/admin/gallery',       icon: Images    },
  { divider: 'People' },
  { label: 'Leadership',  to: '/admin/leadership',    icon: Users     },
  { label: 'Ministries',  to: '/admin/ministries',    icon: Church    },
  { divider: 'Site' },
  { label: 'About',       to: '/admin/about',         icon: FileText  },
  { label: 'Services',    to: '/admin/services',      icon: Clock     },
  { label: 'Settings',    to: '/admin/settings',      icon: Settings  },
  { divider: 'Pastoral' },
  { label: 'Prayer',      to: '/admin/prayer',        icon: HandHeart },
  { label: 'Visitors',    to: '/admin/visitors',      icon: UserPlus  },
  { label: 'Messages',    to: '/admin/contact',       icon: Mail      },
  { label: 'Giving',      to: '/admin/giving',        icon: Heart     },
  { label: 'Appointments', to: '/admin/appointments', icon: CalendarCheck },
  { divider: 'Partners' },
  { label: 'Partners',          to: '/admin/partners',          icon: Users        },
  { label: 'Partner Payments',  to: '/admin/partner-payments',  icon: Banknote     },
  { label: 'Zoom Schedules',    to: '/admin/zoom-schedules',    icon: Video        },
  { label: 'Partner Messages',  to: '/admin/partner-messages',  icon: MessageSquare},
];

function Sidebar({ open, onClose, user, onLogout }) {
  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed top-0 left-0 h-full w-60 bg-purple-deep border-r border-white/8 z-30
        flex flex-col transition-transform duration-300
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:z-auto
      `}>
        {/* Logo */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-white/8 flex-shrink-0">
          <Link to="/admin" className="flex items-center gap-2.5">
            <img src="https://i.ibb.co/BVYBsKKY/LOGO.png" alt="HPC Global" className="h-7 w-auto object-contain" />
            <div className="leading-tight">
              <div className="text-white font-body text-sm font-semibold">HPC Global</div>
              <div className="text-white/30 text-[9px] font-body tracking-widest uppercase">Admin</div>
            </div>
          </Link>
          <button onClick={onClose} className="lg:hidden text-white/40 hover:text-white">
            <X size={16} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {NAV.map((item, i) => {
            if (item.divider) {
              return (
                <p key={i} className="text-white/25 text-[9px] font-body font-semibold uppercase tracking-[0.18em] px-3 pt-5 pb-1.5 first:pt-1">
                  {item.divider}
                </p>
              );
            }

            // SUPER_ADMIN-only items
            if (item.superOnly && user?.role !== 'SUPER_ADMIN') return null;

            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded text-sm font-body transition-all mb-0.5 ${
                    isActive
                      ? 'bg-gold/15 text-gold border border-gold/20'
                      : 'text-white/55 hover:text-white hover:bg-white/5 border border-transparent'
                  }`
                }
              >
                <Icon size={15} className="flex-shrink-0" />
                {item.label}
              </NavLink>
            );
          })}

          {/* Users — super admin only */}
          {user?.role === 'SUPER_ADMIN' && (
            <>
              <p className="text-white/25 text-[9px] font-body font-semibold uppercase tracking-[0.18em] px-3 pt-5 pb-1.5">
                Admin
              </p>
              <NavLink
                to="/admin/users"
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded text-sm font-body transition-all mb-0.5 ${
                    isActive
                      ? 'bg-gold/15 text-gold border border-gold/20'
                      : 'text-white/55 hover:text-white hover:bg-white/5 border border-transparent'
                  }`
                }
              >
                <Users size={15} />
                Admin Users
              </NavLink>
            </>
          )}
        </nav>

        {/* User badge + logout */}
        <div className="px-4 py-4 border-t border-white/8 flex-shrink-0 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 text-xs font-body font-semibold flex-shrink-0">
              {user?.name?.[0] ?? 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white/80 text-xs font-body font-medium truncate">{user?.name}</p>
              <p className="text-white/30 text-[10px] font-body truncate">
                {user?.role?.replace(/_/g, ' ')}
              </p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded text-sm font-body text-white/40 hover:text-red-400 hover:bg-white/5 border border-transparent transition-all"
          >
            <LogOut size={14} className="flex-shrink-0" />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}

function Topbar({ onMenuClick, title }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/admin/login');
  }

  return (
    <header className="h-16 bg-white border-b border-purple-brand/10 flex items-center justify-between px-5 flex-shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden text-ink/40 hover:text-ink p-1"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        {title && (
          <h1 className="font-display text-xl text-ink font-light hidden sm:block">{title}</h1>
        )}
      </div>

      <div className="flex items-center gap-3">
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-ink/40 hover:text-ink text-xs font-body transition-colors"
        >
          <ExternalLink size={13} /> View site
        </a>
        <div className="w-px h-4 bg-purple-brand/10" />
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-ink/40 hover:text-red-500 text-xs font-body transition-colors"
        >
          <LogOut size={13} /> Logout
        </button>
      </div>
    </header>
  );
}

/**
 * Wrap every admin page with this.
 * Usage:
 *   <AdminLayout title="Sermons">
 *     ...page content
 *   </AdminLayout>
 */
export default function AdminLayout({ children, title }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate('/admin/login');
  }

  return (
    <div className="h-screen overflow-hidden bg-[#F4F2F9] flex">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        user={user}
        onLogout={handleLogout}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar
          onMenuClick={() => setSidebarOpen(true)}
          title={title}
        />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
