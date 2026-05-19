import DOMPurify from 'dompurify';

/**
 * Renders admin-authored rich text (HTML) safely.
 * Falls back to preserving line breaks for legacy plain-text content.
 */
export default function RichContent({ html, className = '' }) {
  if (!html) return null;

  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(html);
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h2', 'h3', 'blockquote', 'ul', 'ol', 'li', 'a', 'span'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  });

  if (!looksLikeHtml) {
    return <div className={`whitespace-pre-wrap ${className}`}>{html}</div>;
  }

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
