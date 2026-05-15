/**
 * Standard page header used at the top of every admin module.
 *
 * Props:
 *   title      – page heading
 *   subtitle   – optional descriptor line
 *   action     – { label, onClick, icon: LucideIcon } – primary CTA button
 *   children   – additional controls (search, filters) rendered on the right
 */
export default function AdminPageHeader({ title, subtitle, action, children }) {
  const Icon = action?.icon;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7">
      <div>
        <h2 className="font-display text-2xl text-ink font-light leading-tight">{title}</h2>
        {subtitle && (
          <p className="text-ink/45 font-body text-sm mt-0.5">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        {children}
        {action && (
          <button
            onClick={action.onClick}
            className="btn-primary text-xs px-4 py-2.5 whitespace-nowrap"
          >
            {Icon && <Icon size={13} />}
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
