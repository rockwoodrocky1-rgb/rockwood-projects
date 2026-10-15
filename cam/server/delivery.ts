import { createClient } from "@supabase/supabase-js";
import { HttpError } from "./api";
export async function memberClient(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !authorization.startsWith("Bearer "))
    throw new HttpError(401, "Sign in to view this report.");
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: authorization },
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }),
    },
  });
  const { data, error } = await client.auth.getUser(authorization.slice(7));
  if (
    error ||
    !data.user ||
    (!data.user.email_confirmed_at && !data.user.is_anonymous)
  )
    throw new HttpError(401, "Sign in again to view this report.");
  return { client, userId: data.user.id };
}
