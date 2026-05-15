import { useCallback } from 'react';
import SEO from '../../components/ui/SEO';
import { Link } from 'react-router-dom';
import {
  Users, Music, BookOpen, Heart, Globe, Star, Mic2, Baby,
  UserCheck, Briefcase, Home, MessageCircle,
} from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import { publicApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import SectionHero from '../../components/ui/SectionHero';

const ICON_MAP = {
  Users, Music, BookOpen, Heart, Globe, Star, Mic2, Baby,
  UserCheck, Briefcase, Home, MessageCircle,
};

function getIcon(name) {
  return ICON_MAP[name] ?? Users;
}

function MinistryCard({ ministry }) {
  const Icon = getIcon(ministry.icon);
  return (
    <div className="bg-white rounded-xl border border-purple-brand/8 p-6 hover:shadow-md transition-all duration-300 group flex flex-col">
      <div className="w-12 h-12 rounded-xl bg-purple-brand/8 flex items-center justify-center mb-4 group-hover:bg-purple-brand/15 transition-colors">
        <Icon size={22} className="text-purple-brand" />
      </div>
      <h3 className="font-display text-xl text-ink font-light mb-2 group-hover:text-purple-brand transition-colors">
        {ministry.name}
      </h3>
      <p className="text-ink/55 font-body text-sm leading-relaxed mb-4 flex-1">
        {ministry.description}
      </p>

      {(ministry.meetingDay || ministry.meetingTime) && (
        <div className="bg-cream rounded-lg px-3 py-2 mb-4 text-xs font-body text-ink/60">
          {ministry.meetingDay && <span className="font-medium text-ink/80">{ministry.meetingDay}</span>}
          {ministry.meetingDay && ministry.meetingTime && ' · '}
          {ministry.meetingTime}
        </div>
      )}

      <div className="flex items-center gap-2 pt-3 border-t border-purple-brand/8 flex-wrap">
        {ministry.leader && (
          <span className="text-xs font-body text-ink/40">
            Led by <span className="text-ink/70 font-medium">{ministry.leader}</span>
          </span>
        )}
        <div className="ml-auto flex gap-2">
          {ministry.whatsapp && (
            <a
              href={`https://wa.me/${ministry.whatsapp.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-body text-emerald-600 hover:text-emerald-700 transition-colors"
            >
              <FaWhatsapp size={13} /> Join
            </a>
          )}
          {ministry.email && (
            <a
              href={`mailto:${ministry.email}`}
              className="text-xs font-body text-purple-brand hover:underline"
            >
              Contact
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Ministries() {
  const fetchFn = useCallback(() => publicApi.getMinistries(), []);
  const { data: rawData, loading } = useApi(fetchFn);
  const ministries = Array.isArray(rawData) ? rawData : [];

  return (
    <>
      <SEO title="Ministries" description="Get involved at HPC Global. Find your ministry — worship, youth, women, men, prayer, media and more." />
      <SectionHero
        title="Our Ministries"
        subtitle="Find your place to belong, serve, and grow in community."
        breadcrumb="Home / Ministries"
      />

      <section className="section-pad bg-cream">
        <div className="container-page">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1,2,3,4,5,6].map((i) => (
                <div key={i} className="h-56 bg-white rounded-xl animate-pulse" />
              ))}
            </div>
          ) : ministries.length === 0 ? (
            <div className="text-center py-20">
              <Users size={48} className="text-purple-brand/20 mx-auto mb-4" />
              <h3 className="font-display text-2xl text-ink font-light mb-2">Ministries coming soon</h3>
              <p className="text-ink/50 font-body text-sm">We're building something great. Check back soon.</p>
            </div>
          ) : (
            <>
              <div className="text-center max-w-2xl mx-auto mb-12">
                <p className="section-label mb-3">Get Involved</p>
                <h2 className="section-heading mb-4">Find Your Ministry</h2>
                <p className="text-ink/60 font-body text-base leading-relaxed">
                  Every ministry is a place of purpose. Whether you're called to worship, serve children,
                  reach the youth, or pray without ceasing — there's a place for you here.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {ministries.map((m) => (
                  <MinistryCard key={m.id} ministry={m} />
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Vision strip */}
      <section className="section-pad bg-purple-deep">
        <div className="container-page max-w-3xl mx-auto text-center">
          <p className="section-label text-gold mb-3">Together we go further</p>
          <h2 className="section-heading-light mb-6">You Were Made for Community</h2>
          <p className="text-white/60 font-body mb-8 text-base leading-relaxed">
            Our ministries are not just programs — they are families. Each one is a kingdom assignment,
            a place where your gifts are needed and your growth is intentional.
          </p>
          <Link to="/contact" className="btn-secondary">
            Connect With Us
          </Link>
        </div>
      </section>
    </>
  );
}
