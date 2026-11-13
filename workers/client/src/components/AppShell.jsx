import { NavLink, Link, useLocation } from 'react-router-dom';
import { Home, Users, UserCog, Building2, ScrollText, CircleUser, LogOut, ExternalLink } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { LOGO_URL } from './ui';
import { initials, ROLE_LABEL } from '../lib/format';

const ADMIN_PAGES = [
  { to: '/admin/workers', label: 'Workers', icon: UserCog },
  { to: '/admin/departments', label: 'Departments', icon: Building2 },
  { to: '/admin/audit', label: 'Audit log', icon: ScrollText },
];

/**
 * The signed-in layout. On a computer: the website's admin sidebar (deep
 * purple, gold for the current page) beside a white header. On a phone —
 * where workers will mostly be — a slim top bar and a bottom navigation bar
 * within thumb's reach.
 */
export default function AppShell({ title, children }) {
  const { worker, isHod, isAdmin, logout } = useAuth();
  const { pathname } = useLocation();

  const sections = [
    { items: [{ to: '/', label: 'Home', icon: Home, end: true }] },
    isHod && { heading: worker.department.name, items: [{ to: '/department', label: 'My department', icon: Users }] },
    isAdmin && { heading: 'Administration', items: ADMIN_PAGES },
    { items: [{ to: '/profile', label: 'My profile', icon: CircleUser }] },
  ].filter(Boolean);

  // Four at most along the bottom of a phone.
  const bottom = [
    { to: '/', label: 'Home', icon: Home, end: true },
    isHod && { to: '/department', label: 'Department', icon: Users },
    isAdmin && { to: '/admin/workers', label: 'Admin', icon: UserCog, match: '/admin' },
    { to: '/profile', label: 'Profile', icon: CircleUser },
  ].filter(Boolean);

  // pt-safe on the bars along the top: installed on an iPhone or iPad the app
  // draws under the status bar, so each bar's colour runs up behind it and
  // its contents start below it.
  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden flex bg-mist">
      {/* Sidebar — computers */}
      <aside className="hidden lg:flex w-64 bg-purple-deep flex-col flex-shrink-0 pt-safe">
        <Link to="/" className="flex items-center gap-2.5 px-5 h-16 border-b border-white/10">
          <img src={LOGO_URL} alt="" className="h-8 w-auto object-contain" />
          <div className="leading-tight">
            <div className="text-white font-body text-sm font-semibold">HPC Workers</div>
            <div className="text-white/30 text-[9px] font-body tracking-widest uppercase">Attendance</div>
          </div>
        </Link>
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
          {sections.map((section, i) => (
            <div key={i}>
              {section.heading && (
                <p className="px-3 mb-1.5 text-[10px] font-body font-semibold uppercase tracking-[0.18em] text-white/30 truncate">{section.heading}</p>
              )}
              {section.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) => `flex items-center gap-2.5 px-3 py-2 rounded text-sm font-body transition-all mb-0.5 border ${
                    isActive ? 'bg-gold/15 text-gold border-gold/20' : 'text-white/55 hover:text-white hover:bg-white/5 border-transparent'}`}
                >
                  <Icon size={15} className="flex-shrink-0" /> {label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-white/10 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 text-xs font-body font-semibold">
              {initials(worker.name)}
            </div>
            <div className="min-w-0">
              <p className="text-white/85 text-xs font-body font-medium truncate">{worker.name}</p>
              <p className="text-white/35 text-[10px] font-body truncate">
                {isHod ? `HOD · ${worker.department.name}` : ROLE_LABEL[worker.role]}
              </p>
            </div>
          </div>
          <button onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded text-sm font-body text-white/40 hover:text-red-300 hover:bg-white/5 transition-all">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 lg:overflow-hidden">
        {/* Top bar — phones */}
        <header className="lg:hidden sticky top-0 z-30 bg-purple-deep pt-safe">
          <div className="h-14 px-4 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <img src={LOGO_URL} alt="" className="h-7 w-auto object-contain" />
              <span className="text-white font-body text-sm font-semibold">HPC Workers</span>
            </Link>
            <Link to="/profile" className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-gold text-xs font-body font-semibold"
              aria-label="My profile">
              {initials(worker.name)}
            </Link>
          </div>
        </header>

        {/* Header — computers */}
        <header className="hidden lg:block bg-white border-b border-purple-brand/10 flex-shrink-0 pt-safe">
          <div className="h-16 flex items-center justify-between px-8">
            <h2 className="font-display text-xl text-ink font-light">{title}</h2>
            <a href="https://www.hpcglobal.org" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-ink/40 hover:text-ink text-xs font-body transition-colors">
              <ExternalLink size={13} /> hpcglobal.org
            </a>
          </div>
        </header>

        <main className="flex-1 lg:overflow-y-auto px-4 py-6 sm:px-6 lg:p-8 pb-28 lg:pb-8">
          <div className="max-w-5xl mx-auto">
            {isAdmin && pathname.startsWith('/admin') && <AdminTabs />}
            {children}
          </div>
        </main>

        {/* Bottom navigation — phones */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-purple-deep border-t border-white/10 pb-safe">
          <div className="flex">
            {bottom.map(({ to, label, icon: Icon, end, match }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => {
                  const active = isActive || (match && pathname.startsWith(match));
                  return `flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-body ${active ? 'text-gold' : 'text-white/50'}`;
                }}
              >
                <Icon size={20} />
                {label}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}

/**
 * The admin pages as tabs along the top, for a phone or a portrait tablet:
 * there the sidebar is hidden and the bottom bar has room for just one
 * "Admin" tab. In the colours of the pages' own status tabs. On the
 * narrowest phones the row scrolls sideways rather than squashing.
 */
function AdminTabs() {
  return (
    <nav aria-label="Administration" className="lg:hidden mb-5 -mx-1 px-1 overflow-x-auto">
      <div className="flex min-w-max gap-1 bg-white border border-purple-brand/10 rounded-full p-1">
        {ADMIN_PAGES.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-full text-sm font-body whitespace-nowrap transition-colors ${
              isActive ? 'bg-purple-deep text-white' : 'text-ink/60 hover:text-ink'}`}
          >
            <Icon size={14} className="flex-shrink-0 hidden sm:block" />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
