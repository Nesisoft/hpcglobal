import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authLink } from '../../lib/supabase';

const SET_PASSWORD_PATH = '/partner/set-password';

/**
 * Makes sure an invite or password-reset email link always ends on the
 * set-password page. If Supabase won't accept our redirect it lands the partner
 * on the homepage instead, where the session is stored silently and they never
 * get to choose a password. A link Supabase rejected (expired, already used) is
 * sent there too, so the page can explain what went wrong.
 *
 * Renders nothing, and only looks at how this page load began — once.
 */
export default function PartnerAuthLinkRedirect() {
  const navigate     = useNavigate();
  const { pathname } = useLocation();
  const handled      = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    if (!authLink.type && !authLink.error) return;
    if (pathname === SET_PASSWORD_PATH) return;

    // Keep the hash: if supabase-js hasn't read the tokens yet it still finds
    // them, and it clears them itself once it has.
    navigate(
      { pathname: SET_PASSWORD_PATH, hash: window.location.hash },
      { replace: true, state: { linkError: authLink.error } },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
