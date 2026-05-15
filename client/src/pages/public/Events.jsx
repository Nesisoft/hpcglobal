import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, MapPin, Wifi, ChevronRight, Clock } from 'lucide-react';
import { publicApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import SectionHero from '../../components/ui/SectionHero';

const CATEGORY_TABS = [
  { value: '',            label: 'All Events' },
  { value: 'SERVICE',     label: 'Services' },
  { value: 'CONFERENCE',  label: 'Conferences' },
  { value: 'YOUTH',       label: 'Youth' },
  { value: 'WOMENS',      label: "Women's" },
  { value: 'MENS',        label: "Men's" },
  { value: 'ONLINE',      label: 'Online' },
  { value: 'OTHER',       label: 'Other' },
];

const CATEGORY_COLORS = {
  SERVICE:    'bg-purple-brand/10 text-purple-brand',
  CONFERENCE: 'bg-gold/10 text-gold',
  YOUTH:      'bg-blue-50 text-blue-600',
  WOMENS:     'bg-pink-50 text-pink-600',
  MENS:       'bg-slate-100 text-slate-600',
  ONLINE:     'bg-emerald-50 text-emerald-600',
  OTHER:      'bg-cream text-ink/60',
};

const CATEGORY_LABELS = {
  SERVICE:    'Service',
  CONFERENCE: 'Conference',
  YOUTH:      'Youth',
  WOMENS:     "Women's",
  MENS:       "Men's",
  ONLINE:     'Online',
  OTHER:      'Other',
};

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
function fmtShortMonth(d) {
  return new Date(d).toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
}
function fmtDay(d) {
  return new Date(d).getDate();
}

function EventCard({ event, featured }) {
  return (
    <Link
      to={`/events/${event.slug}`}
      className={`group block bg-white rounded-xl border border-purple-brand/8 overflow-hidden hover:shadow-md transition-all duration-300 ${featured ? 'lg:flex' : ''}`}
    >
      <div className={`relative overflow-hidden bg-purple-deep/5 ${featured ? 'lg:w-2/5 flex-shrink-0 min-h-[240px]' : 'aspect-[16/9]'}`}>
        {event.imageUrl ? (
          <img
            src={event.imageUrl}
            alt={event.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-purple-brand/20 to-purple-deep/40 flex items-center justify-center">
            <Calendar size={featured ? 48 : 32} className="text-white/30" />
          </div>
        )}
        <div className="absolute top-3 left-3 bg-white rounded-lg px-2.5 py-1.5 text-center shadow-sm min-w-[48px]">
          <p className="text-[9px] font-body font-semibold text-gold uppercase tracking-wider leading-none">
            {fmtShortMonth(event.startDate)}
          </p>
          <p className="font-display text-xl text-ink leading-none mt-0.5">
            {fmtDay(event.startDate)}
          </p>
        </div>
        <div className="absolute top-3 right-3">
          <span className={`text-[10px] font-body font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[event.category] ?? 'bg-white/20 text-white'}`}>
            {CATEGORY_LABELS[event.category] ?? event.category}
          </span>
        </div>
        {event.isFeatured && (
          <div className="absolute bottom-3 left-3">
            <span className="text-[10px] font-body font-semibold px-2 py-0.5 rounded-full bg-gold text-white">
              Featured
            </span>
          </div>
        )}
      </div>

      <div className={`p-5 flex flex-col ${featured ? 'lg:p-8 justify-center' : ''}`}>
        <h3 className={`font-display font-light text-ink mb-2 group-hover:text-purple-brand transition-colors ${featured ? 'text-2xl' : 'text-lg'}`}>
          {event.title}
        </h3>
        <p className={`text-ink/55 font-body leading-relaxed mb-4 ${featured ? 'text-base line-clamp-3' : 'text-sm line-clamp-2'}`}>
          {event.description}
        </p>

        <div className="space-y-1.5 mb-4">
          <div className="flex items-center gap-2 text-ink/50 text-xs font-body">
            <Clock size={12} className="flex-shrink-0" />
            <span>{fmtDate(event.startDate)} · {event.timeGmt} GMT</span>
          </div>
          {event.venue && (
            <div className="flex items-center gap-2 text-ink/50 text-xs font-body">
              <MapPin size={12} className="flex-shrink-0" />
              <span>{event.venue}</span>
            </div>
          )}
          {event.isOnline && (
            <div className="flex items-center gap-2 text-emerald-600 text-xs font-body">
              <Wifi size={12} className="flex-shrink-0" />
              <span>Streaming Online</span>
            </div>
          )}
        </div>

        <div className="flex items-center text-purple-brand text-xs font-body font-medium gap-1 group-hover:gap-2 transition-all mt-auto">
          View Details <ChevronRight size={13} />
        </div>
      </div>
    </Link>
  );
}

export default function Events() {
  const [activeCategory, setActiveCategory] = useState('');

  const fetchFn = useCallback(
    () => publicApi.getEvents(activeCategory ? { category: activeCategory } : {}),
    [activeCategory],
  );
  const { data: rawEvents, loading } = useApi(fetchFn);
  const events = Array.isArray(rawEvents) ? rawEvents : [];

  const featured = events.find((e) => e.isFeatured) ?? events[0] ?? null;
  const rest = events.filter((e) => e !== featured);

  return (
    <>
      <SectionHero
        title="Events"
        subtitle="Join us for worship, teaching, and community. In person or online — all are welcome."
        breadcrumb="Home / Events"
      />

      {/* Category filter bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-purple-brand/8 shadow-sm">
        <div className="container-page">
          <div className="flex items-center gap-1 overflow-x-auto py-3">
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveCategory(tab.value)}
                className={`px-4 py-1.5 rounded-full text-xs font-body font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                  activeCategory === tab.value
                    ? 'bg-purple-brand text-white'
                    : 'text-ink/55 hover:text-ink hover:bg-purple-brand/5'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="section-pad bg-cream">
        <div className="container-page">
          {loading ? (
            <div className="space-y-6">
              <div className="h-72 bg-white rounded-xl animate-pulse" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => <div key={i} className="h-64 bg-white rounded-xl animate-pulse" />)}
              </div>
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-20">
              <Calendar size={48} className="text-purple-brand/20 mx-auto mb-4" />
              <h3 className="font-display text-2xl text-ink font-light mb-2">No upcoming events</h3>
              <p className="text-ink/50 font-body text-sm">
                {activeCategory ? 'No events in this category right now.' : 'Check back soon for upcoming events.'}
              </p>
            </div>
          ) : (
            <div className="space-y-10">
              {featured && (
                <div>
                  <p className="section-label mb-4">Featured Event</p>
                  <EventCard event={featured} featured />
                </div>
              )}
              {rest.length > 0 && (
                <div>
                  {featured && <p className="section-label mb-4">Upcoming Events</p>}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {rest.map((event) => (
                      <EventCard key={event.id} event={event} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="section-pad bg-purple-deep">
        <div className="container-page max-w-2xl mx-auto text-center">
          <p className="section-label text-gold mb-3">Never miss an event</p>
          <h2 className="section-heading-light mb-4">Stay Connected</h2>
          <p className="text-white/60 font-body mb-6 text-sm">
            Follow us on social media or subscribe to our WhatsApp broadcast to receive event updates.
          </p>
          <Link to="/contact" className="btn-secondary">
            Get Event Updates
          </Link>
        </div>
      </section>
    </>
  );
}
