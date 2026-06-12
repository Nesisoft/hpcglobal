import { useState, useEffect, useCallback } from 'react';
import { Save, Plus, Trash2 } from 'lucide-react';
import { adminApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import FormField from '../../components/admin/FormField';

const TABS = [
  { id: 'church',   label: 'Church Info'      },
  { id: 'contact',  label: 'Contact & Social' },
  { id: 'giving',   label: 'Giving Accounts'  },
  { id: 'ticker',   label: 'Ticker Messages'  },
  { id: 'partner',  label: 'Partner Settings' },
];

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-purple-brand/8 p-5">
      <h3 className="font-display text-base text-ink font-light mb-4">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export default function AdminSettings() {
  const fetchFn = useCallback(() => adminApi.getSettings(), []);
  const { data, loading } = useApi(fetchFn);

  const [tab, setTab]     = useState('church');
  const [form, setForm]   = useState({});
  const [ticker, setTicker] = useState([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!data) return;
    setForm({
      churchName:       data.churchName       ?? '',
      tagline:          data.tagline          ?? '',
      phone:            data.phone            ?? '',
      email:            data.email            ?? '',
      whatsapp:         data.whatsapp         ?? '',
      address:          data.address          ?? '',
      mapsLat:          data.mapsLat          ?? '',
      mapsLng:          data.mapsLng          ?? '',
      zoomLink:         data.zoomLink         ?? '',
      youtubeHandle:    data.youtubeHandle    ?? '',
      facebookUrl:      data.facebookUrl      ?? '',
      instagramUrl:     data.instagramUrl     ?? '',
      mtnMomoNumber:    data.mtnMomoNumber    ?? '',
      telecelNumber:    data.telecelNumber    ?? '',
      airteltigo:       data.airteltigo       ?? '',
      bankName:         data.bankName         ?? '',
      bankAccount:      data.bankAccount      ?? '',
      bankBranch:       data.bankBranch       ?? '',
      bankSwift:        data.bankSwift        ?? '',
      bankCode:         data.bankCode         ?? '',
      partnerMinAmount: data.partnerMinAmount ?? '',
      paystackPublicKey: data.paystackPublicKey ?? '',
      ministryVideoId:   data.ministryVideoId   ?? '',
      zelleAccount:      data.zelleAccount      ?? '',
    });
    try {
      const parsed = JSON.parse(data.tickerMessages ?? '[]');
      setTicker(Array.isArray(parsed) ? parsed : []);
    } catch { setTicker([]); }
  }, [data]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSave() {
    setSaving(true);
    setStatus('');
    try {
      await adminApi.updateSettings({
        ...form,
        mapsLat: form.mapsLat ? Number(form.mapsLat) : undefined,
        mapsLng: form.mapsLng ? Number(form.mapsLng) : undefined,
        partnerMinAmount: form.partnerMinAmount ? Number(form.partnerMinAmount) : 0,
        tickerMessages: JSON.stringify(ticker.filter(Boolean)),
      });
      setStatus('Settings saved.');
      setTimeout(() => setStatus(''), 2500);
    } catch (e) {
      setStatus(e.response?.data?.message ?? 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout title="Settings">
      <AdminPageHeader
        title="Site Settings"
        subtitle="SUPER_ADMIN only · changes take effect immediately"
        action={{ label: saving ? 'Saving…' : 'Save Settings', icon: Save, onClick: handleSave }}
      />

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-white rounded-xl border border-purple-brand/8 p-1.5 mb-5 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-body whitespace-nowrap transition-colors ${
              tab === t.id
                ? 'bg-purple-brand text-white'
                : 'text-ink/55 hover:text-ink hover:bg-purple-brand/5'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-purple-brand/8 h-64 animate-pulse" />
      ) : (
        <div className="space-y-5">
          {/* ── Church Info ── */}
          {tab === 'church' && (
            <Section title="Church Identity">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Church Name">
                  <input className="input" value={form.churchName ?? ''} onChange={set('churchName')} />
                </FormField>
                <FormField label="Tagline">
                  <input className="input" value={form.tagline ?? ''} onChange={set('tagline')} />
                </FormField>
              </div>
              <FormField label="Physical Address">
                <textarea className="input min-h-[70px] resize-y" value={form.address ?? ''} onChange={set('address')} />
              </FormField>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Maps Latitude" hint="e.g. 5.6656744">
                  <input type="number" step="any" className="input" value={form.mapsLat ?? ''} onChange={set('mapsLat')} />
                </FormField>
                <FormField label="Maps Longitude" hint="e.g. -0.0471646">
                  <input type="number" step="any" className="input" value={form.mapsLng ?? ''} onChange={set('mapsLng')} />
                </FormField>
              </div>
            </Section>
          )}

          {/* ── Contact & Social ── */}
          {tab === 'contact' && (
            <>
              <Section title="Contact Details">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label="Phone">
                    <input className="input" placeholder="+233..." value={form.phone ?? ''} onChange={set('phone')} />
                  </FormField>
                  <FormField label="WhatsApp Number">
                    <input className="input" placeholder="+233..." value={form.whatsapp ?? ''} onChange={set('whatsapp')} />
                  </FormField>
                  <FormField label="Email" hint="Public contact email">
                    <input type="email" className="input" value={form.email ?? ''} onChange={set('email')} />
                  </FormField>
                  <FormField label="Zoom Link" hint="Global Prophetic Highway">
                    <input className="input" placeholder="https://zoom.us/j/..." value={form.zoomLink ?? ''} onChange={set('zoomLink')} />
                  </FormField>
                </div>
              </Section>
              <Section title="Social Media">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label="YouTube Handle" hint="e.g. @prophetclottey">
                    <input className="input" placeholder="@handle" value={form.youtubeHandle ?? ''} onChange={set('youtubeHandle')} />
                  </FormField>
                  <FormField label="Facebook URL">
                    <input className="input" placeholder="https://facebook.com/..." value={form.facebookUrl ?? ''} onChange={set('facebookUrl')} />
                  </FormField>
                  <FormField label="Instagram URL">
                    <input className="input" placeholder="https://instagram.com/..." value={form.instagramUrl ?? ''} onChange={set('instagramUrl')} />
                  </FormField>
                </div>
              </Section>
            </>
          )}

          {/* ── Giving Accounts ── */}
          {tab === 'giving' && (
            <>
              <Section title="Mobile Money">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField label="MTN MoMo Number">
                    <input className="input" placeholder="024..." value={form.mtnMomoNumber ?? ''} onChange={set('mtnMomoNumber')} />
                  </FormField>
                  <FormField label="Telecel Number">
                    <input className="input" placeholder="050..." value={form.telecelNumber ?? ''} onChange={set('telecelNumber')} />
                  </FormField>
                  <FormField label="AirtelTigo Number">
                    <input className="input" placeholder="027..." value={form.airteltigo ?? ''} onChange={set('airteltigo')} />
                  </FormField>
                </div>
              </Section>
              <Section title="Bank Transfer">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField label="Bank Name">
                    <input className="input" value={form.bankName ?? ''} onChange={set('bankName')} />
                  </FormField>
                  <FormField label="Account Number">
                    <input className="input" value={form.bankAccount ?? ''} onChange={set('bankAccount')} />
                  </FormField>
                  <FormField label="Branch">
                    <input className="input" value={form.bankBranch ?? ''} onChange={set('bankBranch')} />
                  </FormField>
                  <FormField label="SWIFT Code" hint="For international transfers">
                    <input className="input" value={form.bankSwift ?? ''} onChange={set('bankSwift')} />
                  </FormField>
                  <FormField label="Bank Code" hint="Sort / branch code">
                    <input className="input" value={form.bankCode ?? ''} onChange={set('bankCode')} />
                  </FormField>
                </div>
              </Section>
              <Section title="Online Payments (Paystack)">
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-amber-800 text-xs font-body mb-3">
                  The Paystack <strong>secret key</strong> is stored securely in the server environment and cannot be edited here.
                  Only the public key is stored in the database.
                </div>
                <FormField label="Paystack Public Key" hint="pk_live_... or pk_test_...">
                  <input className="input" value={form.paystackPublicKey ?? ''} onChange={set('paystackPublicKey')} />
                </FormField>
              </Section>
            </>
          )}

          {/* ── Partner Settings ── */}
          {tab === 'partner' && (
            <>
              <Section title="Ministry Project Video">
                <p className="text-ink/50 text-xs font-body -mt-2">
                  Shown in the "Support The Ministry" section on the homepage. Paste only the YouTube video ID (e.g. <code className="bg-ink/5 px-1 rounded">dQw4w9WgXcQ</code> from youtube.com/watch?v=<strong>dQw4w9WgXcQ</strong>). Works with unlisted videos.
                </p>
                <FormField label="YouTube Video ID" hint="Leave blank to hide the video section">
                  <input className="input" placeholder="e.g. dQw4w9WgXcQ" value={form.ministryVideoId ?? ''} onChange={set('ministryVideoId')} />
                </FormField>
              </Section>
              <Section title="Minimum Commitment">
                <p className="text-ink/50 text-xs font-body -mt-2">
                  The lowest amount a partner is allowed to commit to give. Partners cannot set a commitment below this. Set to 0 to allow any amount.
                </p>
                <FormField label="Minimum Partner Amount (GHS)" hint="e.g. 100">
                  <input
                    type="number" min="0" step="1"
                    className="input"
                    placeholder="0"
                    value={form.partnerMinAmount ?? ''}
                    onChange={set('partnerMinAmount')}
                  />
                </FormField>
              </Section>
              <Section title="Zelle (International Partners)">
                <p className="text-ink/50 text-xs font-body -mt-2">
                  Shown in the partner portal for partners with non-GHS currencies (diaspora). Enter the email or phone registered on your Zelle account.
                </p>
                <FormField label="Zelle Account" hint="e.g. giving@hpcglobal.org or +1 xxx-xxx-xxxx">
                  <input className="input" placeholder="giving@hpcglobal.org" value={form.zelleAccount ?? ''} onChange={set('zelleAccount')} />
                </FormField>
              </Section>
            </>
          )}

          {/* ── Ticker Messages ── */}
          {tab === 'ticker' && (
            <Section title="Homepage Ticker / Announcement Banner">
              <p className="text-ink/50 text-xs font-body -mt-2">
                These messages scroll across the top of the homepage. Leave empty to hide the ticker.
              </p>
              <div className="space-y-2">
                {ticker.map((msg, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      className="input flex-1 text-sm"
                      placeholder="Ticker message…"
                      value={msg}
                      onChange={(e) => {
                        const next = [...ticker];
                        next[i] = e.target.value;
                        setTicker(next);
                      }}
                    />
                    <button
                      onClick={() => setTicker(ticker.filter((_, j) => j !== i))}
                      className="p-2 text-ink/30 hover:text-red-500 rounded transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setTicker([...ticker, ''])}
                className="flex items-center gap-1.5 text-xs text-purple-brand hover:bg-purple-brand/5 px-3 py-2 rounded transition-colors mt-1"
              >
                <Plus size={13} /> Add message
              </button>
            </Section>
          )}

          {status && (
            <div className={`rounded-xl border px-4 py-3 text-sm font-body ${
              status.includes('failed') || status.includes('Failed')
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-white border-purple-brand/8 text-purple-brand'
            }`}>
              {status}
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
