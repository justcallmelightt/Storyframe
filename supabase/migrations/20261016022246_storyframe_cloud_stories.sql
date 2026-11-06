create table if not exists public.storyframe_stories (
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id text not null check (char_length(story_id) between 1 and 80),
  title text not null check (char_length(title) <= 80),
  owner text not null default '' check (char_length(owner) <= 24),
  profile jsonb not null check (jsonb_typeof(profile) = 'object'),
  scenes jsonb not null check (
    case
      when jsonb_typeof(scenes) = 'array' then jsonb_array_length(scenes) between 1 and 30
      else false
    end
  ),
  updated_at timestamptz not null default now(),
  primary key (user_id, story_id)
);

alter table public.storyframe_stories enable row level security;
revoke all on public.storyframe_stories from anon, authenticated;
grant select, insert, update, delete on public.storyframe_stories to authenticated;

drop policy if exists "Storyframe users read their stories" on public.storyframe_stories;
create policy "Storyframe users read their stories"
on public.storyframe_stories for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Storyframe users create their stories" on public.storyframe_stories;
create policy "Storyframe users create their stories"
on public.storyframe_stories for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Storyframe users update their stories" on public.storyframe_stories;
create policy "Storyframe users update their stories"
on public.storyframe_stories for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Storyframe users delete their stories" on public.storyframe_stories;
create policy "Storyframe users delete their stories"
on public.storyframe_stories for delete to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('storyframe-assets', 'storyframe-assets', false, 10485760, array['image/webp'])
on conflict (id) do nothing;

drop policy if exists "Storyframe users read their story photos" on storage.objects;
create policy "Storyframe users read their story photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'storyframe-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Storyframe users upload their story photos" on storage.objects;
create policy "Storyframe users upload their story photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'storyframe-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Storyframe users update their story photos" on storage.objects;
create policy "Storyframe users update their story photos"
on storage.objects for update to authenticated
using (
  bucket_id = 'storyframe-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'storyframe-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Storyframe users delete their story photos" on storage.objects;
create policy "Storyframe users delete their story photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'storyframe-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
