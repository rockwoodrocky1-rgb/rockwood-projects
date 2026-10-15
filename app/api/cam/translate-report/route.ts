import { camContext } from '@/cam/server/context';
import { endpoint, response } from "@/lib/server";
import {
  guard,
  readLimited,
  errorResponse,
  HttpError,
} from "@/cam/server/api";
import { translateReportContent } from "@/cam/server/translation";
export const runtime = "nodejs";
export const maxDuration = 180;
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return endpoint(async () => {
  await camContext(request, true);
  try {
    await guard(request);
    const bytes = await readLimited(request);
    let input: unknown;
    try {
      input = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new HttpError(400, "Invalid report input.");
    }
    return response(await translateReportContent(input));
  } catch (error) {
    return errorResponse(error);
  }
}); }
