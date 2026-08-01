import { readFile } from "node:fs/promises";
import path from "node:path";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export async function GET() {
  if (!(await isAdminAuthenticated())) return new Response("No autorizado.", { status: 401 });
  const report = await readFile(path.join(process.cwd(), "docs", "SMELLME_IMAGE_REVIEW_RECONCILIATION.md"), "utf8");
  return new Response(report, {
    headers: { "Cache-Control": "no-store", "Content-Type": "text/markdown; charset=utf-8" }
  });
}
