import { NextResponse, type NextRequest } from "next/server";

// A visitor who chose Persian or Arabic (the sz-lang cookie)
// is sent to /fa or /ar instead, so the logo and "home" links keep their language. Search engines carry no cookie.
export function proxy(request: NextRequest) {
  const lang = request.cookies.get("sz-lang")?.value;
  if (lang !== "fa" && lang !== "ar") return;
  const url = request.nextUrl.clone();
  url.pathname = `/${lang}`;
  return NextResponse.redirect(url, 307);
}

export const config = { matcher: "/" };
