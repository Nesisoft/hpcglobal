import { Link } from 'react-router-dom';
import { Home, Search, Calendar, Mic2 } from 'lucide-react';
import SEO from '../../components/ui/SEO';

export default function NotFound() {
  return (
    <>
      <SEO title="Page Not Found" noIndex />
      <div className="min-h-screen bg-purple-deep flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <p className="font-display text-[120px] text-gold/20 leading-none font-light select-none">
            404
          </p>
          <h1 className="font-display text-3xl text-white font-light mb-3 -mt-4">
            Page Not Found
          </h1>
          <p className="text-white/50 font-body text-sm mb-8 leading-relaxed">
            The page you're looking for doesn't exist or may have moved.
            Let's get you back on track.
          </p>

          <div className="grid grid-cols-2 gap-3 mb-8">
            {[
              { icon: Home,     label: 'Home',    to: '/'        },
              { icon: Mic2,     label: 'Sermons', to: '/sermons' },
              { icon: Calendar, label: 'Events',  to: '/events'  },
              { icon: Search,   label: 'Contact', to: '/contact' },
            ].map(({ icon: Icon, label, to }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/15 border border-white/10 rounded-lg px-4 py-3 text-white/70 hover:text-white text-sm font-body transition-all"
              >
                <Icon size={15} className="text-gold flex-shrink-0" />
                {label}
              </Link>
            ))}
          </div>

          <Link to="/" className="btn-primary justify-center">
            <Home size={14} /> Return Home
          </Link>
        </div>
      </div>
    </>
  );
}
