// Web-only. The backend's double-submit CSRF cookie (`csrf_token`, set
// alongside the httpOnly auth cookies — see `auth_service.set_auth_cookies`)
// is deliberately NOT httpOnly: the whole point is that JS reads it here and
// echoes it back as a header (`client.ts`), which a cross-site attacker
// can't do (same-origin policy blocks reading someone else's cookies), even
// though the browser auto-attaches the actual auth cookies to any request.
// Native never has this cookie at all — it isn't affected.
export function getCsrfToken(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const match = document.cookie.match(/(?:^|; )csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}
