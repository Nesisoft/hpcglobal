export function saveTokens({ accessToken, refreshToken }) {
  localStorage.setItem('hpc_access_token', accessToken);
  localStorage.setItem('hpc_refresh_token', refreshToken);
}

export function clearTokens() {
  localStorage.removeItem('hpc_access_token');
  localStorage.removeItem('hpc_refresh_token');
}

export function getAccessToken() {
  return localStorage.getItem('hpc_access_token');
}

export function decodeToken(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

export function isTokenExpired(token) {
  const decoded = decodeToken(token);
  if (!decoded?.exp) return true;
  return decoded.exp * 1000 < Date.now();
}
