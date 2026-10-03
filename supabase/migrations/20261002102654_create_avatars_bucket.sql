-- Profile photo upload (settings dialog Account section): a public "avatars" bucket, one file per
-- user at `avatars/<user_id>/<filename>` -- the user_id-prefixed path (not a `storage.objects.owner`
-- column, which has changed shape across Supabase versions) is what every RLS policy below scopes
-- on, via `storage.foldername(name)`, the documented stable pattern for user-scoped storage access.
--
-- Public (not signed-URL) read: an avatar isn't sensitive, and every other image this app serves
-- (none, today) would otherwise need its own signed-URL plumbing just to show a profile picture in
-- the sidebar/settings dialog. 10 MB limit + image-only MIME allowlist enforced at the bucket level
-- (defense in depth alongside the client-side `accept`/size check in AvatarUpload.tsx).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Public read -- matches the bucket's own `public = true`, but still needs an explicit policy:
-- `public` only controls whether `getPublicUrl()` URLs work without a signed token, RLS on
-- `storage.objects` is still enforced independently for every operation, select included.
create policy "avatars_select_all" on storage.objects
  for select
  using (bucket_id = 'avatars');

-- Insert/update/delete restricted to the caller's own folder (`<user_id>/...`) -- `with check`
-- here (not just `using`) is what actually stops a signed-in user from writing into someone
-- else's folder, and `select` (the policy above) is required alongside insert/update for the
-- client's `upsert: true` upload call to work at all (upsert re-selects the existing row first).
create policy "avatars_insert_own" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars_update_own" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars_delete_own" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
