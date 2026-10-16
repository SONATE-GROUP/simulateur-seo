import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/* Plus de comptes ni d'invitations dans le simulateur : on entre par le portail
   Ma Sonate (ticket signé, route /sso). /sso ouvre la session, il ne peut donc
   pas en exiger une : le ticket est sa garde. */
const PUBLIC_ROUTES = ['/login', '/sso'];

export async function middleware(request: NextRequest) {
  if (PUBLIC_ROUTES.some(route => request.nextUrl.pathname.startsWith(route))) {
    return NextResponse.next();
  }
  return updateSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|icon.svg|logo-sonate.png).*)'],
};
