/**
 * supabase-js wraps any non-2xx Edge Function response in a generic
 * "Edge Function returned a non-2xx status code" message, hiding the
 * actual { error: "..." } JSON body the function sent back. This pulls
 * the real message out of the response body when available.
 */
export async function edgeFunctionErrorMessage(
  error: unknown,
  fallback = "Something went wrong",
): Promise<string> {
  const withContext = error as { context?: Response; message?: string } | null;
  if (withContext?.context && typeof withContext.context.json === "function") {
    try {
      const body = await withContext.context.json();
      if (body && typeof body.error === "string") return body.error;
    } catch {
      // response wasn't JSON — fall through to the generic message
    }
  }
  return withContext?.message ?? fallback;
}
