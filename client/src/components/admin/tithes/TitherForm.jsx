import { useState, useEffect, useRef } from 'react';
import { X, Check, Info } from 'lucide-react';
import { adminApi } from '../../../services/api';
import { normalizeTitheNumber, formatPhone } from '../../../utils/tithe';
import AdminModal from '../AdminModal';
import FormField from '../FormField';

const TYPES = [
  ['INDIVIDUAL', 'Individual'],
  ['COUPLE',     'Couple'],
];

const TITLES = {
  create:  'Add a tither',
  edit:    'Edit tither',
  convert: "Convert to a couple's account",
};

const SAVE_LABELS = {
  create:  'Add tither',
  edit:    'Save changes',
  convert: 'Convert account',
};

const EMPTY = { number: '', type: 'INDIVIDUAL', name: '', phone: '', spouseName: '', spousePhone: '', notes: '' };

const NUMBER_HELP = 'Letters then digits, like HPC021.';

/** What the form shows for an existing tither: stored phones as people write them. */
function fromTither(tither, mode) {
  return {
    number:      tither?.number ?? '',
    type:        mode === 'convert' ? 'COUPLE' : (tither?.type ?? 'INDIVIDUAL'),
    name:        tither?.name ?? '',
    phone:       formatPhone(tither?.phone),
    spouseName:  tither?.spouseName ?? '',
    spousePhone: formatPhone(tither?.spousePhone),
    notes:       tither?.notes ?? '',
  };
}

/**
 * Add, edit or convert a tither's account.
 *
 * Props:
 *   open     – boolean
 *   mode     – 'create' | 'edit' | 'convert'
 *   tither   – the account being edited or converted (T from the API)
 *   initial  – optional, create mode only: { number, name, phone } to start
 *              from, e.g. the giver of an online tithe. A number given here
 *              is used instead of the suggested next free one.
 *   onClose  – close handler
 *   onSaved  – (tither) => void, called with the saved row; the parent closes
 */
export default function TitherForm({ open, mode = 'create', tither, initial, onClose, onSaved }) {
  const [form, setForm]               = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError]             = useState('');
  const [saving, setSaving]           = useState(false);
  // '' | 'loading' | 'failed' — the suggested number for a new account.
  const [numberState, setNumberState] = useState('');

  // Keyed on the id, not the object: a parent refetch must not wipe what the
  // office has typed so far.
  const titherRef = useRef(tither);
  titherRef.current = tither;
  const titherId = tither?.id;
  // Read when the form opens, like the tither: a new object from the parent
  // must not refill the form mid-typing.
  const initialRef = useRef(initial);
  initialRef.current = initial;
  const prefilled = mode === 'create' && Boolean(initial);

  useEffect(() => {
    if (!open) return undefined;
    setError('');
    setFieldErrors({});
    setNumberState('');

    if (mode !== 'create') {
      setForm(fromTither(titherRef.current, mode));
      return undefined;
    }

    const start = initialRef.current;
    const prefill = {
      ...EMPTY,
      number: start?.number ?? '',
      name:   start?.name ?? '',
      phone:  start?.phone ?? '',
    };
    setForm(prefill);
    // A number brought along wins over the suggested next one.
    if (prefill.number) return undefined;

    setNumberState('loading');
    let cancelled = false;
    adminApi.nextTitheNumber()
      .then(({ data }) => {
        if (cancelled) return;
        // Keep a number the office typed while we were asking.
        setForm((f) => (f.number ? f : { ...f, number: data?.number ?? '' }));
        setNumberState('');
      })
      .catch(() => { if (!cancelled) setNumberState('failed'); });
    return () => { cancelled = true; };
  }, [open, mode, titherId]);

  const couple    = form.type === 'COUPLE';
  const locked    = mode === 'convert';
  const canonical = normalizeTitheNumber(form.number);
  const typed     = form.number.trim();

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((e) => (e[key] ? { ...e, [key]: '' } : e));
  }

  function validate() {
    const errors = {};
    if (!typed) errors.number = 'Please enter a tithe number.';
    else if (!canonical) errors.number = `"${typed}" can't be a tithe number. ${NUMBER_HELP}`;
    if (!form.name.trim()) errors.name = couple ? "Please enter the first person's name." : 'Please enter the name.';
    if (couple && !form.spouseName.trim()) errors.spouseName = "Please enter the spouse's name.";
    return errors;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    if (mode !== 'create' && !titherId) {
      setError('That tither is no longer open. Close this and try again.');
      return;
    }

    // Spouse details only mean something for a couple; the server drops them
    // otherwise, so don't send stale ones.
    const body = {
      number:      typed,
      type:        form.type,
      name:        form.name.trim(),
      phone:       form.phone.trim(),
      spouseName:  couple ? form.spouseName.trim() : '',
      spousePhone: couple ? form.spousePhone.trim() : '',
      notes:       form.notes.trim(),
    };

    setSaving(true);
    setError('');
    try {
      const res = mode === 'create'
        ? await adminApi.createTither(body)
        : await adminApi.updateTither(titherId, body);
      onSaved?.(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save. Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  // Live "Will be saved as HPC021" under the number, red when it can't be one.
  const numberError = fieldErrors.number || (typed && !canonical ? `"${typed}" can't be a tithe number. ${NUMBER_HELP}` : '');
  const numberHint =
    typed ? `Will be saved as ${canonical}`
    : numberState === 'loading' ? 'Finding the next free number…'
    : numberState === 'failed' ? <span className="text-amber-700">Couldn't suggest a number — type one, like HPC021.</span>
    : NUMBER_HELP;

  const wasCouple = mode === 'edit' && tither?.type === 'COUPLE';
  const typeHint =
    locked ? undefined
    : wasCouple && !couple ? <span className="text-amber-700">Switching to Individual removes the spouse's details.</span>
    : 'A couple shares one number; both phones get the acknowledgement SMS.';

  return (
    // Held open while saving, so a late answer can't land in the next opening.
    <AdminModal open={open} onClose={onClose} title={TITLES[mode] ?? TITLES.create} size="md" dismissable={!saving}>
      <form onSubmit={handleSubmit} noValidate>
        <div className="space-y-4">
          {prefilled && (
            <div className="flex items-start gap-2 rounded-lg bg-purple-brand/5 border border-purple-brand/15 px-4 py-3 text-xs font-body text-ink/70">
              <Info size={14} className="text-purple-brand mt-px flex-shrink-0" />
              <p>Filled in from the online tithe. Check the details and save — you'll then add the tithe to this new account.</p>
            </div>
          )}

          {locked && (
            <div className="flex items-start gap-2 rounded-lg bg-purple-brand/5 border border-purple-brand/15 px-4 py-3 text-xs font-body text-ink/70">
              <Info size={14} className="text-purple-brand mt-px flex-shrink-0" />
              <p>The tithe number stays the same; add the spouse's details. Both numbers will receive the acknowledgement SMS.</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Tithe number" required hint={numberHint} error={numberError}>
              <input
                className="input font-mono"
                value={form.number}
                onChange={(e) => set('number', e.target.value)}
                placeholder="HPC021"
                maxLength={30}
                autoFocus={mode === 'create'}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
              />
            </FormField>

            <FormField label="Type" required hint={typeHint}>
              <div
                role="group"
                aria-label="Type"
                className={`self-start inline-flex rounded-lg border border-purple-brand/15 overflow-hidden text-xs font-body ${locked ? 'opacity-60' : ''}`}
              >
                {TYPES.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    disabled={locked}
                    aria-pressed={form.type === value}
                    onClick={() => set('type', value)}
                    className={`px-4 py-2.5 transition-colors disabled:cursor-not-allowed ${
                      form.type === value ? 'bg-purple-brand text-white' : 'bg-white text-ink/55 hover:text-ink'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label={couple ? 'First person' : 'Name'} required error={fieldErrors.name}>
              <input
                className="input"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Kofi Mensah"
                maxLength={120}
                autoFocus={mode !== 'create'}
                autoComplete="off"
              />
            </FormField>
            <FormField label="Phone" hint="Used for the acknowledgement SMS">
              <input
                type="tel"
                inputMode="tel"
                className="input"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="024 412 3456"
                maxLength={40}
                autoComplete="off"
              />
            </FormField>
          </div>

          {couple && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-purple-brand/8">
              <FormField label="Spouse name" required error={fieldErrors.spouseName}>
                <input
                  className="input"
                  value={form.spouseName}
                  onChange={(e) => set('spouseName', e.target.value)}
                  placeholder="Ama Mensah"
                  maxLength={120}
                  autoComplete="off"
                />
              </FormField>
              <FormField label="Spouse phone" hint="Also gets the acknowledgement SMS">
                <input
                  type="tel"
                  inputMode="tel"
                  className="input"
                  value={form.spousePhone}
                  onChange={(e) => set('spousePhone', e.target.value)}
                  placeholder="020 123 4567"
                  maxLength={40}
                  autoComplete="off"
                />
              </FormField>
            </div>
          )}

          <FormField label="Notes" hint="Internal only">
            <textarea
              className="input min-h-[80px] resize-y"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              maxLength={1000}
            />
          </FormField>
        </div>

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-600 text-sm font-body">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-purple-brand/8">
          <button type="button" onClick={onClose} disabled={saving} className="btn-outline text-sm px-5 py-2 disabled:opacity-50">
            <X size={14} /> Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-primary text-sm px-5 py-2 disabled:opacity-50">
            {saving ? 'Saving…' : <><Check size={14} /> {SAVE_LABELS[mode] ?? SAVE_LABELS.create}</>}
          </button>
        </div>
      </form>
    </AdminModal>
  );
}
