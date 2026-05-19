import { useCallback } from 'react';
import { useApi } from '../../hooks/useApi';
import { publicApi } from '../../services/api';
import SectionHero from '../../components/ui/SectionHero';
import SEO from '../../components/ui/SEO';
import Spinner from '../../components/ui/Spinner';
import { Link } from 'react-router-dom';
import { FaYoutube, FaFacebook, FaInstagram, FaWhatsapp } from 'react-icons/fa';
import { MessageCircle, Send } from 'lucide-react';

function ProfileCard({ profile, featured }) {
  return (
    <div className={`bg-white rounded-xl overflow-hidden border border-purple-brand/10 ${featured ? 'md:col-span-1' : ''}`}>
      <div className="aspect-[3/4] bg-purple-deep/10 relative overflow-hidden">
        {profile.photo ? (
          <img src={profile.photo} alt={profile.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-deep to-purple-brand">
            <span className="font-display text-white text-6xl font-light">{profile.name[0]}</span>
          </div>
        )}
      </div>
      <div className="p-6">
        <p className="section-label mb-1">{profile.title}</p>
        <h3 className="font-display text-xl text-ink mb-1">{profile.name}</h3>
        <p className="text-ink/50 font-body text-xs mb-4">{profile.role}</p>
        {profile.bio && <p className="text-ink/70 font-body text-sm leading-relaxed mb-4 line-clamp-4">{profile.bio}</p>}
        {profile.quote && (
          <p className="font-display italic text-purple-brand text-sm border-l-2 border-gold pl-3 mb-4">"{profile.quote}"</p>
        )}
        {profile.scripture && (
          <p className="text-gold font-body text-xs mb-4">{profile.scripture}</p>
        )}
        <div className="flex gap-2">
          {profile.youtubeUrl   && <a href={profile.youtubeUrl}   target="_blank" rel="noopener noreferrer" className="text-red-600 hover:text-red-700 transition-colors"><FaYoutube size={16} /></a>}
          {profile.facebookUrl  && <a href={profile.facebookUrl}  target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 transition-colors"><FaFacebook size={16} /></a>}
          {profile.instagramUrl && <a href={profile.instagramUrl} target="_blank" rel="noopener noreferrer" className="text-pink-500 hover:text-pink-600 transition-colors"><FaInstagram size={16} /></a>}
        </div>
      </div>
    </div>
  );
}

export default function Leadership() {
  const fetchLeaders = useCallback(() => publicApi.getLeadership(), []);
  const fetchSettings = useCallback(() => publicApi.getSettings(), []);
  const { data, loading } = useApi(fetchLeaders);
  const { data: settings } = useApi(fetchSettings);
  const profiles = data || [];

  const waNum = settings?.whatsapp || null;
  const waUrl = waNum ? `https://wa.me/${waNum.replace(/\D/g, '')}` : null;
  const seniors  = profiles.filter((p) => p.isSenior);
  const team     = profiles.filter((p) => !p.isSenior);

  return (
    <>
      <SEO title="Leadership" description="Meet the pastoral team and leadership of HPC Global — Hopepress Chapel, Accra, Ghana." />
      <SectionHero title="Leadership" subtitle="People who are passionate about seeing you flourish." breadcrumb="Home / Leadership" />
      <section className="section-pad bg-cream">
        <div className="container-page">
          {loading ? <Spinner /> : (
            <>
              {seniors.length > 0 && (
                <>
                  <div className="text-center mb-10"><p className="section-label mb-2">Senior Pastors</p><h2 className="section-heading">The Clottey Family</h2></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto mb-16">
                    {seniors.map((p) => <ProfileCard key={p.id} profile={p} featured />)}
                  </div>
                </>
              )}
              {team.length > 0 && (
                <>
                  <div className="text-center mb-10"><p className="section-label mb-2">Ministry Team</p><h2 className="section-heading">Our Leaders</h2></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {team.map((p) => <ProfileCard key={p.id} profile={p} />)}
                  </div>
                </>
              )}
              <div className="mt-14 text-center bg-purple-deep rounded-xl p-10">
                <MessageCircle size={32} className="text-gold mx-auto mb-4" />
                <h3 className="font-display text-white text-2xl mb-3">Would you like prayer or a pastoral word?</h3>
                <p className="text-white/60 font-body text-sm mb-6">Our pastoral team is here for you.</p>
                <div className="flex justify-center gap-4 flex-wrap">
                  <Link to="/prayer" className="btn-primary"><Send size={14} /> Submit a Prayer Request</Link>
                  {waUrl && (
                    <a href={waUrl} target="_blank" rel="noopener noreferrer" className="btn-outline border-white/30 text-white hover:bg-white/10">
                      <FaWhatsapp size={14} /> WhatsApp Us
                    </a>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}
