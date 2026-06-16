import { getDashboardSnapshot } from "@/lib/store";

export async function GET() {
  return Response.json(await getDashboardSnapshot(), {
    headers: {
      "Cache-Control": "no-store, max-age=0"
    }
  });
}
