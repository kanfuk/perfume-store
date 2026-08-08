import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/admin-auth";
import { createAdminPaymentAccountService } from "@/services/adminPaymentAccountService";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getAuthenticatedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const context = await createAdminPaymentAccountService().getContext(admin);
    return NextResponse.json(context, {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch {
    return NextResponse.json(
      { error: "No fue posible comprobar la cuenta de cobro." },
      { status: 500 }
    );
  }
}
