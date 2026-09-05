import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Pager for admin tables backed by a `{ rows, total }` endpoint.
 *
 * `total` is the server-side count for the *current filters*, not the number of
 * rows on screen — showing the range alongside it is what makes the difference
 * between "20 of 109" and a filter that looks broken.
 *
 * Props:
 *   page      – current 1-based page
 *   pageSize  – rows requested per page
 *   total     – total matching rows on the server
 *   onChange  – (nextPage) => void
 *   noun      – what the rows are, for the range label
 */
export default function AdminPagination({ page, pageSize, total, onChange, noun = 'records' }) {
  if (!total) return null;

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const first = (page - 1) * pageSize + 1;
  const last  = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
      <p className="text-xs text-ink/40 font-body">
        Showing {first}–{last} of {total} {noun}
        {totalPages > 1 && ` · Page ${page} of ${totalPages}`}
      </p>
      {totalPages > 1 && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onChange(page - 1)}
            disabled={page <= 1}
            className="btn-outline text-xs px-3 py-1.5 disabled:opacity-40"
          >
            <ChevronLeft size={13} /> Previous
          </button>
          <button
            type="button"
            onClick={() => onChange(page + 1)}
            disabled={page >= totalPages}
            className="btn-outline text-xs px-3 py-1.5 disabled:opacity-40"
          >
            Next <ChevronRight size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
