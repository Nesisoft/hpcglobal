import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Clock, Mail, Phone } from 'lucide-react';
import { FaYoutube, FaFacebook, FaInstagram, FaWhatsapp } from 'react-icons/fa';
import { publicApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';

const COL_SERVICES = [
  { label: 'Dominion Encounter',       sub: 'Sundays 9 AM GMT' },
  { label: 'Prophetic & Miracle',      sub: 'Fridays 6:30 PM GMT' },
  { label: 'Global Prophetic Highway', sub: 'Sundays 9 PM GMT / 4 PM EST' },
];

const COL_MINISTRY = [
  { label: 'About Us',   to: '/about'      },
  { label: 'Leadership', to: '/leadership' },
  { label: 'Ministries', to: '/ministries' },
  { label: 'Prayer',     to: '/prayer'     },
  { label: 'Gallery',    to: '/gallery'    },
  { label: 'Blog',       to: '/blog'       },
];

const COL_CONNECT = [
  { label: "I'm New Here", to: '/new-here' },
  { label: 'Events',       to: '/events'   },
  { label: 'Give Online',  to: '/give'     },
  { label: 'Contact Us',   to: '/contact'  },
  { label: 'Sermons',      to: '/sermons'  },
];

function SocialIcon({ href, children, title }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:bg-gold hover:text-purple-deep transition-all"
    >
      {children}
    </a>
  );
}

export default function Footer() {
  const fetchFn = useCallback(() => publicApi.getSettings(), []);
  const { data: settings } = useApi(fetchFn);

  const year = new Date().getFullYear();

  const ytHandle = settings?.youtubeHandle || '@prophetclottey';
  const ytUrl    = `https://youtube.com/${ytHandle.startsWith('@') ? ytHandle : '@' + ytHandle}`;
  const fbUrl    = settings?.facebookUrl   || null;
  const igUrl    = settings?.instagramUrl  || null;
  const waNum    = settings?.whatsapp      || null;
  const waUrl    = waNum ? `https://wa.me/${waNum.replace(/\D/g, '')}` : null;

  const phone   = settings?.phone   || null;
  const email   = settings?.email   || null;
  const address = settings?.address || 'Klagon Junction, Behind K. Ofori Enterprise, Accra, Ghana';

  return (
    <footer className="bg-purple-deep border-t border-white/10">
      <div className="container-page py-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">

          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-full bg-gold flex items-center justify-center text-purple-deep font-display font-semibold text-sm">H</div>
              <div>
                <div className="font-display text-white font-semibold">HPC Global</div>
                <div className="text-white/40 text-[10px] tracking-widest uppercase font-body">Hopepress Chapel</div>
              </div>
            </div>
            <p className="text-white/50 text-sm leading-relaxed mb-5 font-body">
              An Apostolic Prophetic Word-based ministry bringing hope to the hopeless and raising Kingdom leaders worldwide.
            </p>
            <div className="flex items-center gap-3">
              <SocialIcon href={ytUrl} title="YouTube">
                <FaYoutube size={14} />
              </SocialIcon>
              <SocialIcon href={fbUrl} title="Facebook">
                <FaFacebook size={14} />
              </SocialIcon>
              <SocialIcon href={igUrl} title="Instagram">
                <FaInstagram size={14} />
              </SocialIcon>
              <SocialIcon href={waUrl} title="WhatsApp">
                <FaWhatsapp size={14} />
              </SocialIcon>
            </div>
          </div>

          {/* Services */}
          <div>
            <h4 className="section-label mb-5">Services</h4>
            <ul className="space-y-4">
              {COL_SERVICES.map((s) => (
                <li key={s.label} className="flex items-start gap-2">
                  <Clock size={13} className="text-gold mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-white/80 text-sm font-body">{s.label}</div>
                    <div className="text-white/40 text-xs font-body">{s.sub}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Ministry */}
          <div>
            <h4 className="section-label mb-5">Ministry</h4>
            <ul className="space-y-2.5">
              {COL_MINISTRY.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="text-white/60 hover:text-gold text-sm font-body transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Connect */}
          <div>
            <h4 className="section-label mb-5">Connect</h4>
            <ul className="space-y-2.5 mb-6">
              {COL_CONNECT.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="text-white/60 hover:text-gold text-sm font-body transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="space-y-2 border-t border-white/10 pt-4">
              <div className="flex items-start gap-2 text-white/50 text-xs font-body">
                <MapPin size={12} className="mt-0.5 flex-shrink-0 text-gold" />
                <span>{address}</span>
              </div>
              {email && (
                <div className="flex items-center gap-2 text-white/50 text-xs font-body">
                  <Mail size={12} className="text-gold flex-shrink-0" />
                  <a href={`mailto:${email}`} className="hover:text-gold transition-colors">{email}</a>
                </div>
              )}
              {phone && (
                <div className="flex items-center gap-2 text-white/50 text-xs font-body">
                  <Phone size={12} className="text-gold flex-shrink-0" />
                  <a href={`tel:${phone}`} className="hover:text-gold transition-colors">{phone}</a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-page flex flex-col sm:flex-row items-center justify-between py-4 gap-2">
          <p className="text-white/30 text-xs font-body">
            © {year} HPC Global — Hopepress Chapel. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <Link to="/contact" className="text-white/30 hover:text-white/60 text-xs font-body transition-colors">Privacy Policy</Link>
            <Link to="/admin/login" className="text-white/20 hover:text-white/40 text-xs font-body transition-colors">Admin</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
