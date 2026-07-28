import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const setPasswordUrl = new URL("/admin/set-password", request.url);

  if (!code) {
    return NextResponse.redirect(setPasswordUrl, { headers: NO_STORE_HEADERS });
  }

  try {
    const supabase = await createSupabaseAuthServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(setPasswordUrl, { headers: NO_STORE_HEADERS });
    }
  } catch {
    return NextResponse.redirect(setPasswordUrl, { headers: NO_STORE_HEADERS });
  }

  return NextResponse.redirect(setPasswordUrl, { headers: NO_STORE_HEADERS });
}
