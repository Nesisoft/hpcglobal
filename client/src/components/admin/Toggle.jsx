/**
 * On/off toggle switch.
 *
 * Props:
 *   checked   – boolean
 *   onChange  – (checked: boolean) => void
 *   label     – optional inline label
 *   disabled  – boolean
 */
export default function Toggle({ checked, onChange, label, disabled }) {
  return (
    <label className={`inline-flex items-center gap-2.5 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`
          relative w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none
          ${checked ? 'bg-purple-brand' : 'bg-ink/15'}
        `}
      >
        <span
          className={`
            absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200
            ${checked ? 'translate-x-5' : 'translate-x-0'}
          `}
        />
      </button>
      {label && (
        <span className="font-body text-sm text-ink/70">{label}</span>
      )}
    </label>
  );
}
