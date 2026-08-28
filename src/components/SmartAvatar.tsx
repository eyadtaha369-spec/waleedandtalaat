import { useEffect, useState } from "react";
import { photoCandidates } from "@/lib/driveImage";

/**
 * Renders a student/guest photo with automatic fallback: tries each
 * Drive hotlink format in turn, and shows an initial instead of a
 * broken-image icon if every candidate fails.
 */
export function SmartAvatar({
  photoUrl,
  name,
  className,
}: {
  photoUrl: string | null | undefined;
  name: string;
  className?: string;
}) {
  const candidates = photoUrl ? photoCandidates(photoUrl) : [];
  const [index, setIndex] = useState(0);

  useEffect(() => setIndex(0), [photoUrl]);

  const src = candidates[index];
  const initial = (name || "?").charAt(0);

  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-secondary font-bold ${className ?? ""}`}>
        {initial}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      className={`object-cover ${className ?? ""}`}
      onError={() => setIndex((i) => i + 1)}
    />
  );
}
