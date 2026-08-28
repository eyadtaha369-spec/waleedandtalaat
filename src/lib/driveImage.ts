/**
 * Roster sheets link photos as Google Drive "share" URLs, which don't
 * render in a plain <img> tag, and Google's various hotlink formats
 * are inconsistently reliable (permissions, file type, rate limits).
 * Rather than committing to one format, we extract the file id and
 * hand back several candidates for <SmartImage> to try in order.
 */
export function extractDriveId(raw: string): string | null {
  const patterns = [
    /drive\.google\.com\/open\?id=([\w-]+)/,
    /drive\.google\.com\/file\/d\/([\w-]+)/,
    /drive\.google\.com\/thumbnail\?id=([\w-]+)/,
    /lh3\.googleusercontent\.com\/d\/([\w-]+)/,
  ];
  for (const p of patterns) {
    const m = raw.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** Ordered list of URLs worth trying for a stored photo_url value. */
export function photoCandidates(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const id = extractDriveId(trimmed);
  if (!id) return [trimmed];

  return [
    `https://drive.google.com/thumbnail?id=${id}&sz=w400`,
    `https://lh3.googleusercontent.com/d/${id}=s400`,
    `https://drive.google.com/uc?export=view&id=${id}`,
  ];
}

/** Best first guess to store on import — SmartImage retries the rest on failure. */
export function normalizePhotoUrl(raw: string): string {
  const candidates = photoCandidates(raw);
  return candidates[0] ?? raw.trim();
}
