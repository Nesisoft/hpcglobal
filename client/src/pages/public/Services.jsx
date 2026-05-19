import { useCallback } from 'react';
import SEO from '../../components/ui/SEO';
import { Link } from 'react-router-dom';
import { Clock, MapPin, Video, CalendarPlus, HelpCircle, Calendar, MessageCircle } from 'lucide-react';
import { FaYoutube } from 'react-icons/fa';
import { publicApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import SectionHero from '../../components/ui/SectionHero';

const STATIC_SERVICES = [
  {
    id: 's1',
    name: 'Dominion Encounter',
    day: 'Sundays',
    timeGmt: '9:00 AM – 11:30 AM GMT',
    duration: '~2.5 hours',
    isOnline: false,
    isStreamed: true,
    youtubeUrl: 'https://youtube.com/@prophetclottey',
  },
  {
    id: 's2',
    name: 'Prophetic & Miracle Service',
    day: 'Fridays',
    timeGmt: '6:30 PM – 9:00 PM GMT',
    duration: '~2.5 hours',
    isOnline: false,
    isStreamed: true,
    youtubeUrl: 'https://youtube.com/@prophetclottey',
  },
  {
    id: 's3',
    name: 'Global Prophetic Highway',
    day: 'Sundays',
    timeGmt: '9:00 PM GMT · 4:00 PM EST · 10:00 PM BST',
    duration: 'Approx. 1.5 hours',
    isOnline: true,
    isStreamed: false,
    joinLink: '/contact',
  },
];

// Static expect/dress info keyed by service name (enriches API data)
const SERVICE_DETAILS = {
  'Dominion Encounter': {
    location: 'Klagon Junction, Behind K. Ofori Enterprise, Accra',
    expect: [
      'Expectant, Spirit-led worship',
      'Prophetic, Word-based preaching',
      'Altar call and prayer ministry',
      "Children's church available",
    ],
    dress: 'Smart casual — come as you are',
  },
  'Prophetic & Miracle Service': {
    location: 'Klagon Junction, Behind K. Ofori Enterprise, Accra',
    expect: [
      'Powerful prophetic declaration',
      'Healing and deliverance ministry',
      'Miracles and testimonies',
      'Intercession and prayer',
    ],
    dress: 'Smart casual — come as you are',
  },
  'Global Prophetic Highway': {
    location: 'Online — Zoom',
    expect: [
      'Global prayer and intercession',
      'Prophetic Word for the nations',
      'Interactive participation in chat',
      'Receive prayer online',
    ],
  },
};

const FAQ = [
  { q: 'Do I need to be a Christian to visit?', a: 'Absolutely not. All are welcome at HPC Global regardless of background. We would love to meet you wherever you are on your journey.' },
  { q: 'What should I wear?', a: 'Smart casual is perfectly fine. Come as you are — we care more about your presence than your attire.' },
  { q: 'How long is the service?', a: 'Dominion Encounter and Prophetic & Miracle services run approximately 2.5 hours. The Global Prophetic Highway on Zoom is typically 1.5 hours.' },
  { q: 'Is there parking available?', a: 'Yes, parking is available at the Klagon Junction location. Our ushers will direct you on arrival.' },
  { q: 'What happens with my children?', a: "Children's church runs parallel to the Dominion Encounter service on Sundays. Children are welcomed and cared for in a safe, nurturing environment." },
  { q: 'Can I watch online if I\'m outside Ghana?', a: 'Yes. Our services are streamed live on YouTube (@prophetclottey). The Global Prophetic Highway is specifically designed for our international family and runs on Zoom.' },
];

export default function Services() {
  const fetchFn = useCallback(() => publicApi.getServiceTimes(), []);
  const { data: rawTimes } = useApi(fetchFn);
  const apiServices = Array.isArray(rawTimes) && rawTimes.length > 0 ? rawTimes : STATIC_SERVICES;

  return (
    <>
      <SEO title="Our Services" description="Join HPC Global three times a week — Dominion Encounter (Sundays), Prophetic & Miracle (Fridays), and Global Prophetic Highway online (Sundays)." />
      <SectionHero
        title="Our Services"
        subtitle="Three gatherings every week — in person and online. All are welcome."
        breadcrumb="Home / Services"
      />

      {/* Service Cards */}
      <section className="section-pad bg-cream">
        <div className="container-page">
          <div className="space-y-10">
            {apiServices.map((s, i) => {
              const details = SERVICE_DETAILS[s.name] ?? {};
              const timeDisplay = [s.timeGmt, s.timeEst, s.timeBst].filter(Boolean).join(' · ');
              const location = details.location ?? (s.isOnline ? 'Online — Zoom' : s.platform ?? 'In Person');
              const expect   = details.expect ?? [];
              const dress    = details.dress ?? null;

              return (
                <div key={s.id} className={`grid grid-cols-1 lg:grid-cols-2 gap-0 rounded-xl overflow-hidden border border-purple-brand/10 ${i % 2 === 1 ? 'lg:grid-flow-dense' : ''}`}>
                  {/* Info panel */}
                  <div
                    className={`p-10 ${i % 2 === 1 ? 'lg:col-start-2' : ''}`}
                    style={{ background: ['#210A4A', '#3B1278', '#5A2DAF'][i] ?? '#3B1278' }}
                  >
                    <p className="section-label text-gold mb-3">{s.day}</p>
                    <h2 className="font-display text-white text-3xl font-light mb-2">{s.name}</h2>
                    <p className="text-gold font-body text-lg mb-6">{timeDisplay}</p>

                    <div className="space-y-3">
                      {s.duration && (
                        <div className="flex items-start gap-2 text-white/70 text-sm font-body">
                          <Clock size={14} className="mt-0.5 flex-shrink-0 text-gold" />
                          <span>Duration: {s.duration}</span>
                        </div>
                      )}
                      <div className="flex items-start gap-2 text-white/70 text-sm font-body">
                        {s.isOnline
                          ? <Video size={14} className="mt-0.5 flex-shrink-0 text-gold" />
                          : <MapPin size={14} className="mt-0.5 flex-shrink-0 text-gold" />}
                        <span>{location}</span>
                      </div>
                      {s.isStreamed && (
                        <div className="flex items-center gap-2 text-white/70 text-sm font-body">
                          <FaYoutube size={14} className="text-gold" />
                          <a href={s.youtubeUrl || 'https://youtube.com/@prophetclottey'} target="_blank" rel="noopener noreferrer" className="hover:text-gold transition-colors">
                            Watch live on YouTube
                          </a>
                        </div>
                      )}
                    </div>

                    <div className="mt-6 flex flex-wrap gap-3">
                      {s.isOnline ? (
                        <Link to={s.joinLink || '/contact'} className="btn-primary text-xs px-4 py-2"><Video size={13} /> Get Zoom Link</Link>
                      ) : (
                        <a
                          href={`https://maps.google.com/?q=${encodeURIComponent(location)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-primary text-xs px-4 py-2"
                        >
                          <MapPin size={13} /> Get Directions
                        </a>
                      )}
                      <a
                        href={`https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(s.name)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-outline text-xs px-4 py-2 border-white/30 text-white hover:bg-white/10"
                      >
                        <CalendarPlus size={12} /> Add to Calendar
                      </a>
                    </div>
                  </div>

                  {/* Expect panel */}
                  <div className="bg-white p-10">
                    <h3 className="font-display text-h3 text-ink mb-6">What to Expect</h3>
                    {expect.length > 0 ? (
                      <ul className="space-y-3 mb-6">
                        {expect.map((item) => (
                          <li key={item} className="flex items-start gap-3 font-body text-sm text-ink/70">
                            <div className="w-5 h-5 rounded-full bg-gold/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <div className="w-1.5 h-1.5 rounded-full bg-gold" />
                            </div>
                            {item}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-ink/40 font-body text-sm mb-6">Spirit-led worship, Word-based preaching, and prayer ministry.</p>
                    )}
                    {dress && (
                      <div className="p-4 bg-gold-pale rounded-lg">
                        <p className="text-xs font-body text-ink/60"><strong>Dress code:</strong> {dress}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* First timer guide */}
      <section className="section-pad bg-white">
        <div className="container-page max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <p className="section-label mb-3">For first-time visitors</p>
            <h2 className="section-heading">What to Expect at HPC Global</h2>
          </div>
          <div className="space-y-4">
            {[
              { label: 'When you arrive…',       text: 'Our welcome team will greet you at the door. You will be directed to a seat and helped to feel at home from the moment you walk in.' },
              { label: 'Worship…',               text: 'We worship in a free, Spirit-led atmosphere. You are welcome to participate at whatever level you are comfortable with.' },
              { label: 'The Word…',              text: 'Expect prophetic, practical, and life-giving preaching from the Word of God. We believe the Bible speaks directly to your situation.' },
              { label: 'Ministry time…',         text: 'At the close of the service there is an opportunity for prayer, altar call, and prophetic ministry. This is always optional.' },
              { label: 'After the service…',     text: 'Stay for fellowship! Our team would love to meet you and answer any questions you have about the church.' },
            ].map(({ label, text }) => (
              <div key={label} className="flex gap-4 p-5 bg-cream rounded-lg">
                <HelpCircle size={18} className="text-gold flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-body font-semibold text-ink text-sm">{label}</p>
                  <p className="text-ink/60 font-body text-sm mt-1">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section-pad bg-cream">
        <div className="container-page max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <p className="section-label mb-3">Common questions</p>
            <h2 className="section-heading">FAQ</h2>
          </div>
          <div className="space-y-4">
            {FAQ.map(({ q, a }) => (
              <div key={q} className="bg-white rounded-lg p-6 border border-purple-brand/10">
                <p className="font-body font-semibold text-ink mb-2">{q}</p>
                <p className="text-ink/60 font-body text-sm leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-pad bg-purple-deep text-center">
        <div className="container-page">
          <h2 className="section-heading-light mb-6">Ready to Join Us?</h2>
          <div className="flex justify-center gap-4 flex-wrap">
            <Link to="/new-here" className="btn-primary"><Calendar size={14} /> Plan Your Visit</Link>
            <Link to="/contact" className="btn-outline"><MessageCircle size={14} /> Get in Touch</Link>
          </div>
        </div>
      </section>
    </>
  );
}
