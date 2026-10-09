/**
 * Turn admin-authored rich text into a one-line plain summary.
 *
 * Stripping tags with a regex leaves HTML entities behind, which is how
 * "The&nbsp;Visible&nbsp;Conference" ended up on screen. Parsing the markup and
 * reading its text content resolves entities and drops tags in one step.
 * DOMParser builds a detached document, so nothing in the markup runs.
 */
export function plainText(html) {
  if (!html) return '';
  const value = String(html);

  // No markup and no entities — nothing to decode.
  if (!/[<&]/.test(value)) return value.replace(/\s+/g, ' ').trim();

  try {
    const doc = new DOMParser().parseFromString(value, 'text/html');
    return (doc.body?.textContent ?? '').replace(/\s+/g, ' ').trim();
  } catch {
    // Pathological markup: fall back to the old behaviour rather than nothing.
    return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

/**
 * Event times are free text and the admin form's own hint suggests typing
 * "9:00 AM GMT", so appending the zone unconditionally produced "5:00 PM GMT GMT".
 */
export function withGmt(time) {
  const value = (time ?? '').trim();
  if (!value) return '';
  return /\bgmt\b/i.test(value) ? value : `${value} GMT`;
}
