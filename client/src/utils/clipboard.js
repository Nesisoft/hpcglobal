/**
 * Copy text to the clipboard, reporting whether it worked.
 *
 * navigator.clipboard only exists in a secure context, so it is missing on any
 * plain-http preview or LAN address. The execCommand fallback is deprecated
 * but still works everywhere, and a copy button that silently does nothing is
 * worse than a deprecated API.
 *
 * @returns {Promise<boolean>} true when the text reached the clipboard.
 */
export async function copyText(text) {
  const value = String(text ?? '');
  if (!value) return false;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Permission denied or no user gesture — fall through and try the old way.
    }
  }

  try {
    const area = document.createElement('textarea');
    area.value = value;
    // Keep it off-screen and unfocusable-looking so the page does not jump.
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
