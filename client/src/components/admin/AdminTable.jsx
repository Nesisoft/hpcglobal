import Spinner from '../ui/Spinner';

/**
 * Reusable admin data table.
 *
 * Props:
 *   columns  – [{ key, label, width?, render?(row) => ReactNode }]
 *   rows     – array of data objects (each needs an `id`)
 *   loading  – show skeleton
 *   empty    – message when rows is empty
 *   onRow    – optional click handler per row
 */
export default function AdminTable({ columns, rows, loading, empty = 'No records found.', onRow }) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-purple-brand/8 overflow-hidden">
        <div className="divide-y divide-purple-brand/5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <div className="h-4 bg-purple-brand/6 rounded animate-pulse flex-1" />
              <div className="h-4 bg-purple-brand/6 rounded animate-pulse w-24" />
              <div className="h-4 bg-purple-brand/6 rounded animate-pulse w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-purple-brand/8 py-16 text-center">
        <p className="text-ink/35 font-body text-sm">{empty}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-purple-brand/8 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-body">
          <thead>
            <tr className="border-b border-purple-brand/8 bg-[#F9F8FC]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="text-left px-5 py-3 text-[11px] font-semibold text-ink/40 uppercase tracking-wider whitespace-nowrap"
                  style={col.width ? { width: col.width } : {}}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-purple-brand/5">
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => onRow?.(row)}
                className={`transition-colors ${onRow ? 'cursor-pointer hover:bg-[#F9F8FC]' : ''}`}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-5 py-3.5 text-ink/75 whitespace-nowrap">
                    {col.render ? col.render(row) : (row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
