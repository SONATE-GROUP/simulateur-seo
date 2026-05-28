export { default } from 'next-auth/middleware';

export const config = {
  matcher: [
    '/((?!login|register|api/auth|api/register|_next|favicon.ico|logo-sonate.png).*)',
  ],
};
