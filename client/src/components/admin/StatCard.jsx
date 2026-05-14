import { Link } from 'react-router-dom';

/**
 * Dashboard summary stat card.
 *
 * Props:
 *   icon    – Lucide component
 *   label   – description
 *   value   – the number/text to display prominently
 *   to      – optional link target
 *   color   – 'gold' | 'purple' | 'green' | 'red'  (default 'gold')
 *   loading – show skeleton if true
 */
const COLOR_MAP = {
  gold:   { bg: 'bg-gold/10',          icon: 'text-gold',          ring: 'ring-gold/20'    },
  purple: { bg: 'bg-purple-brand/8',   icon: 'text-purple-brand',  ring: 'ring-purple-brand/15' },
  green:  { bg: 'bg-green-50',         icon: 'text-green-600',     ring: 'ring-green-100'  },
  red:    { bg: 'bg-red-50',           icon: 'text-red-500',       ring: 'ring-red-100'    },
};

export default function StatCard({ icon: Icon, label, value, to, color = 'gold', loading }) {
  const c = COLOR_MAP[color] ?? COLOR_MAP.gold;

  const inner = (
    <div className="bg-white rounded-xl p-5 border border-purple-brand/8 flex items-center gap-4 hover:shadow-md transition-shadow">
      <div className={`w-11 h-11 rounded-full ${c.bg} ring-1 ${c.ring} flex items-center justify-center flex-shrink-0`}>
        {loading ? (
          <div className="w-5 h-5 rounded-full bg-current opacity-20 animate-pulse" />
        ) : (
          <Icon size={20} className={c.icon} />
        )}
      </div>
      <div className="min-w-0">
        {loading ? (
          <>
            <div className="h-7 w-16 bg-purple-brand/8 rounded animate-pulse mb-1" />
            <div className="h-3 w-24 bg-purple-brand/6 rounded animate-pulse" />
          </>
        ) : (
          <>
            <div className="font-display text-2xl text-ink font-light leading-none">
              {value ?? '—'}
            </div>
            <div className="text-ink/45 font-body text-[11px] uppercase tracking-wider mt-0.5">
              {label}
            </div>
          </>
        )}
      </div>
    </div>
  );

  return to ? <Link to={to}>{inner}</Link> : inner;
}
