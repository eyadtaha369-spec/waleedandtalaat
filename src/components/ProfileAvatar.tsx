import { useAuth } from "@/hooks/useAuth";

/**
 * Read-only profile photo. Students can no longer upload or change
 * their own avatar — the photo is set once, at import time, from the
 * roster sheet's "4x6 صورة شخصية" column.
 */
export function ProfileAvatar() {
  const { profile } = useAuth();

  return (
    <div className="shrink-0">
      <div className="size-16 overflow-hidden rounded-2xl border-gilded">
        {profile?.photo_url ? (
          <img src={profile.photo_url} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center bg-secondary text-xl font-bold">
            {(profile?.full_name || "?").charAt(0)}
          </div>
        )}
      </div>
    </div>
  );
}
