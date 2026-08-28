/**
 * Roster sheets link photos as Google Drive "share" URLs
 * (drive.google.com/open?id=... or /file/d/<id>/view), which don't
 * render in a plain <img> tag. This rewrites them to a form Google
 * actually serves as an image. Non-Drive URLs pass through unchanged.
 */
export function normalizePhotoUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  const openMatch = trimmed.match(/drive\.google\.com\/open\?id=([\w-]+)/);
  const fileMatch = trimmed.match(/drive\.google\.com\/file\/d\/([\w-]+)/);
  const id = openMatch?.[1] ?? fileMatch?.[1];
  if (id) return `https://lh3.googleusercontent.com/d/${id}=s400`;

  return trimmed;
}
