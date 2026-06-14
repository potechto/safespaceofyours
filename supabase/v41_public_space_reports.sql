-- V41 Public Space reports backend
-- Purpose:
-- 1. Allow logged-in users to report public-space posts.
-- 2. Give admins a real report queue.
-- 3. Let admins resolve/dismiss reports and optionally hide/delete linked posts.

begin;

create extension if not exists pgcrypto;

create table if not exists public.public_space_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.public_space_posts(id) on delete cascade,
  reporter_user_id uuid not null references public.public_space_users(id) on delete cascade,
  reported_user_id uuid references public.public_space_users(id) on delete set null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  admin_user_id uuid references public.public_space_users(id) on delete set null,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists public_space_reports_post_id_idx
on public.public_space_reports (post_id);

create index if not exists public_space_reports_reporter_user_id_idx
on public.public_space_reports (reporter_user_id);

create index if not exists public_space_reports_status_created_at_idx
on public.public_space_reports (status, created_at desc);

create unique index if not exists public_space_reports_one_pending_user_post_idx
on public.public_space_reports (post_id, reporter_user_id)
where status = 'pending';

drop trigger if exists set_public_space_reports_updated_at on public.public_space_reports;
create trigger set_public_space_reports_updated_at
before update on public.public_space_reports
for each row
execute function public.set_updated_at();

alter table public.public_space_reports enable row level security;

drop policy if exists "Admins can read public space reports" on public.public_space_reports;
drop policy if exists "Admins can manage public space reports" on public.public_space_reports;

create policy "Admins can read public space reports"
on public.public_space_reports
for select
to authenticated
using (public.is_admin());

create policy "Admins can manage public space reports"
on public.public_space_reports
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke all on table public.public_space_reports from anon, authenticated;
grant select, insert, update on table public.public_space_reports to authenticated;

create or replace function public.report_public_space_post(
  input_session_token text,
  input_post_id uuid,
  input_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  active_user public.public_space_users;
  target_post public.public_space_posts;
  clean_reason text := nullif(trim(coalesce(input_reason, '')), '');
  saved_report public.public_space_reports;
begin
  active_user := public.public_space_current_user(input_session_token);

  if active_user.id is null then
    raise exception 'Login required.';
  end if;

  if coalesce(active_user.is_disabled, false) is true then
    raise exception 'Account disabled.';
  end if;

  if clean_reason is not null and char_length(clean_reason) > 600 then
    raise exception 'Report note must be 600 characters or less.';
  end if;

  select *
  into target_post
  from public.public_space_posts
  where id = input_post_id
    and is_deleted is false
  limit 1;

  if target_post.id is null then
    raise exception 'Post not found.';
  end if;

  if target_post.is_hidden is true and coalesce(active_user.is_admin, false) is false then
    raise exception 'Post not found.';
  end if;

  if target_post.visibility <> 'public'
    and target_post.user_id <> active_user.id
    and coalesce(active_user.is_admin, false) is false then
    raise exception 'Post not found.';
  end if;

  if target_post.user_id = active_user.id then
    raise exception 'You cannot report your own post.';
  end if;

  insert into public.public_space_reports (
    post_id,
    reporter_user_id,
    reported_user_id,
    reason
  )
  values (
    input_post_id,
    active_user.id,
    target_post.user_id,
    clean_reason
  )
  on conflict (post_id, reporter_user_id)
  where status = 'pending'
  do update
  set
    reason = coalesce(excluded.reason, public.public_space_reports.reason),
    updated_at = now()
  returning * into saved_report;

  insert into public.public_space_moderation_log (
    admin_user_id,
    action,
    target_type,
    target_id,
    details
  )
  values (
    null,
    'report_post',
    'post',
    input_post_id,
    jsonb_build_object(
      'report_id', saved_report.id,
      'reporter_user_id', active_user.id,
      'reported_user_id', target_post.user_id,
      'reason', clean_reason
    )
  );

  return jsonb_build_object(
    'ok', true,
    'report_id', saved_report.id,
    'status', saved_report.status,
    'message', 'Report sent to admin review.'
  );
end;
$$;

create or replace function public.list_public_space_reports(
  input_session_token text,
  input_status text default 'pending'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  active_user public.public_space_users;
  clean_status text := lower(trim(coalesce(input_status, 'pending')));
begin
  active_user := public.public_space_current_user(input_session_token);

  if active_user.id is null or coalesce(active_user.is_admin, false) is false then
    raise exception 'Admin only.';
  end if;

  if clean_status not in ('pending', 'resolved', 'dismissed', 'all') then
    clean_status := 'pending';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'post_id', r.post_id,
          'reason', r.reason,
          'status', r.status,
          'admin_note', r.admin_note,
          'created_at', r.created_at,
          'updated_at', r.updated_at,
          'resolved_at', r.resolved_at,
          'reporter', jsonb_build_object(
            'id', reporter.id,
            'username', reporter.username,
            'badge_label', reporter.badge_label,
            'is_admin', reporter.is_admin,
            'is_premium', reporter.is_premium,
            'is_disabled', reporter.is_disabled
          ),
          'reported_user', jsonb_build_object(
            'id', reported.id,
            'username', reported.username,
            'badge_label', reported.badge_label,
            'is_admin', reported.is_admin,
            'is_premium', reported.is_premium,
            'is_disabled', reported.is_disabled
          ),
          'post', jsonb_build_object(
            'id', p.id,
            'body', p.body,
            'visibility', p.visibility,
            'is_hidden', p.is_hidden,
            'is_deleted', p.is_deleted,
            'created_at', p.created_at,
            'updated_at', p.updated_at
          )
        )
        order by
          case when r.status = 'pending' then 0 else 1 end,
          r.created_at desc
      )
      from public.public_space_reports r
      join public.public_space_posts p on p.id = r.post_id
      left join public.public_space_users reporter on reporter.id = r.reporter_user_id
      left join public.public_space_users reported on reported.id = r.reported_user_id
      where clean_status = 'all'
        or r.status = clean_status
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.admin_update_public_space_report(
  input_session_token text,
  input_report_id uuid,
  input_status text,
  input_admin_note text default null,
  input_hide_post boolean default false,
  input_delete_post boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  active_user public.public_space_users;
  target_report public.public_space_reports;
  clean_status text := lower(trim(coalesce(input_status, '')));
  clean_note text := nullif(trim(coalesce(input_admin_note, '')), '');
begin
  active_user := public.public_space_current_user(input_session_token);

  if active_user.id is null or coalesce(active_user.is_admin, false) is false then
    raise exception 'Admin only.';
  end if;

  if clean_status not in ('pending', 'resolved', 'dismissed') then
    raise exception 'Invalid report status.';
  end if;

  if clean_note is not null and char_length(clean_note) > 600 then
    raise exception 'Admin note must be 600 characters or less.';
  end if;

  select *
  into target_report
  from public.public_space_reports
  where id = input_report_id
  limit 1;

  if target_report.id is null then
    raise exception 'Report not found.';
  end if;

  if input_delete_post is true then
    update public.public_space_posts
    set is_deleted = true,
        updated_at = now()
    where id = target_report.post_id;
  elsif input_hide_post is true then
    update public.public_space_posts
    set is_hidden = true,
        updated_at = now()
    where id = target_report.post_id;
  end if;

  update public.public_space_reports
  set
    status = clean_status,
    admin_user_id = active_user.id,
    admin_note = clean_note,
    resolved_at = case when clean_status in ('resolved', 'dismissed') then now() else null end,
    updated_at = now()
  where id = input_report_id
  returning * into target_report;

  insert into public.public_space_moderation_log (
    admin_user_id,
    action,
    target_type,
    target_id,
    details
  )
  values (
    active_user.id,
    'admin_update_report',
    'report',
    input_report_id,
    jsonb_build_object(
      'status', clean_status,
      'post_id', target_report.post_id,
      'hide_post', coalesce(input_hide_post, false),
      'delete_post', coalesce(input_delete_post, false),
      'admin_note', clean_note
    )
  );

  return jsonb_build_object(
    'ok', true,
    'report_id', target_report.id,
    'status', target_report.status,
    'message', 'Report updated.'
  );
end;
$$;

grant execute on function public.report_public_space_post(text, uuid, text) to anon, authenticated;
grant execute on function public.list_public_space_reports(text, text) to anon, authenticated;
grant execute on function public.admin_update_public_space_report(text, uuid, text, text, boolean, boolean) to anon, authenticated;

notify pgrst, 'reload schema';

select
  'v41_public_space_reports_ready' as status,
  count(*) as total_reports
from public.public_space_reports;

commit;
