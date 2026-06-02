import { useState, useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Video, BookOpen, CreditCard, LogOut, Calendar, Clock, ExternalLink, Smartphone, Building2, ChevronDown, ChevronUp } from 'lucide-react';
import { usePartnerAuth } from '../../context/PartnerAuthContext';
import { useApi } from '../../hooks/useApi';
import { publicApi } from '../../services/api';
import api from '../../services/api';
import RichContent from '../../components/ui/RichContent';

const METHODS = [
  { value: 'MTN_MOMO',      label: 'MTN MoMo',      Icon: Smartphone },
  { value: 'TELECEL',       label: 'Telecel Cash',   Icon: Smartphone },
  { value: 'AIRTELTIGO',    label: 'AirtelTigo',     Icon: Smartphone },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer',  Icon: Building2  },
  { value: 'CARD',          label: 'Card',           Icon: CreditCard },
];

const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtTime = (d) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });

function ZoomCard({ schedule }) {
  const isPast = new Date(schedule.scheduledAt) < new Date();
  return (
    <div className={`rounded-xl border p-4 ${isPast ? 'border-ink/10 opacity-60' : 'border-purple-brand/20 bg-purple-brand/3'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-display text-base text-ink font-light leading-snug">{schedule.title}</p>
          <div className="flex items-center gap-3 mt-1.5 text-xs font-body text-ink/55">
            <span className="flex items-center gap-1"><Calendar size={11} /> {fmtDate(schedule.scheduledAt)}</span>
            <span className="flex items-center gap-1"><Clock size={11} /> {fmtTime(schedule.scheduledAt)}</span>
          </div>
          {schedule.description && (
            <p className="text-ink/60 text-xs font-body mt-2 leading-relaxed">{schedule.description}</p>
          )}
        </div>
        {!isPast && (
          <a
            href={schedule.zoomLink}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary text-xs px-3 py-2 flex-shrink-0"
          >
            <Video size={12} /> Join
          </a>
        )}
      </div>
    </div>
  );
}

function PaySection({ partner, settings }) {
  const isGhs    = partner.currency === 'GHS';
  const [method, setMethod]   = useState('MTN_MOMO');
  const [paying, setPaying]   = useState(false);
  const [bankDetails, setBankDetails] = useState(null);
  const [expanded, setExpanded] = useState(false);

  async function handlePay() {
    setPaying(true);
    try {
      const res = await publicApi.initiateGiving({
        name:     `${partner.firstName} ${partner.lastName}`,
        phone:    partner.phone || '000',
        email:    partner.email,
        amount:   partner.monthlyAmount,
        category: 'PASTORAL',
        method,
      });
      if (res.data.url) {
        window.location.href = res.data.url;
      } else if (res.data.bankDetails) {
        setBankDetails(res.data.bankDetails);
      }
    } catch {
      alert('Payment initiation failed. Please try again.');
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-purple-brand/10 overflow-hidden">
      <button
        onClick={() => setExpanded((x) => !x)}
        className="w-full flex items-center justify-between px-6 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gold/15 flex items-center justify-center">
            <CreditCard size={16} className="text-gold" />
          </div>
          <div>
            <p className="font-body font-semibold text-ink/90 text-sm">Make Monthly Payment</p>
            <p className="text-ink/45 text-xs font-body">
              Your commitment: {partner.currency} {Number(partner.monthlyAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })} / month
            </p>
          </div>
        </div>
        {expanded ? <ChevronUp size={16} className="text-ink/30" /> : <ChevronDown size={16} className="text-ink/30" />}
      </button>

      {expanded && (
        <div className="px-6 pb-6 border-t border-purple-brand/8 pt-5 space-y-4">
          {isGhs ? (
            bankDetails ? (
              <div className="rounded-xl bg-cream/60 border border-purple-brand/15 p-4 text-sm font-body space-y-1">
                <p className="font-semibold text-ink/80 mb-2">Bank Transfer Details</p>
                {Object.entries(bankDetails).map(([k, v]) => (
                  <p key={k} className="text-ink/70"><span className="text-ink/45">{k}:</span> {v}</p>
                ))}
              </div>
            ) : (
              <>
                <div>
                  <p className="text-xs font-body text-ink/55 mb-2">Select payment method</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {METHODS.map(({ value, label, Icon }) => (
                      <button
                        key={value}
                        onClick={() => setMethod(value)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-body transition-colors ${
                          method === value
                            ? 'border-purple-brand bg-purple-brand/8 text-purple-brand'
                            : 'border-purple-brand/15 text-ink/60 hover:border-purple-brand/30'
                        }`}
                      >
                        <Icon size={13} /> {label}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={handlePay}
                  disabled={paying}
                  className="btn-primary w-full justify-center py-3 disabled:opacity-60"
                >
                  {paying ? 'Processing…' : `Pay ${partner.currency} ${Number(partner.monthlyAmount).toLocaleString()} via ${METHODS.find((m) => m.value === method)?.label}`}
                </button>
              </>
            )
          ) : (
            <div className="rounded-xl bg-cream/60 border border-purple-brand/15 p-5 text-sm font-body">
              <div className="flex items-center gap-3 mb-3">
                <img
                  src="https://upload.wikimedia.org/wikipedia/commons/6/60/Zelle_logo.svg"
                  alt="Zelle"
                  className="h-6 object-contain"
                />
                <p className="font-semibold text-ink/80">Pay via Zelle</p>
              </div>
              {settings?.zelleAccount ? (
                <p className="text-ink/70">Send your monthly commitment to: <strong>{settings.zelleAccount}</strong></p>
              ) : (
                <p className="text-ink/55">Please contact the office for Zelle payment details.</p>
              )}
              <p className="text-ink/45 text-xs mt-2">Use your name and "Partner" as the payment note.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PartnerPortal() {
  const { partner, logout, isAuthenticated, loading: authLoading, getToken } = usePartnerAuth();
  const navigate = useNavigate();

  const zoomFn = useCallback(() => {
    return api.get('/partner/zoom-schedules', { headers: { Authorization: `Bearer ${getToken()}` } }).then((r) => r.data);
  }, [getToken]);

  const msgFn = useCallback(() => {
    return api.get('/partner/messages', { headers: { Authorization: `Bearer ${getToken()}` } }).then((r) => r.data);
  }, [getToken]);

  const settingsFn = useCallback(() => publicApi.getSettings(), []);

  const { data: zoomSchedules = [] } = useApi(zoomFn);
  const { data: messages = [] }      = useApi(msgFn);
  const { data: settings }           = useApi(settingsFn);

  const [openMsg, setOpenMsg] = useState(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate('/partner/login');
  }, [authLoading, isAuthenticated, navigate]);

  if (authLoading || !partner) {
    return <div className="min-h-screen bg-[#F4F2F9] flex items-center justify-center"><div className="w-8 h-8 border-2 border-purple-brand/30 border-t-purple-brand rounded-full animate-spin" /></div>;
  }

  function handleLogout() {
    logout();
    navigate('/partner/login');
  }

  const upcoming = zoomSchedules.filter((s) => new Date(s.scheduledAt) >= new Date());
  const past     = zoomSchedules.filter((s) => new Date(s.scheduledAt) < new Date());

  return (
    <div className="min-h-screen bg-[#F4F2F9]">
      {/* Header */}
      <header className="bg-purple-deep text-white px-6 py-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gold flex items-center justify-center text-purple-deep font-display font-semibold text-sm">
            {partner.firstName?.[0]}
          </div>
          <div>
            <p className="font-body font-semibold text-sm">{partner.firstName} {partner.lastName}</p>
            <p className="text-white/40 text-xs font-body">HPC Global Partner</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/" className="text-white/40 hover:text-white text-xs font-body flex items-center gap-1 transition-colors">
            <ExternalLink size={12} /> Visit Site
          </Link>
          <button
            onClick={handleLogout}
            className="text-white/40 hover:text-red-400 text-xs font-body flex items-center gap-1.5 transition-colors"
          >
            <LogOut size={13} /> Logout
          </button>
        </div>
      </header>

      <main className="container-page max-w-4xl py-8 space-y-6">
        {/* Welcome card */}
        <div className="bg-gradient-to-r from-purple-deep to-purple-brand rounded-2xl p-6 text-white">
          <p className="text-white/60 font-body text-sm mb-1">Welcome back,</p>
          <h1 className="font-display text-2xl font-light mb-3">{partner.firstName} {partner.lastName}</h1>
          <div className="flex flex-wrap gap-4 text-xs font-body">
            <span className="bg-white/15 px-3 py-1.5 rounded-full">
              Monthly Commitment: {partner.currency} {Number(partner.monthlyAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
            <span className="bg-white/15 px-3 py-1.5 rounded-full">
              Status: Active Partner
            </span>
          </div>
        </div>

        {/* Zoom Meetings */}
        <div className="bg-white rounded-2xl border border-purple-brand/10 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-full bg-purple-brand/10 flex items-center justify-center">
              <Video size={16} className="text-purple-brand" />
            </div>
            <div>
              <h2 className="font-display text-lg text-ink font-light">Zoom Meetings</h2>
              <p className="text-ink/45 text-xs font-body">Exclusive sessions with the prophet</p>
            </div>
          </div>
          {upcoming.length === 0 && past.length === 0 ? (
            <div className="text-center py-8 text-ink/30">
              <Video size={28} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm font-body">No meetings scheduled at this time.</p>
              <p className="text-xs mt-1">Check back soon for upcoming sessions.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {upcoming.map((s) => <ZoomCard key={s.id} schedule={s} />)}
              {past.length > 0 && (
                <div className="pt-2">
                  <p className="text-xs font-body text-ink/35 uppercase tracking-wider mb-2">Past Meetings</p>
                  {past.slice(0, 3).map((s) => <ZoomCard key={s.id} schedule={s} />)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Messages from the Prophet */}
        <div className="bg-white rounded-2xl border border-purple-brand/10 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-full bg-gold/15 flex items-center justify-center">
              <BookOpen size={16} className="text-gold" />
            </div>
            <div>
              <h2 className="font-display text-lg text-ink font-light">Messages & Instructions</h2>
              <p className="text-ink/45 text-xs font-body">Spiritual guidance from the prophet</p>
            </div>
          </div>
          {messages.length === 0 ? (
            <div className="text-center py-8 text-ink/30">
              <BookOpen size={28} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm font-body">No messages yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => (
                <div key={msg.id} className="border border-purple-brand/10 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setOpenMsg(openMsg === msg.id ? null : msg.id)}
                    className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-purple-brand/3 transition-colors"
                  >
                    <div>
                      <p className="font-body font-medium text-ink/90 text-sm">{msg.title}</p>
                      <p className="text-ink/40 text-[11px] font-body mt-0.5">
                        {new Date(msg.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                    {openMsg === msg.id ? <ChevronUp size={14} className="text-ink/30 flex-shrink-0" /> : <ChevronDown size={14} className="text-ink/30 flex-shrink-0" />}
                  </button>
                  {openMsg === msg.id && (
                    <div className="px-4 pb-5 border-t border-purple-brand/8 pt-4">
                      <RichContent html={msg.body} className="prose-sm text-ink/80" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Payment */}
        <PaySection partner={partner} settings={settings} />
      </main>
    </div>
  );
}
