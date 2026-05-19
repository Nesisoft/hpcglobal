import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Play, Calendar, Heart, HandHeart, UserPlus, Users,
  BookOpen, MessageCircle, Clock, ChevronLeft, ChevronRight,
  Radio, ArrowRight, Smartphone, Building2, CreditCard,
} from 'lucide-react';
import { FaYoutube, FaWhatsapp, FaFacebook, FaInstagram } from 'react-icons/fa';
import { useApi } from '../../hooks/useApi';
import { publicApi } from '../../services/api';
import { formatDate } from '../../utils/formatDate';
import Reveal from '../../components/ui/Reveal';

const STATIC_SLIDES = [
  {
    id: 'identity',
    type: 'IDENTITY',
    headline: 'Where Hope Meets Destiny',
    subheadline: 'Hopepress Chapel — Accra, Ghana',
    body: 'An Apostolic Prophetic Word-based ministry bringing hope to the hopeless and raising Kingdom leaders worldwide.',
    ctaPrimary: "I'm new here",
    ctaPrimaryUrl: '/new-here',
    ctaSecondary: 'Watch a sermon',
    ctaSecondaryUrl: '/sermons',
  },
  {
    id: 'youtube',
    type: 'YOUTUBE',
    headline: 'Latest Message',
    subheadline: 'Watch our most recent teaching',
    ctaPrimary: 'Watch on YouTube',
    ctaPrimaryUrl: 'https://youtube.com/@prophetclottey',
    ctaSecondary: 'All sermons',
    ctaSecondaryUrl: '/sermons',
  },
];

const STATIC_TICKER = [
  '🗓 Dominion Encounter — Every Sunday 9am GMT',
  '🎙 Prophetic & Miracle — Fridays 6:30pm GMT',
  '🌐 Global Prophetic Highway — Sundays 9pm GMT / 4pm EST / 10pm BST',
  '✦ Join us in person or online — all are welcome',
];

const STATIC_SERVICES = [
  { id: 's1', name: 'Dominion Encounter',        day: 'Sundays',  timeGmt: '9:00 AM – 11:30 AM GMT',         isOnline: false, isStreamed: true,  youtubeUrl: 'https://youtube.com/@prophetclottey' },
  { id: 's2', name: 'Prophetic & Miracle',        day: 'Fridays',  timeGmt: '6:30 PM – 9:00 PM GMT',          isOnline: false, isStreamed: true,  youtubeUrl: 'https://youtube.com/@prophetclottey' },
  { id: 's3', name: 'Global Prophetic Highway',   day: 'Sundays',  timeGmt: '9pm GMT · 4pm EST · 10pm BST',   isOnline: true,  isStreamed: false, joinLink: '/contact' },
];

// ─── Hero Carousel ─────────────────────────────────────────────────────────

function HeroCarousel({ slides }) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused]   = useState(false);
  const total = slides.length;

  const next = useCallback(() => setCurrent((c) => (c + 1) % total), [total]);
  const prev = () => setCurrent((c) => (c - 1 + total) % total);

  useEffect(() => {
    if (paused || total < 2) return;
    const t = setInterval(next, 6000);
    return () => clearInterval(t);
  }, [next, paused, total]);

  const slide = slides[current] ?? slides[0];
  if (!slide) return null;

  const isExternal = slide.ctaPrimaryUrl?.startsWith('http');
  const isSecondaryExternal = slide.ctaSecondaryUrl?.startsWith('http');

  return (
    <section
      className="relative min-h-screen flex items-center bg-purple-deep overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Background */}
      <div className="absolute inset-0 bg-hero-gradient" />
      {slide.imageUrl && (
        <div className="absolute inset-0">
          <img src={slide.imageUrl} alt="" className="w-full h-full object-cover opacity-20" />
          <div className="absolute inset-0 bg-purple-deep/60" />
        </div>
      )}
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 40px, rgba(201,168,76,0.3) 40px, rgba(201,168,76,0.3) 41px)',
      }} />

      <div className="container-page relative z-10 text-center py-32">
        <p className="section-label text-gold mb-6">Welcome to HPC Global</p>

        <h1 className="font-display text-display text-white font-light leading-tight mb-6 max-w-4xl mx-auto">
          {slide.headline || 'Where Hope Meets Destiny'}
        </h1>

        {slide.subheadline && (
          <p className="text-white/70 font-body text-lg mb-4">{slide.subheadline}</p>
        )}
        {slide.body && (
          <p className="text-white/55 font-body text-base max-w-2xl mx-auto mb-10 leading-relaxed">{slide.body}</p>
        )}

        {(slide.ctaPrimary || slide.ctaSecondary) && (
          <div className="flex items-center justify-center gap-4 flex-wrap">
            {slide.ctaPrimary && (
              isExternal
                ? <a href={slide.ctaPrimaryUrl} target="_blank" rel="noopener noreferrer" className="btn-primary">{slide.ctaPrimary}</a>
                : <Link to={slide.ctaPrimaryUrl || '/'} className="btn-primary">{slide.ctaPrimary}</Link>
            )}
            {slide.ctaSecondary && (
              isSecondaryExternal
                ? <a href={slide.ctaSecondaryUrl} target="_blank" rel="noopener noreferrer" className="btn-outline"><Play size={14} /> {slide.ctaSecondary}</a>
                : <Link to={slide.ctaSecondaryUrl || '/'} className="btn-outline"><Play size={14} /> {slide.ctaSecondary}</Link>
            )}
          </div>
        )}
      </div>

      {total > 1 && (
        <>
          <button onClick={prev} className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all z-20">
            <ChevronLeft size={18} />
          </button>
          <button onClick={next} className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all z-20">
            <ChevronRight size={18} />
          </button>
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 z-20">
            {slides.map((_, i) => (
              <button key={i} onClick={() => setCurrent(i)} className={`carousel-dot ${i === current ? 'active' : ''}`} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

// ─── Event Ticker ──────────────────────────────────────────────────────────

function EventTicker({ messages }) {
  const items = messages.length > 0 ? messages : STATIC_TICKER;
  const repeated = [...items, ...items];

  return (
    <div className="bg-gold py-3 overflow-hidden cursor-pointer" onClick={() => window.location.href = '/events'}>
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 px-4 flex-shrink-0 z-10 bg-gold">
          <Radio size={13} className="text-purple-deep" />
          <span className="text-purple-deep font-body font-semibold text-xs uppercase tracking-widest whitespace-nowrap">
            Upcoming
          </span>
          <div className="w-px h-4 bg-purple-deep/20 ml-2" />
        </div>
        <div className="ticker-track flex gap-10">
          {repeated.map((item, i) => (
            <span key={i} className="text-purple-deep font-body text-sm font-medium whitespace-nowrap">
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Service Times Bar ─────────────────────────────────────────────────────

function ServiceTimesBar({ services }) {
  const list = services.length > 0 ? services : STATIC_SERVICES;

  return (
    <section className="bg-purple-brand py-10">
      <div className="container-page">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {list.map((s) => {
            const timeDisplay = [s.timeGmt, s.timeEst, s.timeBst].filter(Boolean).join(' · ');
            const linkHref = s.isOnline
              ? (s.joinLink || '/contact')
              : s.isStreamed
                ? (s.youtubeUrl || 'https://youtube.com/@prophetclottey')
                : '/services';
            const isExternal = linkHref.startsWith('http');
            const linkLabel  = s.isOnline ? 'Get Zoom Link' : s.isStreamed ? 'Watch live' : 'Learn more';

            return (
              <div key={s.id} className="flex flex-row md:flex-col rounded-xl overflow-hidden border border-white/10 hover:border-gold/30 transition-colors bg-white/5">
                {/* Image — left on mobile, top on md+ */}
                <div className="w-28 flex-shrink-0 md:w-full md:h-44 relative overflow-hidden">
                  {s.imageUrl ? (
                    <img
                      src={s.imageUrl}
                      alt={s.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-purple-deep/60 flex items-center justify-center">
                      <Clock size={28} className="text-gold/40" />
                    </div>
                  )}
                  {/* Day badge */}
                  <span className="absolute top-2 left-2 bg-gold text-purple-deep text-[10px] font-body font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider">
                    {s.day}
                  </span>
                </div>

                {/* Content */}
                <div className="flex flex-col justify-between flex-1 p-4 md:p-5">
                  <div>
                    <h3 className="font-display text-white text-base font-normal leading-snug mb-1">{s.name}</h3>
                    <p className="text-gold font-body text-xs mb-1">{timeDisplay}</p>
                    <p className="text-white/50 font-body text-[11px]">
                      {s.isOnline ? 'Online via Zoom' : s.isStreamed ? 'Physical + YouTube Live' : 'In Person'}
                    </p>
                  </div>
                  <div className="mt-3">
                    {isExternal ? (
                      <a href={linkHref} target="_blank" rel="noopener noreferrer" className="btn-ghost text-xs">
                        {linkLabel} <ArrowRight size={12} />
                      </a>
                    ) : (
                      <Link to={linkHref} className="btn-ghost text-xs">
                        {linkLabel} <ArrowRight size={12} />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── About Snapshot ────────────────────────────────────────────────────────

function AboutSnapshot() {
  return (
    <section className="section-pad bg-cream">
      <div className="container-page">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <p className="section-label mb-3">Who we are</p>
          <h2 className="section-heading mb-5">Bringing Hope to the Nations</h2>
          <p className="text-ink/70 font-body leading-relaxed">
            HPC Global — Hopepress Chapel is an Apostolic Prophetic Word-based ministry founded by Prophet George and Lady Apostle Adelaide Clottey. We exist to accept the rejected, raise Kingdom leaders, and birth people into their God-given place of influence.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10 max-w-3xl mx-auto">
          <div className="bg-purple-deep rounded-lg p-8 text-center">
            <p className="section-label text-gold mb-3">Our Vision</p>
            <p className="font-display text-white/90 text-lg font-light leading-relaxed italic">
              "Bringing hope to the hopeless by the preaching of the Word of Hope and bringing them to a place of acceptance."
            </p>
          </div>
          <div className="bg-purple-brand rounded-lg p-8 text-center">
            <p className="section-label text-gold mb-3">Our Mission</p>
            <p className="font-display text-white/90 text-lg font-light leading-relaxed italic">
              "To accept the rejected and raise them as Kingdom leaders through the Word of Hope."
            </p>
          </div>
        </div>
        <div className="flex justify-center gap-8 text-center mb-10">
          {[
            { n: '3', label: 'Weekly Services' },
            { n: '15+', label: 'Years in Ministry' },
            { n: 'Global', label: 'Online Reach' },
          ].map((s) => (
            <div key={s.label}>
              <div className="font-display text-4xl text-purple-brand font-light">{s.n}</div>
              <div className="text-ink/50 font-body text-xs uppercase tracking-widest mt-1">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="text-center">
          <Link to="/about" className="btn-outline border-purple-brand text-purple-brand hover:bg-purple-brand hover:text-white">
            Our full story <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── Feature Cards ─────────────────────────────────────────────────────────

const FEATURE_CARDS = [
  { icon: Play,          label: 'Watch Sermons',  sub: 'Access our full library',        to: '/sermons'    },
  { icon: Calendar,      label: 'Events',          sub: "See what's coming up",           to: '/events'     },
  { icon: Heart,         label: 'Give Online',     sub: 'Support the ministry',           to: '/give'       },
  { icon: HandHeart,     label: 'Prayer Request',  sub: 'Let us pray with you',           to: '/prayer'     },
  { icon: UserPlus,      label: "I'm New Here",    sub: 'Plan your first visit',          to: '/new-here'   },
  { icon: Users,         label: 'Ministries',      sub: 'Find your community',            to: '/ministries' },
  { icon: BookOpen,      label: 'Devotionals',     sub: 'Feed your spirit daily',         to: '/blog'       },
  { icon: MessageCircle, label: 'Contact Us',      sub: "We'd love to hear from you",     to: '/contact'    },
];

function FeatureCards() {
  return (
    <section className="section-pad bg-white">
      <div className="container-page">
        <div className="text-center mb-10">
          <p className="section-label mb-3">Get Involved</p>
          <h2 className="section-heading">How Can We Help?</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {FEATURE_CARDS.map(({ icon: Icon, label, sub, to }) => (
            <Link key={label} to={to} className="card p-6 text-center group">
              <div className="w-12 h-12 rounded-full bg-purple-deep/5 group-hover:bg-gold/10 flex items-center justify-center mx-auto mb-4 transition-colors">
                <Icon size={22} className="text-purple-brand group-hover:text-gold transition-colors" />
              </div>
              <h3 className="font-body font-semibold text-ink text-sm mb-1">{label}</h3>
              <p className="text-ink/50 text-xs font-body">{sub}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Latest Sermons Strip ──────────────────────────────────────────────────

function SermonsStrip() {
  const { data: dbData, loading: dbLoading } = useApi(() => publicApi.getSermons({ limit: 3 }));
  const { data: ytVideos, loading: ytLoading } = useApi(() => publicApi.getYouTube({ count: 3 }));

  const dbSermons = dbData?.sermons ?? [];
  const useDb = dbSermons.length > 0;

  const loading = dbLoading || ytLoading;

  const cards = useDb
    ? dbSermons.map((s) => ({
        id:          s.id,
        youtubeId:   s.youtubeId,
        url:         s.youtubeUrl,
        thumbnail:   s.thumbnailUrl,
        title:       s.title,
        publishedAt: s.datePracticed,
      }))
    : (Array.isArray(ytVideos) ? ytVideos : []).slice(0, 3);

  return (
    <section className="section-pad bg-cream">
      <div className="container-page">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="section-label mb-1">Messages</p>
            <h2 className="section-heading">Latest Sermons</h2>
          </div>
          <Link to="/sermons" className="btn-ghost hidden sm:flex">
            View all <ArrowRight size={14} />
          </Link>
        </div>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[1,2,3].map((i) => <div key={i} className="bg-white rounded-lg h-64 animate-pulse" />)}
          </div>
        ) : cards.length === 0 ? (
          <p className="text-center text-ink/40 font-body py-10">No sermons available yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {cards.map((video) => (
              <a
                key={video.id}
                href={video.url || `https://youtube.com/watch?v=${video.youtubeId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="card group overflow-hidden"
              >
                <div className="relative">
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-full aspect-video object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-purple-deep/30 group-hover:bg-purple-deep/10 transition-colors flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-gold/90 flex items-center justify-center">
                      <Play size={18} className="text-purple-deep ml-0.5" />
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <p className="font-body font-medium text-ink text-sm leading-snug line-clamp-2 mb-2">{video.title}</p>
                  <p className="text-ink/40 text-xs font-body">{formatDate(video.publishedAt)}</p>
                </div>
              </a>
            ))}
          </div>
        )}
        <div className="text-center mt-6 sm:hidden">
          <Link to="/sermons" className="btn-ghost">View all sermons <ArrowRight size={14} /></Link>
        </div>
      </div>
    </section>
  );
}

// ─── Give Band ─────────────────────────────────────────────────────────────

function GiveBand() {
  return (
    <section className="bg-purple-deep section-pad">
      <div className="container-page text-center">
        <p className="section-label text-gold mb-4">Support the Ministry</p>
        <h2 className="section-heading-light mb-4">Give to HPC Global</h2>
        <p className="font-display italic text-white/60 text-lg mb-2">
          "Bring the whole tithe into the storehouse... and see if I will not throw open the floodgates of heaven."
        </p>
        <p className="text-white/40 text-sm font-body mb-10">— Malachi 3:10</p>
        <div className="flex flex-wrap justify-center gap-3 mb-8">
          {[
            { icon: Smartphone, label: 'Mobile Money' },
            { icon: CreditCard, label: 'Card' },
            { icon: Building2,  label: 'Bank Transfer' },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 bg-white/10 border border-white/15 rounded-full px-4 py-2">
              <Icon size={13} className="text-gold" />
              <span className="text-white/70 text-xs font-body">{label}</span>
            </div>
          ))}
        </div>
        <Link to="/give" className="btn-primary text-base px-8 py-4">
          Give Now <Heart size={15} />
        </Link>
      </div>
    </section>
  );
}

// ─── Social Follow ─────────────────────────────────────────────────────────

function SocialFollow({ settings }) {
  const ytHandle = settings?.youtubeHandle || '@prophetclottey';
  const ytUrl    = `https://youtube.com/${ytHandle.startsWith('@') ? ytHandle : '@' + ytHandle}`;
  const fbUrl    = settings?.facebookUrl   || null;
  const igUrl    = settings?.instagramUrl  || null;
  const waNum    = settings?.whatsapp      || null;
  const waUrl    = waNum ? `https://wa.me/${waNum.replace(/\D/g, '')}` : null;

  return (
    <section className="section-pad bg-white">
      <div className="container-page text-center">
        <p className="section-label mb-3">Stay Connected</p>
        <h2 className="section-heading mb-6">Follow HPC Global</h2>
        <p className="text-ink/60 font-body mb-8 max-w-md mx-auto">
          Subscribe to our YouTube channel and follow us on social media for daily encouragement, sermon clips, and ministry updates.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <a
            href={ytUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-red-600 text-white px-5 py-2.5 rounded font-body text-sm font-medium hover:bg-red-700 transition-colors"
          >
            <FaYoutube size={18} /> Subscribe
          </a>
          {fbUrl ? (
            <a href={fbUrl} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white hover:bg-blue-700 transition-colors">
              <FaFacebook size={16} />
            </a>
          ) : (
            <div className="w-10 h-10 rounded-full bg-blue-600/30 flex items-center justify-center text-white/40 cursor-not-allowed">
              <FaFacebook size={16} />
            </div>
          )}
          {igUrl ? (
            <a href={igUrl} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-pink-500 flex items-center justify-center text-white hover:bg-pink-600 transition-colors">
              <FaInstagram size={16} />
            </a>
          ) : (
            <div className="w-10 h-10 rounded-full bg-pink-500/30 flex items-center justify-center text-white/40 cursor-not-allowed">
              <FaInstagram size={16} />
            </div>
          )}
          {waUrl && (
            <a href={waUrl} target="_blank" rel="noopener noreferrer"
              className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white hover:bg-green-600 transition-colors">
              <FaWhatsapp size={16} />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Home Page ─────────────────────────────────────────────────────────────

export default function Home() {
  const { data: heroData }  = useApi(() => publicApi.getHero());
  const { data: stData }    = useApi(() => publicApi.getServiceTimes());
  const { data: settings }  = useApi(() => publicApi.getSettings());

  // Hero slides — fall back to static if DB is empty
  const rawSlides = heroData?.slides;
  const slides = Array.isArray(rawSlides) && rawSlides.length > 0
    ? rawSlides
    : STATIC_SLIDES;

  // Ticker messages — from hero endpoint or static
  const tickerRaw = heroData?.tickerMessages;
  let tickerMessages = [];
  try {
    const parsed = typeof tickerRaw === 'string' ? JSON.parse(tickerRaw) : tickerRaw;
    tickerMessages = Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch { /* keep empty */ }

  // Service times — fall back to static
  const services = Array.isArray(stData) && stData.length > 0 ? stData : STATIC_SERVICES;

  return (
    <>
      <HeroCarousel slides={slides} />
      <EventTicker messages={tickerMessages} />
      <ServiceTimesBar services={services} />
      <Reveal><AboutSnapshot /></Reveal>
      <Reveal><FeatureCards /></Reveal>
      <Reveal><SermonsStrip /></Reveal>
      <Reveal><GiveBand /></Reveal>
      <Reveal><SocialFollow settings={settings} /></Reveal>
    </>
  );
}
