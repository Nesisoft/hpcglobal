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

/**
 * How many SMS a message will be billed as.
 *
 * Mirrors smsSegments in server/src/services/sms.js so the count shown while
 * typing matches what is actually sent. GSM-7 fits 160 characters in one
 * segment; a single character outside it — a curly quote pasted from Word is
 * the usual culprit — drops every segment to 70.
 */
export function smsSegments(text) {
  const value = String(text ?? '');
  if (!value) return 0;
  const unicode = /[^\u0000-\u007F£¥èéùìòÇØøÅåÆæßÉ¤¡ÄÖÑÜ§¿äöñüà]/.test(value);
  const per = unicode ? 70 : 160;
  const perConcat = unicode ? 67 : 153;
  return value.length <= per ? 1 : Math.ceil(value.length / perConcat);
}

/** True when the text contains a character that forces the 70-per-segment limit. */
export function hasUnicodeSms(text) {
  return /[^\u0000-\u007F£¥èéùìòÇØøÅåÆæßÉ¤¡ÄÖÑÜ§¿äöñüà]/.test(String(text ?? ''));
}
