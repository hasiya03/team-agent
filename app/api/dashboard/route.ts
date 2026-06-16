import { getDashboardSnapshot } from "@/lib/store";

export async function GET() {
  return Response.json(await getDashboardSnapshot());
}
