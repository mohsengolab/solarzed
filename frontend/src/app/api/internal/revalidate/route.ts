import { revalidateTag } from "next/cache";
import { createHash, timingSafeEqual } from "node:crypto";

// Server-to-server hook: the API calls this after an administrator saves a product so cached
// catalog pages refresh immediately. Requires SOLARZED_REVALIDATE_SECRET (16+ chars) on both servers.
// This route takes precedence over the /api/* rewrite to the backend.
const digest = (v: string) => createHash("sha256").update(v).digest();

export async function POST(request: Request) {
  const secret = process.env.SOLARZED_REVALIDATE_SECRET ?? "";
  const given = request.headers.get("x-revalidate-secret") ?? "";
  if (secret.length < 16 || !timingSafeEqual(digest(secret), digest(given)))
    return Response.json({ error: "Not found" }, { status: 404 });
  revalidateTag("catalog", { expire: 0 });
  return Response.json({ revalidated: true }, { headers: { "Cache-Control": "no-store" } });
}
