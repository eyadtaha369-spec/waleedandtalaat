import { useAuth } from "@/hooks/useAuth";
import { SmartAvatar } from "@/components/SmartAvatar";

/**
 * Read-only profile photo. Students can no longer upload or change
 * their own avatar — the photo is set once, at import time, from the
 * roster sheet's "4x6 صورة شخصية" column.
 */
export function ProfileAvatar() {
  const { profile } = useAuth();

  return (
    <div className="size-16 shrink-0 overflow-hidden rounded-2xl border-gilded">
      <SmartAvatar
        photoUrl={profile?.photo_url}
        name={profile?.full_name ?? ""}
        className="size-full text-xl"
      />
    </div>
  );
}
