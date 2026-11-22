import { pingDatabase } from "@/server/dal/health";

// Called by a scheduled GitHub Actions workflow so the Supabase Free project never sits idle long enough to pause.
export async function GET() {
  try {
    await pingDatabase();
    return Response.json({ status: "ok" });
  } catch {
    // Do not leak connection details on a public endpoint.
    return Response.json({ status: "error" }, { status: 503 });
  }
}
