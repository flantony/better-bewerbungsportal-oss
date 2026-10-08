// ============================================================
// Proxy — derzeit ohne Zugriffsschutz
// ============================================================
// Was die Webapp hier ausliefert (Bundeswehr-Ausschreibungen) ist öffentlich -
// derselbe Bestand, den der MCP-Server ohne Anmeldung herausgibt. Kontodaten
// schützt nicht dieser Proxy, sondern die Cloud Functions, die vor jedem
// Zugriff das Firebase-ID-Token prüfen (die Firestore-Rules für `konten/**`
// sind deny-all). Ein Login-Gate hier wäre reine Kulisse.
//
// Die Datei bleibt bestehen, weil `x-pathname` weiterhin gebraucht wird:
// Server Components haben sonst keinen Zugriff auf die aktuelle URL.
// ============================================================

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/dashboard/:path*']
};
