/**
 * Labeled form field wrapper — works with react-hook-form or uncontrolled.
 *
 * Props:
 *   label       – field label text
 *   error       – error message string
 *   required    – shows asterisk
 *   hint        – helper text below input
 *   children    – the actual input / select / textarea element
 */
export default function FormField({ label, error, required, hint, children }) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-[11px] font-body font-semibold uppercase tracking-wider text-ink/50">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {hint && !error && (
        <p className="text-[11px] text-ink/40 font-body">{hint}</p>
      )}
      {error && (
        <p className="text-[11px] text-red-500 font-body">{error}</p>
      )}
    </div>
  );
}
