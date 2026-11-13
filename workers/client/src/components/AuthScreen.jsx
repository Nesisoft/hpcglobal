import { LOGO_URL } from './ui';

/**
 * The sign-in, sign-up and waiting screens: the website's admin login look —
 * deep purple, the logo, a translucent card and a gold button.
 */
export default function AuthScreen({ title, subtitle, children, footer, wide = false }) {
  // pt-safe-10: the usual top padding, or enough to clear an iPhone's status
  // bar, which the installed app draws under.
  return (
    <div className="min-h-screen bg-purple-deep flex items-center justify-center px-4 pt-safe-10 pb-10"
      style={{ backgroundImage: 'radial-gradient(circle at 30% 20%, rgba(90,45,175,0.45), transparent 55%), radial-gradient(circle at 80% 90%, rgba(201,168,76,0.10), transparent 45%)' }}>
      <div className={`w-full ${wide ? 'max-w-lg' : 'max-w-sm'}`}>
        <div className="text-center mb-7">
          <img src={LOGO_URL} alt="HPC Global" className="h-16 w-auto mx-auto mb-3 object-contain" />
          <p className="section-label mb-1">HPC Workers</p>
          <h1 className="font-display text-white text-3xl font-light">{title}</h1>
          {subtitle && <p className="text-white/45 font-body text-sm mt-1.5">{subtitle}</p>}
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 sm:p-8">{children}</div>
        {footer && <div className="text-center mt-5 text-white/45 text-sm font-body">{footer}</div>}
      </div>
    </div>
  );
}
