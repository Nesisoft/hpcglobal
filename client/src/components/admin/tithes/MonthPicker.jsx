import { MONTHS, thisMonth } from '../../../utils/tithe';

/**
 * A month as "YYYY-MM", chosen with two selects — <input type="month"> is not
 * supported by every browser the office uses.
 *
 * Props:
 *   value      – "YYYY-MM", or '' when `allowAll` and nothing is chosen
 *   onChange   – (value: string) => void
 *   allowAll   – offer an "all months" choice (value '')
 *   allLabel   – its wording (default "All months")
 *   className  – extra classes on the wrapper
 */
export default function MonthPicker({ value, onChange, allowAll = false, allLabel = 'All months', className = '' }) {
  const current = thisMonth();
  const [curYear] = current.split('-').map(Number);
  const years = [];
  for (let y = curYear + 1; y >= 2015; y--) years.push(y);

  const [year, month] = value ? value.split('-') : ['', ''];

  function change(nextYear, nextMonth) {
    // "All months" is an empty month, whatever year was showing.
    if (allowAll && !nextMonth) return onChange('');
    if (!nextYear && !nextMonth) return onChange('');
    const y = nextYear || String(curYear);
    const m = nextMonth || current.slice(5, 7);
    onChange(`${y}-${m}`);
  }

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <select
        className="input py-2 text-sm w-36"
        value={month}
        onChange={(e) => change(year, e.target.value)}
        aria-label="Month"
      >
        {allowAll && <option value="">{allLabel}</option>}
        {!allowAll && !month && <option value="" disabled>Month</option>}
        {MONTHS.map((name, i) => (
          <option key={name} value={String(i + 1).padStart(2, '0')}>{name}</option>
        ))}
      </select>
      <select
        className="input py-2 text-sm w-24"
        value={year}
        onChange={(e) => change(e.target.value, month)}
        aria-label="Year"
        disabled={allowAll && !month}
      >
        {allowAll && !month && <option value="">—</option>}
        {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
      </select>
    </div>
  );
}
