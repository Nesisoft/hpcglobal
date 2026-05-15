import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Play, Calendar, Heart, HandHeart, UserPlus, Users,
  BookOpen, MessageCircle, Clock, ChevronLeft, ChevronRight,
  Radio, ArrowRight, Smartphone, Building2,
} from 'lucide-react';
import { FaYoutube, FaWhatsapp, FaFacebook, FaInstagram } from 'react-icons/fa';
import { useApi } from '../../hooks/useApi';
import { publicApi } from '../../services/api';
import { formatDate } from '../../utils/formatDate';
import Badge from '../../components/ui/Badge';

// ─── Hero Carousel ─────────────────────────────────────────────────────────
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

function HeroCarousel() {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused]   = useState(false);
  const total = STATIC_SLIDES.length;

  const next = useCallback(() => setCurrent((c) => (c + 1) % total), [total]);
  const prev = () => setCurrent((c) => (c - 1 + total) % total);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(next, 6000);
    return () => clearInterval(t);
  }, [next, paused]);

  const slide = STATIC_SLIDES[current];

  return (
    <section
      className="relative min-h-screen flex items-center bg-purple-deep overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Background gradient */}
      <div className="absolute inset-0 bg-hero-gradient" />
      {/* Geometric overlay */}
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 40px, rgba(201,168,76,0.3) 40px, rgba(201,168,76,0.3) 41px)',
      }} />

      <div className="container-page relative z-10 text-center py-32">
        <p className="section-label text-gold mb-6 animate-fade-in">Welcome to HPC Global</p>

        <h1 className="font-display text-display text-white font-light leading-tight mb-6 max-w-4xl mx-auto">
          {slide.headline}
        </h1>

        {slide.subheadline && (
          <p className="text-white/70 font-body text-lg mb-4">{slide.subheadline}</p>
        )}
        {slide.body && (
          <p className="text-white/55 font-body text-base max-w-2xl mx-auto mb-10 leading-relaxed">
            {slide.body}
          </p>
        )}

        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link to={slide.ctaPrimaryUrl} className="btn-primary">
            {slide.ctaPrimary}
          </Link>
          {slide.ctaSecondary && (
            <Link
              to={slide.ctaSecondaryUrl}
              className={slide.ctaSecondaryUrl?.startsWith('http') ? '' : 'btn-outline'}
            >
              <Play size={14} /> {slide.ctaSecondary}
            </Link>
          )}
        </div>
      </div>

      {/* Arrows */}
      <button onClick={prev} className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all z-20">
        <ChevronLeft size={18} />
      </button>
      <button onClick={next} className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all z-20">
        <ChevronRight size={18} />
      </button>

      {/* Dots */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 z-20">
        {STATIC_SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className={`carousel-dot ${i === current ? 'active' : ''}`}
          />
        ))}
      </div>
    </section>
  );
}

// ─── Event Ticker ──────────────────────────────────────────────────────────
function EventTicker() {
  const items = [
    '🗓 Dominion Encounter — Every Sunday 9am GMT',
    '🎙 Prophetic & Miracle — Fridays 6:30pm GMT',
    '🌐 Global Prophetic Highway — Sundays 9pm GMT / 4pm EST / 10pm BST',
    '✦ Join us in person or online — all are welcome',
  ];
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
const SERVICES = [
  {
    name: 'Dominion Encounter',
    day: 'Sundays',
    time: '9:00 AM – 11:30 AM GMT',
    type: 'Physical + YouTube Live',
    link: 'https://youtube.com/@prophetclottey',
    linkLabel: 'Watch live',
  },
  {
    name: 'Prophetic & Miracle',
    day: 'Fridays',
    time: '6:30 PM – 9:00 PM GMT',
    type: 'Physical + YouTube Live',
    link: 'https://youtube.com/@prophetclottey',
    linkLabel: 'Watch live',
  },
  {
    name: 'Global Prophetic Highway',
    day: 'Sundays',
    time: '9pm GMT · 4pm EST · 10pm BST',
    type: 'Online via Zoom',
    link: '/contact',
    linkLabel: 'Get Zoom link',
  },
];

function ServiceTimesBar() {
  return (
    <section className="bg-purple-brand py-10">
      <div className="container-page">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {SERVICES.map((s) => (
            <div key={s.name} className="text-center p-6 border border-white/10 rounded-lg hover:border-gold/30 transition-colors">
              <div className="flex items-center justify-center gap-2 mb-3">
                <Clock size={14} className="text-gold" />
                <span className="section-label">{s.day}</span>
              </div>
              <h3 className="font-display text-white text-h3 font-normal mb-1">{s.name}</h3>
              <p className="text-gold font-body text-sm mb-1">{s.time}</p>
              <p className="text-white/50 font-body text-xs mb-4">{s.type}</p>
              <a
                href={s.link}
                target={s.link.startsWith('http') ? '_blank' : '_self'}
                rel="noopener noreferrer"
                className="btn-ghost text-xs"
              >
                {s.linkLabel} <ArrowRight size={12} />
              </a>
            </div>
          ))}
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
          <h2 className="section-heading mb-5">
            Bringing Hope to the Nations
          </h2>
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
            { n: '3',      label: 'Weekly Services'  },
            { n: '15+',    label: 'Years in Ministry' },
            { n: 'Global', label: 'Online Reach'      },
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

// ─── Feature Cards Grid ─────────────────────────────────────────────────────
const FEATURE_CARDS = [
  { icon: Play,          label: 'Watch Sermons',     sub: 'Access our full library',           to: '/sermons'    },
  { icon: Calendar,      label: 'Events',            sub: 'See what\'s coming up',              to: '/events'     },
  { icon: Heart,         label: 'Give Online',       sub: 'Support the ministry',              to: '/give'       },
  { icon: HandHeart,     label: 'Prayer Request',    sub: 'Let us pray with you',              to: '/prayer'     },
  { icon: UserPlus,      label: "I'm New Here",      sub: 'Plan your first visit',             to: '/new-here'   },
  { icon: Users,         label: 'Ministries',        sub: 'Find your community',               to: '/ministries' },
  { icon: BookOpen,      label: 'Devotionals',       sub: 'Feed your spirit daily',            to: '/blog'       },
  { icon: MessageCircle, label: 'Contact Us',        sub: "We'd love to hear from you",        to: '/contact'    },
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
  const { data, loading } = useApi(() => publicApi.getYouTube({ count: 3 }));

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
            {[1,2,3].map((i) => (
              <div key={i} className="bg-white rounded-lg h-64 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {(data || []).slice(0, 3).map((video) => (
              <a
                key={video.id}
                href={video.url}
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
                  <p className="font-body font-medium text-ink text-sm leading-snug line-clamp-2 mb-2">
                    {video.title}
                  </p>
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
            { icon: Smartphone, label: 'MTN MoMo'       },
            { icon: Smartphone, label: 'Telecel Cash'    },
            { icon: Smartphone, label: 'AirtelTigo'      },
            { icon: Building2,  label: 'Bank Transfer'   },
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
function SocialFollow() {
  return (
    <section className="section-pad bg-white">
      <div className="container-page text-center">
        <p className="section-label mb-3">Stay Connected</p>
        <h2 className="section-heading mb-6">Follow HPC Global</h2>
        <p className="text-ink/60 font-body mb-8 max-w-md mx-auto">
          Subscribe to our YouTube channel and follow us on social media for daily encouragement, sermon clips, and ministry updates.
        </p>
        <div className="flex items-center justify-center gap-4">
          <a
            href="https://youtube.com/@prophetclottey"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-red-600 text-white px-5 py-2.5 rounded font-body text-sm font-medium hover:bg-red-700 transition-colors"
          >
            <FaYoutube size={18} /> Subscribe
          </a>
          <a href="#" className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white hover:bg-blue-700 transition-colors">
            <FaFacebook size={16} />
          </a>
          <a href="#" className="w-10 h-10 rounded-full bg-pink-500 flex items-center justify-center text-white hover:bg-pink-600 transition-colors">
            <FaInstagram size={16} />
          </a>
          <a href="https://wa.me/233000000000" target="_blank" rel="noopener noreferrer"
            className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white hover:bg-green-600 transition-colors">
            <FaWhatsapp size={16} />
          </a>
        </div>
      </div>
    </section>
  );
}

// ─── Home Page ─────────────────────────────────────────────────────────────
export default function Home() {
  return (
    <>
      <HeroCarousel />
      <EventTicker />
      <ServiceTimesBar />
      <AboutSnapshot />
      <FeatureCards />
      <SermonsStrip />
      <GiveBand />
      <SocialFollow />
    </>
  );
}
