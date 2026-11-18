import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Pencil, Archive, RotateCcw, MapPin, MapPinOff, Clock, CalendarDays, LocateFixed, ExternalLink } from 'lucide-react';
import AppShell from '../../components/AppShell';
import { Alert, Empty, Field, Modal, PageHeader, Pill, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { getPosition, LocationError, locationProblem } from '../../lib/geo';
import { useForm } from '../../lib/useForm';
import { formatClock, formatDay, SERVICE_KIND_LABEL, WEEKDAYS } from '../../lib/format';

/** "Every Sunday", "Every day, Mon 1 Dec – Fri 5 Dec", "Sat 20 Dec 2026". */
export function describeSchedule(s) {
  if (s.recurrence === 'WEEKLY') {
    const day = WEEKDAYS[s.weekday] ?? 'week';
    const from = s.startsOn ? ` from ${formatDay(s.startsOn, { short: true })}` : '';
    const until = s.endsOn ? ` until ${formatDay(s.endsOn, { short: true })}` : '';
    return `Every ${day}${from}${until}`;
  }
  if (s.recurrence === 'DAILY') {
    return `Every day, ${formatDay(s.startsOn, { short: true })} – ${formatDay(s.endsOn, { short: true, year: true })}`;
  }
  return formatDay(s.startsOn, { year: true });
}

/** The services workers clock in to, and where and when each one is. */
export default function Services() {
  const [services, setServices] = useState(null);
  // Only shown in the hint: a new service left empty gets the server's own default.
  const [defaultRadius, setDefaultRadius] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);    // a service, or {} for a new one
  const [archiving, setArchiving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const requests = useRef(0);
  const load = useCallback(async () => {
    const n = ++requests.current;
    try {
      const res = await api.get('/admin/services');
      if (n === requests.current) { setServices(res.services); setError(''); }
    } catch (err) {
      if (n === requests.current) setError(err.message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  // The usual distance from Settings, to say what an empty box means.
  useEffect(() => {
    api.get('/admin/settings').then((r) => { if (r.settings?.defaultRadiusM) setDefaultRadius(r.settings.defaultRadiusM); }).catch(() => {});
  }, []);

  async function setActive(s, active) {
    setBusy(true); setError('');
    try {
      await api.patch(`/admin/services/${s.id}`, { active });
      setArchiving(null);
      await load();
    } catch (err) { setError(err.message); setArchiving(null); } finally { setBusy(false); }
  }

  const list = (services || []).filter((s) => showArchived || s.active);
  const archivedCount = (services || []).filter((s) => !s.active).length;

  return (
    <AppShell title="Services">
      <PageHeader title="Services" subtitle="When and where workers clock in. Dates are made from these for the weeks ahead.">
        <button type="button" className="btn-primary px-4 py-2.5" onClick={() => setEditing({})}><Plus size={15} /> Add service</button>
      </PageHeader>
      <div className="mb-4"><Alert>{error}</Alert></div>

      {!services ? (
        !error && <div className="py-16 flex justify-center text-purple-brand"><Spinner size={22} /></div>
      ) : list.length === 0 ? (
        <Empty>{services.length ? 'Every service is archived.' : 'No services yet. Add your Sunday service to get started.'}</Empty>
      ) : (
        <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map((s) => (
            <li key={s.id} className={`card p-5 flex flex-col ${s.active ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-2xl text-ink leading-tight min-w-0 break-words">{s.name}</h2>
                {s.active
                  ? <Pill>{SERVICE_KIND_LABEL[s.kind] ?? s.kind}</Pill>
                  : <span className="text-[11px] font-body text-ink/45 uppercase tracking-wider pt-1.5">Archived</span>}
              </div>
              <div className="mt-3 text-sm font-body text-ink/65 space-y-1.5 flex-1">
                <p className="flex items-start gap-2"><CalendarDays size={14} className="mt-0.5 flex-shrink-0 text-ink/35" aria-hidden="true" />{describeSchedule(s)}</p>
                <p className="flex items-start gap-2"><Clock size={14} className="mt-0.5 flex-shrink-0 text-ink/35" aria-hidden="true" />{formatClock(s.startTime)} – {formatClock(s.endTime)}</p>
                {s.hasLocation ? (
                  <p className="flex items-start gap-2 min-w-0">
                    <MapPin size={14} className="mt-0.5 flex-shrink-0 text-ink/35" aria-hidden="true" />
                    <span className="min-w-0 break-words">{s.venueName || 'Venue set'} <span className="text-ink/40">· within {s.radiusM} m</span></span>
                  </p>
                ) : (
                  <p className="flex items-start gap-2 rounded bg-gold/10 border border-gold/25 text-[#8a6d1f] px-2.5 py-2 text-[13px]">
                    <MapPinOff size={14} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
                    <span>{s.venueName ? `${s.venueName} — ` : ''}Set the venue so workers can clock in by GPS. Until then they use the QR code.</span>
                  </p>
                )}
                {!s.expected && <p className="text-ink/45 text-xs">Doesn’t count towards attendance</p>}
              </div>
              <div className="flex gap-2 mt-4">
                <button type="button" className="btn-outline px-3 py-2 text-xs" onClick={() => setEditing(s)}><Pencil size={13} /> Edit</button>
                {s.active
                  ? <button type="button" className="btn-outline px-3 py-2 text-xs" onClick={() => setArchiving(s)}><Archive size={13} /> Archive</button>
                  : <button type="button" className="btn-outline px-3 py-2 text-xs" disabled={busy} onClick={() => setActive(s, true)}><RotateCcw size={13} /> Restore</button>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {archivedCount > 0 && (
        <button type="button" className="btn-ghost mt-5" onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? 'Hide archived services' : `Show ${archivedCount} archived`}
        </button>
      )}

      {editing && (
        <ServiceDialog service={editing} defaultRadius={defaultRadius} onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }} />
      )}
      {archiving && (
        <Modal title={`Archive ${archiving.name}?`} onClose={() => setArchiving(null)} busy={busy}
          footer={<>
            <button type="button" className="btn-outline" onClick={() => setArchiving(null)} disabled={busy}>Cancel</button>
            <button type="button" className="btn-danger" onClick={() => setActive(archiving, false)} disabled={busy}>{busy ? <Spinner size={15} /> : 'Archive'}</button>
          </>}>
          <p className="text-sm font-body text-ink/65">
            Its coming dates are taken off the calendar, so nobody can clock in to them. Attendance already recorded is kept, and you can restore the service later.
          </p>
        </Modal>
      )}
    </AppShell>
  );
}

const RECURRENCE = [
  { value: 'WEEKLY', label: 'Every week' },
  { value: 'DAILY', label: 'Every day between dates' },
  { value: 'NONE', label: 'One date only' },
];

// Some phones type a decimal comma ("5,603717"); it means a point.
const decimal = (text) => String(text).trim().replace(',', '.');
const coordinate = (text) => (String(text).trim() === '' ? null : Number(decimal(text)));

// "5.603717, -0.186964", as Google Maps copies a place.
const PAIR = /^\s*(-?\d+(?:[.,]\d+)?)\s*,\s*(-?\d+(?:[.,]\d+)?)\s*$/;

/**
 * Latitude and longitude from text holding both, or null. A lone "5,603717"
 * is one number with a decimal comma, so a comma only splits a pair when the
 * text has another separator, or a space or minus after the comma.
 */
function coordinatePair(text) {
  const m = PAIR.exec(text);
  if (!m) return null;
  if ((text.match(/[.,]/g) || []).length < 2 && !/,[\s-]/.test(text)) return null;
  return [decimal(m[1]), decimal(m[2])];
}

function ServiceDialog({ service, defaultRadius, onClose, onSaved }) {
  const isNew = !service.id;
  // As the boxes hold them: numbers as text, nothing as ''.
  const initial = {
    name: service.name ?? '',
    kind: service.kind ?? 'REGULAR',
    venueName: service.venueName ?? '',
    latitude: service.latitude ?? '',
    longitude: service.longitude ?? '',
    radiusM: service.radiusM ?? '',
    recurrence: service.recurrence ?? 'WEEKLY',
    weekday: service.weekday ?? 0,
    startTime: service.startTime ?? '07:00',
    endTime: service.endTime ?? '09:30',
    startsOn: service.startsOn ?? '',
    endsOn: service.endsOn ?? '',
    expected: service.expected ?? true,
  };
  const form = useForm(Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, typeof v === 'number' ? String(v) : v])));
  const [locating, setLocating] = useState(false);
  const [fix, setFix] = useState(null);   // { accuracy } or { problem }
  const v = form.values;

  // Both numbers pasted (or typed) into either box fill both boxes.
  function fillPair(pair) {
    form.setValues((x) => ({ ...x, latitude: pair[0], longitude: pair[1] }));
    form.setErrors((e) => ({ ...e, latitude: undefined, longitude: undefined }));
  }
  const coordinateInput = (name) => ({
    value: v[name],
    onChange: (e) => {
      // Split at once only when text arrived in one go (a keyboard's
      // clipboard); typed by hand, a pair would split halfway through.
      const pair = e.target.value.length - String(v[name]).length > 1 ? coordinatePair(e.target.value) : null;
      if (pair) fillPair(pair); else form.set(name)(e);
    },
    onPaste: (e) => {
      const pair = coordinatePair(e.clipboardData?.getData('text') ?? '');
      if (pair) { e.preventDefault(); fillPair(pair); }
    },
    onBlur: (e) => {
      const pair = coordinatePair(e.target.value);
      if (pair) fillPair(pair);
    },
  });

  async function fillFromMyLocation() {
    setLocating(true); setFix(null);
    try {
      const p = await getPosition({ timeout: 20000 });
      form.setValues((x) => ({ ...x, latitude: p.latitude.toFixed(6), longitude: p.longitude.toFixed(6) }));
      form.setErrors((e) => ({ ...e, latitude: undefined, longitude: undefined }));
      setFix({ accuracy: p.accuracy });
    } catch (err) {
      setFix({ problem: err instanceof LocationError ? err.kind : 'UNAVAILABLE' });
    } finally { setLocating(false); }
  }

  /** The service as the API takes it: only what this schedule uses. */
  function body() {
    const r = v.recurrence;
    return {
      name: v.name.trim(),
      kind: v.kind,
      venueName: v.venueName.trim() || null,
      latitude: coordinate(v.latitude),
      longitude: coordinate(v.longitude),
      radiusM: String(v.radiusM).trim() === '' ? null : Number(v.radiusM),
      recurrence: r,
      weekday: r === 'WEEKLY' ? Number(v.weekday) : null,
      startTime: v.startTime,
      endTime: v.endTime,
      startsOn: v.startsOn || null,
      endsOn: r === 'NONE' ? null : (v.endsOn || null),
      expected: Boolean(v.expected),
    };
  }

  async function save(e) {
    e?.preventDefault();
    const b = body();
    // A typo in a coordinate would otherwise go as "not a number" and be lost.
    const bad = {};
    if (Number.isNaN(b.latitude) || (b.latitude !== null && Math.abs(b.latitude) > 90)) bad.latitude = 'A latitude is a number between -90 and 90, like 5.603717.';
    if (Number.isNaN(b.longitude) || (b.longitude !== null && Math.abs(b.longitude) > 180)) bad.longitude = 'A longitude is a number between -180 and 180, like -0.186964.';
    if ((b.latitude === null) !== (b.longitude === null) && !bad.latitude && !bad.longitude) bad[b.latitude === null ? 'latitude' : 'longitude'] = 'Fill in both, or leave both empty.';
    // Empty is allowed on a new service only: the server then uses the usual distance from Settings.
    if (b.radiusM === null ? !isNew : !Number.isInteger(b.radiusM)) bad.radiusM = 'Enter the distance in whole metres, from 20 to 2000.';
    if (Object.keys(bad).length) { form.setErrors(bad); return; }

    let payload = b;
    if (isNew && b.radiusM === null) {
      payload = { ...b };
      delete payload.radiusM;
    }
    if (!isNew) {
      // Only what changed, so an edit to the name never touches the dates
      // already made from the times.
      const before = {
        ...service,
        venueName: service.venueName ?? null, latitude: service.latitude ?? null, longitude: service.longitude ?? null,
        weekday: service.weekday ?? null, startsOn: service.startsOn ?? null, endsOn: service.endsOn ?? null,
      };
      payload = Object.fromEntries(Object.entries(b).filter(([k, value]) => value !== before[k]));
      if (!Object.keys(payload).length) { onClose(); return; }
    }
    const res = await form.submit(() => (isNew ? api.post('/admin/services', payload) : api.patch(`/admin/services/${service.id}`, payload)));
    if (res) await onSaved();
  }

  const lat = coordinate(v.latitude);
  const lng = coordinate(v.longitude);
  const mapUrl = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng)
    ? `https://www.google.com/maps?q=${lat},${lng}` : null;
  const problem = fix?.problem ? locationProblem(fix.problem) : null;

  return (
    <Modal title={isNew ? 'Add a service' : `Edit ${service.name}`} onClose={onClose} busy={form.busy} wide
      footer={<>
        <button type="button" className="btn-outline" onClick={onClose} disabled={form.busy}>Cancel</button>
        <button type="button" className="btn-primary" onClick={save} disabled={form.busy}>{form.busy ? <Spinner size={15} /> : 'Save'}</button>
      </>}>
      <form onSubmit={save} className="space-y-5" noValidate>
        <Alert>{form.formError}</Alert>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Name" error={form.errors.name}>
            <input className="input" value={v.name} onChange={form.set('name')} placeholder="Sunday service" autoFocus={isNew} />
          </Field>
          <Field label="Kind" error={form.errors.kind}>
            <select className="input" value={v.kind} onChange={form.set('kind')}>
              {Object.entries(SERVICE_KIND_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
        </div>

        {/* When */}
        <fieldset className="space-y-4">
          <legend className="font-display text-xl text-ink mb-2">When</legend>
          <div role="radiogroup" aria-label="Repeats" className="flex flex-wrap gap-2">
            {RECURRENCE.map((r) => (
              <label key={r.value} className={`px-3.5 py-2 rounded-full border text-sm font-body cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold/40 ${
                v.recurrence === r.value ? 'bg-purple-deep text-white border-purple-deep' : 'bg-white text-ink/65 border-purple-brand/15 hover:border-purple-brand/35'}`}>
                <input type="radio" name="recurrence" value={r.value} checked={v.recurrence === r.value} onChange={form.set('recurrence')} className="sr-only" />
                {r.label}
              </label>
            ))}
          </div>
          {form.errors.recurrence && <p className="text-[12px] font-body text-red-600" role="alert">{form.errors.recurrence}</p>}

          {v.recurrence === 'WEEKLY' && (
            <>
              <Field label="Day" error={form.errors.weekday}>
                <select className="input sm:w-56" value={v.weekday} onChange={form.set('weekday')}>
                  {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </Field>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Starting from (optional)" error={form.errors.startsOn} hint="Leave empty to start now.">
                  <input className="input" type="date" value={v.startsOn} onChange={form.set('startsOn')} />
                </Field>
                <Field label="Until (optional)" error={form.errors.endsOn} hint="Leave empty to repeat every week.">
                  <input className="input" type="date" value={v.endsOn} onChange={form.set('endsOn')} />
                </Field>
              </div>
            </>
          )}
          {v.recurrence === 'DAILY' && (
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="First day" error={form.errors.startsOn}>
                <input className="input" type="date" value={v.startsOn} onChange={form.set('startsOn')} />
              </Field>
              <Field label="Last day" error={form.errors.endsOn}>
                <input className="input" type="date" value={v.endsOn} onChange={form.set('endsOn')} min={v.startsOn || undefined} />
              </Field>
            </div>
          )}
          {v.recurrence === 'NONE' && (
            <Field label="Date" error={form.errors.startsOn}>
              <input className="input sm:w-56" type="date" value={v.startsOn} onChange={form.set('startsOn')} />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Starts" error={form.errors.startTime}>
              <input className="input" type="time" value={v.startTime} onChange={form.set('startTime')} />
            </Field>
            <Field label="Ends" error={form.errors.endTime}>
              <input className="input" type="time" value={v.endTime} onChange={form.set('endTime')} />
            </Field>
          </div>
        </fieldset>

        {/* Where */}
        <fieldset className="space-y-4">
          <legend className="font-display text-xl text-ink mb-2">Where</legend>
          <Field label="Venue name" error={form.errors.venueName} hint="Shown to workers, and in the message when they’re too far away.">
            <input className="input" value={v.venueName} onChange={form.set('venueName')} placeholder="Royal Ravico Hotel" />
          </Field>

          <div className="rounded-lg border border-purple-brand/10 bg-mist p-4 space-y-3">
            <p className="text-sm font-body text-ink/65">
              Standing at the venue? Use your phone’s location. Otherwise find the place on Google Maps, press and hold on it, and copy the two numbers here.
            </p>
            <button type="button" className="btn-outline px-4 py-2.5 bg-white" onClick={fillFromMyLocation} disabled={locating}>
              {locating ? <><Spinner size={15} /> Finding your location…</> : <><LocateFixed size={15} /> Use my current location</>}
            </button>
            {fix?.accuracy !== undefined && (
              <p className={`text-sm font-body ${fix.accuracy > 100 ? 'text-[#8a6d1f]' : 'text-green-700'}`} role="status">
                Location filled in — accurate to about {Math.round(fix.accuracy)} m.
                {fix.accuracy > 100 && ' That’s rough: step outside, wait a moment and try again for a better fix.'}
              </p>
            )}
            {problem && (
              <div className="text-sm font-body text-red-700 space-y-1" role="alert">
                <p className="font-semibold">{problem.title}</p>
                <p>{problem.text}</p>
                {problem.steps && <p className="text-red-700/80">{problem.steps}</p>}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {/* Text, not decimal: an iPhone's decimal pad has no minus, and Ghana's longitudes are negative. */}
              <Field label="Latitude" error={form.errors.latitude}>
                <input className="input bg-white" inputMode="text" autoComplete="off" spellCheck={false}
                  {...coordinateInput('latitude')} placeholder="5.603717" />
              </Field>
              <Field label="Longitude" error={form.errors.longitude}>
                <input className="input bg-white" inputMode="text" autoComplete="off" spellCheck={false}
                  {...coordinateInput('longitude')} placeholder="-0.186964" />
              </Field>
            </div>
            {mapUrl ? (
              <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-body text-purple-brand font-medium hover:underline">
                <ExternalLink size={14} aria-hidden="true" /> Check on map
              </a>
            ) : (
              <p className="text-xs font-body text-ink/45">Without a location, workers clock in to this service with the QR code only.</p>
            )}
          </div>

          <Field label="Distance allowed (metres)" error={form.errors.radiusM}
            hint={`How close to the venue workers must be to clock in by GPS. 100–200 m suits most buildings; more for a big compound.${
              isNew ? ` Leave empty for the usual distance${defaultRadius ? ` (${defaultRadius} m)` : ''} set in Settings.` : ''}`}>
            <input className="input sm:w-72" type="number" inputMode="numeric" min={20} max={2000} step={10} value={v.radiusM} onChange={form.set('radiusM')}
              placeholder={isNew ? 'Usual distance (from Settings)' : undefined} />
          </Field>
        </fieldset>

        <label className="flex items-start justify-between gap-4 cursor-pointer select-none">
          <span>
            <span className="block text-sm font-body font-medium text-ink">Counts towards attendance</span>
            <span className="block text-xs font-body text-ink/45 mt-0.5">Workers are expected at this service, so missing it shows as absent in reports.</span>
          </span>
          <input type="checkbox" role="switch" checked={Boolean(v.expected)} onChange={form.set('expected')} className="peer sr-only" />
          <span aria-hidden="true"
            className="relative mt-0.5 w-11 h-6 flex-shrink-0 rounded-full bg-ink/15 transition-colors peer-checked:bg-gold peer-focus-visible:ring-2 peer-focus-visible:ring-gold/40 after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5" />
        </label>
        {form.errors.expected && <p className="text-[12px] font-body text-red-600" role="alert">{form.errors.expected}</p>}

        {!isNew && (
          <p className="text-xs font-body text-ink/45">
            New times or a new day apply to the coming dates nobody has clocked in to yet. Dates you changed by hand on the Sessions page keep their own times.
          </p>
        )}
      </form>
    </Modal>
  );
}
