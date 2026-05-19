import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const CAT_DOT = {
  SERVICE:    'bg-purple-brand',
  CONFERENCE: 'bg-gold',
  YOUTH:      'bg-green-500',
  WOMENS:     'bg-pink-500',
  MENS:       'bg-blue-500',
  ONLINE:     'bg-cyan-500',
  OTHER:      'bg-ink/30',
};

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

/**
 * Month-grid calendar of events.
 *
 * Props:
 *   events    – array with startDate + title + category
 *   onSelect  – (event) => void
 */
export default function EventCalendar({ events, onSelect }) {
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });

  const year  = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay   = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  function eventsOn(date) {
    return events.filter((e) => e.startDate && sameDay(new Date(e.startDate), date));
  }

  return (
    <div className="bg-white rounded-xl border border-purple-brand/8 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg text-ink font-light">
          {cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="p-1.5 rounded text-ink/40 hover:text-ink hover:bg-purple-brand/5 transition-colors"
            title="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => { const n = new Date(); setCursor(new Date(n.getFullYear(), n.getMonth(), 1)); }}
            className="px-3 py-1 rounded text-xs font-body text-ink/60 hover:bg-purple-brand/5 transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="p-1.5 rounded text-ink/40 hover:text-ink hover:bg-purple-brand/5 transition-colors"
            title="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-[10px] font-body font-semibold uppercase tracking-wider text-ink/40 py-2">
            {w}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={`empty-${i}`} className="min-h-[88px]" />;
          const dayEvents = eventsOn(date);
          const isToday = sameDay(date, today);
          return (
            <div
              key={date.toISOString()}
              className={`min-h-[88px] rounded-lg border p-1.5 ${
                isToday ? 'border-gold bg-gold/5' : 'border-purple-brand/8'
              }`}
            >
              <p className={`text-[11px] font-body mb-1 ${isToday ? 'text-gold font-semibold' : 'text-ink/50'}`}>
                {date.getDate()}
              </p>
              <div className="space-y-1">
                {dayEvents.slice(0, 3).map((e) => (
                  <button
                    key={e.id}
                    onClick={() => onSelect(e)}
                    className="w-full flex items-center gap-1 text-left px-1 py-0.5 rounded hover:bg-purple-brand/5 transition-colors"
                    title={e.title}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${CAT_DOT[e.category] ?? CAT_DOT.OTHER}`} />
                    <span className="text-[10px] text-ink/70 truncate">{e.title}</span>
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <p className="text-[9px] text-ink/40 px-1">+{dayEvents.length - 3} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
