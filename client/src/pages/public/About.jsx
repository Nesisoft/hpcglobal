import { Link } from 'react-router-dom';
import SEO from '../../components/ui/SEO';
import { UserCheck, TrendingUp, Star, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { publicApi } from '../../services/api';
import SectionHero from '../../components/ui/SectionHero';
import Spinner from '../../components/ui/Spinner';
import * as Icons from 'lucide-react';

function CoreValueIcon({ name }) {
  const Icon = Icons[name] || Icons.Sparkles;
  return <Icon size={28} className="text-gold" />;
}

function AccordionItem({ title, content }) {
  const [open, setOpen] = useState(false);
  const panelId = `accordion-panel-${title.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className="border border-purple-brand/10 rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-6 py-4 text-left bg-white hover:bg-cream transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span className="font-body font-semibold text-ink">{title}</span>
        {open ? <ChevronUp size={16} className="text-gold" /> : <ChevronDown size={16} className="text-gold" />}
      </button>
      {open && (
        <div id={panelId} role="region" className="px-6 pb-5 pt-2 bg-white">
          <p className="font-body text-ink/70 leading-relaxed text-sm">{content}</p>
        </div>
      )}
    </div>
  );
}

export default function About() {
  const { data: about, loading } = useApi(publicApi.getAbout);

  const coreValues = (() => {
    try { return JSON.parse(about?.coreValues || '[]'); } catch { return []; }
  })();
  const beliefs = (() => {
    try { return JSON.parse(about?.beliefs || '[]'); } catch { return []; }
  })();
  const milestones = (() => {
    try { return JSON.parse(about?.milestones || '[]'); } catch { return []; }
  })();

  return (
    <>
      <SEO
        title="About Us"
        description="HPC Global — Hopepress Chapel is an Apostolic Prophetic Word-based ministry founded by Prophet George and Lady Apostle Adelaide Clottey in Accra, Ghana."
      />
      <SectionHero
        title="About HPC Global"
        subtitle="Bringing hope to the hopeless, raising Kingdom leaders."
        breadcrumb="Home / About"
      />

      {loading ? <Spinner /> : (
        <>
          {/* Who we are */}
          <section className="section-pad bg-cream">
            <div className="container-page max-w-4xl mx-auto">
              <p className="section-label mb-3">Our Story</p>
              <h2 className="section-heading mb-6">Who We Are</h2>
              <div className="prose prose-lg max-w-none text-ink/70 font-body leading-relaxed space-y-4">
                {(about?.story || 'HPC Global — Hopepress Chapel is an Apostolic Prophetic Word-based ministry founded by Prophet George Clottey and Lady Apostle Adelaide Clottey. Located at Klagon Junction, Accra, Ghana, the ministry reaches believers across Africa and the global diaspora.')
                  .split('\n').map((p, i) => p.trim() && <p key={i}>{p}</p>)
                }
              </div>
            </div>
          </section>

          {/* Vision & Mission */}
          <section className="section-pad bg-white">
            <div className="container-page">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
                <div className="bg-purple-deep rounded-xl p-10 text-center">
                  <p className="section-label text-gold mb-4">Our Vision</p>
                  <p className="font-display text-white text-xl font-light italic leading-relaxed mb-6">
                    "{about?.vision || 'Bringing hope to the hopeless by the preaching of the Word of Hope, bringing them to a place of acceptance.'}"
                  </p>
                </div>
                <div className="bg-purple-brand rounded-xl p-10 text-center">
                  <p className="section-label text-gold mb-4">Our Mission</p>
                  <p className="font-display text-white text-xl font-light italic leading-relaxed mb-6">
                    "{about?.mission || 'To accept the rejected and raise them as Kingdom leaders through the Word of Hope.'}"
                  </p>
                  <div className="flex items-center justify-center gap-4 text-white/60 text-xs font-body">
                    <span className="flex items-center gap-1"><UserCheck size={12} className="text-gold" /> Accept</span>
                    <span>→</span>
                    <span className="flex items-center gap-1"><TrendingUp size={12} className="text-gold" /> Raise</span>
                    <span>→</span>
                    <span className="flex items-center gap-1"><Star size={12} className="text-gold" /> Birth</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Core Values */}
          {coreValues.length > 0 && (
            <section className="section-pad bg-cream">
              <div className="container-page">
                <div className="text-center mb-10">
                  <p className="section-label mb-3">What drives us</p>
                  <h2 className="section-heading">Core Values</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
                  {coreValues.map((v) => (
                    <div key={v.name} className="bg-white rounded-xl p-7 border border-purple-brand/10 hover:border-gold/30 transition-colors">
                      <CoreValueIcon name={v.icon} />
                      <h3 className="font-display text-h3 text-ink mt-4 mb-2">{v.name}</h3>
                      <p className="text-ink/60 font-body text-sm leading-relaxed">{v.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Statement of Faith */}
          {beliefs.length > 0 && (
            <section className="section-pad bg-white">
              <div className="container-page max-w-3xl mx-auto">
                <div className="text-center mb-10">
                  <p className="section-label mb-3">What we believe</p>
                  <h2 className="section-heading">Statement of Faith</h2>
                </div>
                <div className="space-y-3">
                  {beliefs.map((b) => (
                    <AccordionItem key={b.title} title={b.title} content={b.content} />
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Timeline */}
          {milestones.length > 0 && (
            <section className="section-pad bg-cream">
              <div className="container-page max-w-3xl mx-auto">
                <div className="text-center mb-10">
                  <p className="section-label mb-3">Our Journey</p>
                  <h2 className="section-heading">Ministry Timeline</h2>
                </div>
                <div className="relative pl-8 border-l-2 border-gold/30 space-y-8">
                  {milestones.map((m) => (
                    <div key={m.year} className="relative">
                      <div className="absolute -left-[calc(2rem+4px)] w-4 h-4 rounded-full bg-gold border-2 border-cream" />
                      <div className="bg-white rounded-lg p-5 border border-purple-brand/10">
                        <span className="section-label">{m.year}</span>
                        <h3 className="font-display text-h3 text-ink mt-1 mb-1">{m.title}</h3>
                        <p className="text-ink/60 font-body text-sm">{m.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* CTA */}
          <section className="section-pad bg-purple-deep text-center">
            <div className="container-page">
              <p className="section-label text-gold mb-3">You are welcome here</p>
              <h2 className="section-heading-light mb-8">Ready to Experience HPC Global?</h2>
              <div className="flex items-center justify-center gap-4 flex-wrap">
                <Link to="/new-here" className="btn-primary">Plan your first visit</Link>
                <Link to="/sermons" className="btn-outline">Watch a sermon</Link>
              </div>
            </div>
          </section>
        </>
      )}
    </>
  );
}
