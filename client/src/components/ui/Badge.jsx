const VARIANTS = {
  gold:   'bg-gold/15 text-gold border-gold/30',
  purple: 'bg-purple-brand/10 text-purple-brand border-purple-brand/20',
  green:  'bg-green-50 text-green-700 border-green-200',
  red:    'bg-red-50 text-red-700 border-red-200',
  gray:   'bg-gray-100 text-gray-600 border-gray-200',
};

export default function Badge({ children, variant = 'gold', className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-body font-semibold uppercase tracking-widest px-2.5 py-1 rounded-sm border ${VARIANTS[variant] || VARIANTS.gold} ${className}`}>
      {children}
    </span>
  );
}
