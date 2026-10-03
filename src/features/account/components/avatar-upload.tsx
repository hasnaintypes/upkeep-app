"use client";

import { useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/toast";
import { createClient } from "@/lib/supabase/client";
import { updateProfile } from "@/features/auth/lib/actions";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

/**
 * Profile photo upload for the settings dialog's Account section. Uploads directly from the
 * browser to the `avatars` Storage bucket (not through a Server Action -- a `File` from
 * `<input type="file">` is a browser-only object, and proxying binary data through a server
 * action would just add a hop for no benefit; this is Supabase's own documented direct-upload
 * pattern) at a fixed `<user_id>/avatar.<ext>` path with `upsert: true`, so re-uploading
 * replaces the previous photo instead of accumulating orphaned files. The bucket's own RLS
 * (supabase/migrations/*_create_avatars_bucket.sql) is what actually enforces a user can only
 * write their own folder -- the `userId` prop here is just for building the path, not a trust
 * boundary itself. `?t=<timestamp>` cache-busts the public URL so a changed photo doesn't keep
 * showing a browser/CDN-cached old one at the same path.
 */
export function AvatarUpload({
  userId,
  avatarUrl,
  fallback,
  onUploaded,
}: {
  userId: string;
  avatarUrl: string | null;
  fallback: string;
  onUploaded: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Allows re-selecting the exact same file later (the browser otherwise suppresses a second
    // "change" event for an identical selection).
    e.target.value = "";
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      notify.error("Couldn't upload photo", "Use a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      notify.error("Couldn't upload photo", "Must be 10MB or smaller.");
      return;
    }

    setIsUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${userId}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { cacheControl: "3600", upsert: true });
      if (uploadError) {
        notify.error("Couldn't upload photo", uploadError.message);
        return;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${publicUrl}?t=${Date.now()}`;

      const { error } = await updateProfile({ avatar_url: url });
      if (error) {
        notify.error("Couldn't save photo", error.message);
        return;
      }

      onUploaded(url);
      notify.success("Profile photo updated");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Avatar className="size-12">
        {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
        <AvatarFallback className="text-base">{fallback}</AvatarFallback>
      </Avatar>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
      >
        {isUploading ? "Uploading..." : "Change photo"}
      </Button>
    </div>
  );
}
