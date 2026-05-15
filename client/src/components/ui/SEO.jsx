import { Helmet } from 'react-helmet-async';

const SITE_NAME = 'HPC Global — Hopepress Chapel';
const DEFAULT_DESC = 'An Apostolic Prophetic Word-based ministry in Accra, Ghana. Join us in person or online for worship, teaching, and community.';
const DEFAULT_IMAGE = '/og-image.jpg';

export default function SEO({ title, description, image, noIndex }) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
  const desc = description || DEFAULT_DESC;
  const img  = image || DEFAULT_IMAGE;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      {noIndex && <meta name="robots" content="noindex,nofollow" />}

      {/* Open Graph */}
      <meta property="og:title"       content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:image"       content={img} />
      <meta property="og:type"        content="website" />
      <meta property="og:site_name"   content={SITE_NAME} />

      {/* Twitter */}
      <meta name="twitter:card"        content="summary_large_image" />
      <meta name="twitter:title"       content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image"       content={img} />
    </Helmet>
  );
}
