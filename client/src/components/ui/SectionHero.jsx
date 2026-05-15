export default function SectionHero({ title, subtitle, breadcrumb }) {
  return (
    <section className="bg-purple-deep pt-32 pb-16 relative overflow-hidden">
      <div className="absolute inset-0 bg-hero-gradient" />
      <div className="container-page relative z-10 text-center">
        {breadcrumb && (
          <p className="text-white/40 text-xs font-body uppercase tracking-widest mb-3">
            {breadcrumb}
          </p>
        )}
        <h1 className="font-display text-display text-white font-light leading-tight mb-4">
          {title}
        </h1>
        {subtitle && (
          <p className="text-white/60 font-body text-base max-w-xl mx-auto">
            {subtitle}
          </p>
        )}
      </div>
    </section>
  );
}
