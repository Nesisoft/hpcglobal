import { useState, useEffect, useRef } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Menu, X, ChevronDown, Calendar } from 'lucide-react';

const NAV_LINKS = [
  { label: 'About',    to: '/about' },
  { label: 'Services', to: '/services' },
  { label: 'Sermons',  to: '/sermons' },
  {
    label: 'Connect',
    children: [
      { label: 'New Here?',          to: '/new-here'     },
      { label: 'Book Appointment',   to: '/appointments' },
      { label: 'Ministries',         to: '/ministries'   },
      { label: 'Prayer',             to: '/prayer'       },
      { label: 'Leadership',         to: '/leadership'   },
    ],
  },
  { label: 'Events', to: '/events' },
  { label: 'Blog',   to: '/blog'   },
  { label: 'Give',    to: '/give'    },
  { label: 'Partner', to: '/partner' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen]         = useState(false);
  const [dropdown, setDropdown] = useState(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  // Close dropdown on Escape or click outside
  useEffect(() => {
    if (!dropdown) return;
    const onKey = (e) => { if (e.key === 'Escape') setDropdown(null); };
    const onClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdown(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [dropdown]);

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      scrolled ? 'bg-purple-deep/95 backdrop-blur-md shadow-lg' : 'bg-transparent'
    }`}>
      <nav className="container-page flex items-center justify-between h-16 lg:h-20">

        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 group" onClick={() => setOpen(false)}>
          <img src="https://i.ibb.co/BVYBsKKY/LOGO.png" alt="HPC Global" className="h-9 w-auto object-contain" />
          <div className="leading-tight">
            <div className="font-display text-white text-base font-semibold tracking-wide group-hover:text-gold-light transition-colors">
              HPC Global
            </div>
            <div className="text-white/50 text-[10px] tracking-widest uppercase font-body">
              Hopepress Chapel
            </div>
          </div>
        </Link>

        {/* Desktop nav */}
        <div className="hidden lg:flex items-center gap-1">
          {NAV_LINKS.map((link) =>
            link.children ? (
              <div
                key={link.label}
                ref={dropdown === link.label ? dropdownRef : null}
                className="relative"
                onMouseEnter={() => setDropdown(link.label)}
                onMouseLeave={() => setDropdown(null)}
              >
                <button
                  type="button"
                  className="flex items-center gap-1 px-4 py-2 text-sm text-white/80 hover:text-gold font-body font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded"
                  onClick={() => setDropdown((d) => (d === link.label ? null : link.label))}
                  aria-expanded={dropdown === link.label}
                  aria-haspopup="true"
                >
                  {link.label}
                  <ChevronDown size={14} className={`transition-transform ${dropdown === link.label ? 'rotate-180' : ''}`} />
                </button>
                {dropdown === link.label && (
                  <div className="absolute top-full left-0 mt-1 w-48 bg-purple-deep border border-white/10 rounded-md shadow-xl overflow-hidden">
                    {link.children.map((child) => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        className={({ isActive }) =>
                          `block px-4 py-3 text-sm font-body transition-colors focus:outline-none focus-visible:bg-white/10 ${
                            isActive ? 'text-gold bg-white/5' : 'text-white/70 hover:text-gold hover:bg-white/5'
                          }`
                        }
                        onClick={() => setDropdown(null)}
                      >
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `px-4 py-2 text-sm font-body font-medium transition-colors ${
                    isActive ? 'text-gold' : 'text-white/80 hover:text-gold'
                  }`
                }
              >
                {link.label}
              </NavLink>
            )
          )}
        </div>

        {/* CTA + Mobile toggle */}
        <div className="flex items-center gap-3">
          <Link to="/new-here" className="hidden sm:inline-flex btn-primary text-xs px-5 py-2.5">
            <Calendar size={13} /> Plan a Visit
          </Link>
          <button
            type="button"
            className="lg:hidden text-white p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      <div className={`lg:hidden transition-all duration-300 overflow-hidden ${open ? 'max-h-screen' : 'max-h-0'}`}>
        <div className="bg-purple-deep border-t border-white/10 px-4 py-4 flex flex-col gap-1">
          {NAV_LINKS.map((link) =>
            link.children ? (
              <div key={link.label}>
                <div className="px-3 py-1 text-xs text-white/40 uppercase tracking-widest font-body">
                  {link.label}
                </div>
                {link.children.map((child) => (
                  <NavLink
                    key={child.to}
                    to={child.to}
                    className={({ isActive }) =>
                      `block px-5 py-2.5 text-sm font-body transition-colors rounded ${
                        isActive ? 'text-gold' : 'text-white/70 hover:text-gold'
                      }`
                    }
                    onClick={() => setOpen(false)}
                  >
                    {child.label}
                  </NavLink>
                ))}
              </div>
            ) : (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `block px-3 py-2.5 text-sm font-body transition-colors rounded ${
                    isActive ? 'text-gold' : 'text-white/70 hover:text-gold'
                  }`
                }
                onClick={() => setOpen(false)}
              >
                {link.label}
              </NavLink>
            )
          )}
          <Link to="/new-here" className="btn-primary mt-3 justify-center" onClick={() => setOpen(false)}>
            <Calendar size={13} /> Plan a Visit
          </Link>
        </div>
      </div>
    </header>
  );
}
