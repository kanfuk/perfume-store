import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getImageAssistantHealth } from "@/lib/image-assistant/source-provider";

export async function GET() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  return NextResponse.json(getImageAssistantHealth(), { headers: { "Cache-Control": "no-store" } });
}
