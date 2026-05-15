export function formatDate(date, opts = {}) {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...opts,
  }).format(new Date(date));
}

export function formatShortDate(date) {
  return formatDate(date, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatTime(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(date));
}

export function isUpcoming(date) {
  return new Date(date) > new Date();
}

export function isPast(date) {
  return new Date(date) < new Date();
}

export function readTime(content = '') {
  const words = content.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}
