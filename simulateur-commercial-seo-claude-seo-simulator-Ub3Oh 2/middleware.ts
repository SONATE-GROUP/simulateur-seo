export { default } from 'next-auth/middleware';

export const config = {
  matcher: [
    '/((?!login|register|invite|reset-password|api/auth|api/register|api/invitations|_next|favicon.ico|logo-sonate.png).*)',
  ],
};
