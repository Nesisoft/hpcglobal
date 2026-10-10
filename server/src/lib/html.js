/**
 * Escape a value for interpolation into HTML.
 *
 * Outgoing email is assembled by string concatenation, and the values come from
 * whatever a registrant typed into a public form. Without this, a name
 * containing markup lands inside the message — harmless in a self-addressed
 * confirmation, not harmless once the same merge runs across a mailing list.
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape for use inside a double-quoted HTML attribute. */
const escapeAttr = escapeHtml;

module.exports = { escapeHtml, escapeAttr };
