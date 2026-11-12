import { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, FileSpreadsheet, Download, Loader2, AlertTriangle, CheckCircle2, Info, X, ArrowLeft, Check } from 'lucide-react';
import { adminApi } from '../../../services/api';
import { downloadBlob } from '../../../utils/download';
import { formatPhone } from '../../../utils/tithe';
import AdminModal from '../AdminModal';
import AdminTable from '../AdminTable';

const ACCEPT = '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;   // express.raw limit in routes/tithes.js

const STEPS = ['Choose a file', 'Check the list', 'Done'];
const STEP_INDEX = { file: 0, preview: 1, done: 2 };

const COLUMNS_HELP = [
  ['Tithe Number', 'Required, e.g. HPC021'],
  ['Name',         'Required'],
  ['Phone',        'Optional. Receives the acknowledgement SMS'],
  ['Type',         'Individual or Couple; blank means Individual'],
  ['Spouse Name',  'Couples only'],
  ['Spouse Phone', 'Couples, optional'],
];

const STATUS = {
  new:    { label: 'New',     className: 'bg-green-50 text-green-700' },
  update: { label: 'Update',  className: 'bg-purple-brand/10 text-purple-brand' },
  error:  { label: 'Problem', className: 'bg-red-50 text-red-600' },
};
const TYPE_LABEL = { INDIVIDUAL: 'Individual', COUPLE: 'Couple' };

const plural = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;

// Only what the import route validates; `line`, `status` etc. stay behind.
// keepType: the file has no Type or Spouse column, so an update must not
// change whether an account is a couple.
const pick = ({ number, name, type, phone, spouseName, spousePhone, keepType }) =>
  ({ number, name, type, phone, spouseName, spousePhone, keepType: Boolean(keepType) });

function StatusBadge({ status }) {
  const meta = STATUS[status] ?? STATUS.error;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${meta.className}`}>
      {meta.label}
    </span>
  );
}

/**
 * Upload a spreadsheet of tithers in three steps: choose the file, check what
 * the server made of every row, then import the ones that are sound.
 *
 * Props:
 *   open        – boolean
 *   onClose     – close handler
 *   onImported  – ({ created, updated, skipped }) => void, after a successful import
 */
export default function TitherImport({ open, onClose, onImported }) {
  const [step, setStep]                     = useState('file');   // 'file' | 'preview' | 'done'
  const [reading, setReading]               = useState('');       // name of the file being read
  const [dragOver, setDragOver]             = useState(false);
  const [downloading, setDownloading]       = useState(false);
  const [error, setError]                   = useState('');
  const [preview, setPreview]               = useState(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [problemsOnly, setProblemsOnly]     = useState(false);
  const [importing, setImporting]           = useState(false);
  const [result, setResult]                 = useState(null);

  const inputRef   = useRef(null);
  // A preview that answers after the modal was reset must not reopen step 2.
  const requestRef = useRef(0);

  const reset = useCallback(() => {
    requestRef.current += 1;
    setStep('file');
    setReading('');
    setDragOver(false);
    setError('');
    setPreview(null);
    setUpdateExisting(false);
    setProblemsOnly(false);
    setImporting(false);
    setResult(null);
  }, []);

  useEffect(() => { if (open) reset(); }, [open, reset]);

  async function handleFile(file) {
    if (!file || reading) return;
    setError('');
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`${file.name} is too big. Uploads are limited to 5MB.`);
      return;
    }
    const mine = ++requestRef.current;
    setReading(file.name);
    try {
      const { data } = await adminApi.previewTitherImport(file);
      if (mine !== requestRef.current) return;
      setPreview(data);
      setUpdateExisting(false);
      setProblemsOnly(false);
      setStep('preview');
    } catch (err) {
      if (mine !== requestRef.current) return;
      setError(err.response?.data?.message || `Could not read ${file.name}. Please try again.`);
    } finally {
      if (mine === requestRef.current) setReading('');
    }
  }

  async function downloadTemplate() {
    setDownloading(true);
    setError('');
    try {
      const { data } = await adminApi.titherTemplateCsv();
      downloadBlob(data, 'tithers-template.csv');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not download the template. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  const rows       = preview?.rows ?? [];
  const summary    = preview?.summary ?? { total: 0, new: 0, update: 0, error: 0 };
  // Columns in the file that the upload does not use, by their header text.
  const ignored    = (preview?.ignoredColumns ?? []).filter(Boolean);
  // Rows with problems are never sent; 'update' rows only when asked for.
  const importable = rows.filter((r) => r.status === 'new' || (updateExisting && r.status === 'update'));
  const count      = importable.length;
  const tableRows  = (problemsOnly ? rows.filter((r) => r.status === 'error') : rows).map((r) => ({ ...r, id: r.line }));

  async function handleImport() {
    if (!count || importing) return;
    setImporting(true);
    setError('');
    try {
      const { data } = await adminApi.importTithers({ rows: importable.map(pick), updateExisting });
      setResult(data);
      setStep('done');
      onImported?.(data);
    } catch (err) {
      setError(err.response?.data?.message || 'The list could not be saved. Please try again.');
    } finally {
      setImporting(false);
    }
  }

  function goBack() {
    setStep('file');
    setPreview(null);
    setError('');
  }

  const columns = [
    {
      key: 'line',
      label: 'Row',
      width: '56px',
      render: (r) => <span className="text-ink/40 text-xs">{r.line}</span>,
    },
    {
      key: 'number',
      label: 'No.',
      render: (r) => <span className="font-mono text-xs">{r.number || <span className="text-ink/30">—</span>}</span>,
    },
    {
      key: 'name',
      label: 'Name',
      render: (r) => {
        const uploaded = [r.name, r.spouseName].filter(Boolean).join(' & ');
        const problems = r.problems ?? [];
        const warnings = r.warnings ?? [];
        // What is wrong sits right under the name: a last column would be
        // off the edge of a phone screen.
        return (
          <div className="min-w-0 whitespace-normal max-w-[22rem]">
            <p className="font-medium text-ink/90 text-sm leading-tight">
              {r.name || <span className="text-ink/30 font-normal">—</span>}
            </p>
            {r.spouseName && <p className="text-ink/50 text-[11px]">&amp; {r.spouseName}</p>}
            {r.existing && r.existing.name !== uploaded && (
              <p className="text-ink/40 text-[11px] mt-0.5">
                Now: {r.existing.name}{r.existing.isActive ? '' : ' (archived)'}
              </p>
            )}
            {(problems.length > 0 || warnings.length > 0) && (
              <ul className="mt-1 min-w-[12rem] space-y-0.5 text-[11px] leading-snug">
                {problems.map((p, i) => <li key={`p${i}`} className="text-red-600">{p}</li>)}
                {warnings.map((w, i) => <li key={`w${i}`} className="text-amber-700">{w}</li>)}
              </ul>
            )}
          </div>
        );
      },
    },
    {
      key: 'type',
      label: 'Type',
      // A file with no Type or Spouse column leaves an existing account's type
      // as it is, so say that rather than "Individual".
      render: (r) => (r.keepType && r.status === 'update'
        ? <span className="text-ink/40 text-xs italic">Unchanged</span>
        : <span className="text-ink/60 text-xs">{TYPE_LABEL[r.type] ?? '—'}</span>),
    },
    {
      key: 'phone',
      label: 'Phone',
      render: (r) => (
        <div className="text-xs">
          <p className={r.phone ? 'text-ink/70' : 'text-ink/30'}>{r.phone ? formatPhone(r.phone) : '—'}</p>
          {r.spousePhone && <p className="text-ink/50">{formatPhone(r.spousePhone)}</p>}
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (r) => <StatusBadge status={r.status} />,
    },
  ];

  const stepIndex = STEP_INDEX[step] ?? 0;

  const errorBox = error && (
    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-600 text-sm font-body">{error}</div>
  );

  return (
    // Held open while a file is read or the list saved, so a late answer
    // can't land in the next opening.
    <AdminModal open={open} onClose={onClose} title="Upload a list of tithers" size="xl" dismissable={!reading && !importing}>
      <ol className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-body mb-5">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`flex items-center gap-1.5 ${i === stepIndex ? 'text-purple-brand font-semibold' : i < stepIndex ? 'text-ink/50' : 'text-ink/30'}`}
          >
            <span className={`w-4 h-4 rounded-full inline-flex items-center justify-center text-[9px] font-semibold ${
              i === stepIndex ? 'bg-purple-brand text-white' : i < stepIndex ? 'bg-purple-brand/15 text-purple-brand' : 'bg-ink/5 text-ink/40'
            }`}>
              {i < stepIndex ? <Check size={9} /> : i + 1}
            </span>
            {label}
            {i < STEPS.length - 1 && <span className="text-ink/20 ml-1">›</span>}
          </li>
        ))}
      </ol>

      {/* Step 1 — choose the file */}
      {step === 'file' && (
        <div className="space-y-5">
          <div
            role="button"
            tabIndex={0}
            aria-label="Choose a spreadsheet to upload"
            onClick={() => !reading && inputRef.current?.click()}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !reading) { e.preventDefault(); inputRef.current?.click(); }
            }}
            onDragOver={(e) => { e.preventDefault(); if (!reading) setDragOver(true); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!reading) handleFile(e.dataTransfer.files?.[0]); }}
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors focus:outline-none focus:border-gold ${
              reading ? 'border-purple-brand/30 bg-purple-brand/5 cursor-wait'
              : dragOver ? 'border-purple-brand bg-purple-brand/5'
              : 'border-purple-brand/20 hover:border-purple-brand/40 cursor-pointer'
            }`}
          >
            {/* Uncontrolled, and emptied after each pick so the same file can be chosen again. */}
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; handleFile(file); }}
            />
            {reading ? (
              <>
                <Loader2 size={22} className="mx-auto mb-2 text-purple-brand animate-spin" />
                <p className="text-sm font-body text-purple-brand">Reading {reading}…</p>
              </>
            ) : (
              <>
                <FileSpreadsheet size={22} className="mx-auto mb-2 text-purple-brand/40" />
                <p className="text-sm font-body text-ink/60">
                  Drag &amp; drop the file here, or <span className="text-purple-brand underline">choose a file</span>
                </p>
                <p className="text-[11px] font-body text-ink/40 mt-0.5">Excel (.xlsx) or CSV, up to 5MB</p>
              </>
            )}
          </div>

          <div>
            <p className="text-sm font-body text-ink/70">Excel (.xlsx) or CSV. The first row should name the columns:</p>
            <div className="mt-2 rounded-lg border border-purple-brand/8 overflow-hidden">
              <table className="w-full text-xs font-body">
                <tbody className="divide-y divide-purple-brand/5">
                  {COLUMNS_HELP.map(([name, what]) => (
                    <tr key={name}>
                      <td className="px-3 py-1.5 font-medium text-ink/80 whitespace-nowrap w-36">{name}</td>
                      <td className="px-3 py-1.5 text-ink/55">{what}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={downloadTemplate}
              disabled={downloading}
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-body font-medium text-purple-brand hover:text-purple-deep disabled:opacity-50"
            >
              {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {downloading ? 'Preparing…' : 'Download the template'}
            </button>
          </div>

          <div className="rounded-lg bg-cream/60 border border-purple-brand/8 p-3 flex items-start gap-2">
            <Info size={14} className="text-purple-brand/60 mt-px flex-shrink-0" />
            <p className="text-[11px] font-body text-ink/60 leading-relaxed">
              <strong className="text-ink/75">Tip:</strong> if phone numbers lose their leading 0 in Excel, the upload puts it back.
              Numbers like 2.44E+08 mean Excel dropped digits — format that column as Text first.
            </p>
          </div>

          {errorBox}

          <div className="flex justify-end gap-3 pt-4 border-t border-purple-brand/8">
            <button type="button" onClick={onClose} disabled={Boolean(reading)} className="btn-outline text-sm px-5 py-2 disabled:opacity-50">
              <X size={14} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Step 2 — check what was read */}
      {step === 'preview' && preview && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="inline-flex items-center gap-1.5 text-sm font-body text-ink/80 min-w-0">
              <FileSpreadsheet size={14} className="text-purple-brand/60 flex-shrink-0" />
              <span className="truncate">{preview.filename || 'Your file'}</span>
              <span className="text-ink/40 text-xs whitespace-nowrap">· {plural(summary.total, 'row')} read</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-body">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-green-50 text-green-700 font-medium">
              {summary.new} new
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-purple-brand/10 text-purple-brand font-medium">
              {summary.update} already on the register
            </span>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full font-medium ${summary.error ? 'bg-red-50 text-red-600' : 'bg-ink/5 text-ink/50'}`}>
              {summary.error} with problems
            </span>
          </div>

          {ignored.length > 0 && (
            <p className="text-[11px] font-body text-ink/45 -mt-2">
              Not read from the file: {ignored.join(', ')}.
            </p>
          )}

          {preview.hadHeader === false && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
              <Info size={13} className="text-amber-700 mt-px flex-shrink-0" />
              <p className="text-xs font-body text-amber-800">
                The first row did not name the columns, so they were read in the template&rsquo;s order:
                Tithe Number, Name, Phone, Type, Spouse Name, Spouse Phone. If that looks wrong, add a header row and upload again.
              </p>
            </div>
          )}

          {summary.update > 0 && (
            <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-purple-brand/10 bg-[#F9F8FC] p-3">
              <input
                type="checkbox"
                className="accent-purple-brand mt-0.5 cursor-pointer"
                checked={updateExisting}
                onChange={(e) => setUpdateExisting(e.target.checked)}
                disabled={importing}
              />
              <span className="font-body">
                <span className="block text-sm text-ink/80">
                  Update the {summary.update} already on the register with the details in this file
                </span>
                <span className="block text-[11px] text-ink/45 mt-0.5">
                  {updateExisting
                    ? 'Their name and type come from the file, and any phone number in the file replaces the one on the register. Notes, payments and archived status are kept.'
                    : 'Leave this off to keep them exactly as they are; only the new ones are added.'}
                </span>
              </span>
            </label>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-body text-ink/45">
              {summary.error > 0
                ? 'Rows marked Problem are left out. Fix them in the file and upload it again to include them.'
                : 'Everything in the file can be imported.'}
            </p>
            {summary.error > 0 && summary.error < summary.total && (
              <label className="inline-flex items-center gap-1.5 text-[11px] font-body text-ink/60 cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-purple-brand cursor-pointer"
                  checked={problemsOnly}
                  onChange={(e) => setProblemsOnly(e.target.checked)}
                />
                Only rows with problems
              </label>
            )}
          </div>

          <AdminTable columns={columns} rows={tableRows} empty="No rows with problems." />

          {errorBox}

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-purple-brand/8">
            <p className="text-[11px] font-body text-ink/45">
              {count === 0
                ? 'Nothing to import yet.'
                : `${[
                    summary.new > 0 && plural(summary.new, 'new tither'),
                    updateExisting && summary.update > 0 && `${summary.update} to update`,
                  ].filter(Boolean).join(' and ')}.`}
              {!updateExisting && summary.update > 0 && ` ${summary.update} already on the register will be left unchanged.`}
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={goBack} disabled={importing} className="btn-outline text-sm px-5 py-2 disabled:opacity-50">
                <ArrowLeft size={14} /> Back
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={importing || count === 0}
                className="btn-primary text-sm px-5 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? 'Importing…' : <><Upload size={14} /> Import {plural(count, 'tither')}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3 — what happened */}
      {step === 'done' && result && (() => {
        const skipped = result.skipped ?? [];
        const nothing = (result.created ?? 0) + (result.updated ?? 0) === 0;
        return (
          <div className="space-y-5">
            <div className={`rounded-lg border p-4 flex items-start gap-3 ${nothing ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
              {nothing
                ? <AlertTriangle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
                : <CheckCircle2 size={18} className="text-emerald-600 mt-0.5 flex-shrink-0" />}
              <div>
                <p className="font-display text-lg text-ink font-light leading-tight">
                  Added {result.created ?? 0} · Updated {result.updated ?? 0}
                </p>
                <p className="text-xs font-body text-ink/55 mt-1">
                  {nothing ? 'Nothing was added to the register.' : 'The register has been updated.'}
                  {preview?.filename ? ` From ${preview.filename}.` : ''}
                </p>
              </div>
            </div>

            {skipped.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-body font-semibold text-amber-800 mb-1.5 flex items-center gap-1.5">
                  <AlertTriangle size={13} /> Skipped ({skipped.length})
                </p>
                <ul className="space-y-0.5 max-h-48 overflow-y-auto">
                  {skipped.map((s, i) => (
                    <li key={i} className="text-[11px] font-body text-amber-800">
                      <span className="font-mono">{s.number || (s.row ? `Row ${s.row}` : '—')}</span> — {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-purple-brand/8">
              <button type="button" onClick={reset} className="btn-outline text-sm px-5 py-2">
                <Upload size={14} /> Upload another
              </button>
              <button type="button" onClick={onClose} className="btn-primary text-sm px-5 py-2">
                <Check size={14} /> Done
              </button>
            </div>
          </div>
        );
      })()}
    </AdminModal>
  );
}
