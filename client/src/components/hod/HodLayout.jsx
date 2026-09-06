import { useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { FilePlus2, FileText, Menu, X, LogOut, ExternalLink } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { LOGO_URL } from '../../config/brand';

// Deliberately not AdminLayout: that sidebar links to the content modules a
// head of department has no access to, and the server would reject every one.
const NAV = [
  { label: 'New Report',  to: '/hod',         icon: FilePlus2, exact: true },
  { label: 'My Reports',  to: '/hod/reports', icon: FileText },
];

export default function HodLayout({ children, title, department }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate('/admin/login');
  }

  return (
    <div className="h-screen overflow-hidden bg-[#F4F2F9] flex">
      {open && <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={() => setOpen(false)} />}

      <aside className={`
        fixed top-0 left-0 h-full w-60 bg-purple-deep border-r border-white/8 z-30
        flex flex-col transition-transform duration-300
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:z-auto
      `}>
        <div className="flex items-center justify-between px-5 h-16 border-b border-white/8 flex-shrink-0">
          <Link to="/hod" className="flex items-center gap-2.5">
            <img src={LOGO_URL} alt="HPC Global" className="h-7 w-auto object-contain" />
            <div className="leading-tight">
              <div className="text-white font-body text-sm font-semibold">HPC Global</div>
              <div className="text-white/30 text-[9px] font-body tracking-widest uppercase">Dept. Reports</div>
            </div>
          </Link>
          <button onClick={() => setOpen(false)} className="lg:hidden text-white/40 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {NAV.map(({ label, to, icon: Icon, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded text-sm font-body transition-all mb-0.5 ${
                  isActive
                    ? 'bg-gold/15 text-gold border border-gold/20'
                    : 'text-white/55 hover:text-white hover:bg-white/5 border border-transparent'
                }`
              }
            >
              <Icon size={15} className="flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-white/8 flex-shrink-0 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 text-xs font-body font-semibold flex-shrink-0">
              {user?.name?.[0] ?? 'H'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white/80 text-xs font-body font-medium truncate">{user?.name}</p>
              <p className="text-white/30 text-[10px] font-body truncate">
                {department || 'Head of Department'}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded text-sm font-body text-white/40 hover:text-red-400 hover:bg-white/5 border border-transparent transition-all"
          >
            <LogOut size={14} className="flex-shrink-0" /> Logout
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b border-purple-brand/10 flex items-center justify-between px-5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setOpen(true)} className="lg:hidden text-ink/40 hover:text-ink p-1" aria-label="Open menu">
              <Menu size={20} />
            </button>
            {title && <h1 className="font-display text-xl text-ink font-light hidden sm:block">{title}</h1>}
          </div>
          <div className="flex items-center gap-3">
            <a href="/" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-ink/40 hover:text-ink text-xs font-body transition-colors">
              <ExternalLink size={13} /> View site
            </a>
            <div className="w-px h-4 bg-purple-brand/10" />
            <button onClick={handleLogout}
              className="flex items-center gap-1.5 text-ink/40 hover:text-red-500 text-xs font-body transition-colors">
              <LogOut size={13} /> Logout
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
