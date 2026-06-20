-- V51 Public Space permissions foundation
-- Adds backend-enforced capability storage for Moderator/Admin-style delegated powers.
-- Apply this before relying on the Registered Users permission checklist.

begin;

create table if not exists public.public_space_user_permissions (
  user_id uuid primary key references public.public_space_users(id) on delete cascade,
  permissions text[] not null default '{}'::text[],
  updated_by uuid references public.public_space_users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint public_space_user_permissions_allowed_check check (
    permissions <@ array[
      'delete_post',
      'pin_post',
      'hide_post',
      'delete_comment',
      'edit_comment',
      'manage_reports',
      'reset_password',
      'reset_pin',
      'disable_user',
      'manage_badges',
      'manage_private_settings'
    ]::text[]
  )
);

create index if not exists public_space_user_permissions_gin_idx
on public.public_space_user_permissions using gin (permissions);

alter table public.public_space_user_permissions enable row level security;
revoke all on table public.public_space_user_permissions from anon, authenticated;

drop function if exists public.public_space_permission_array(jsonb);
create or replace function public.public_space_permission_array(input_permissions jsonb)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(distinct clean_permission order by clean_permission), '{}'::text[])
  from (
    select lower(regexp_replace(value, '[^a-z0-9_]+', '_', 'g')) as clean_permission
    from jsonb_array_elements_text(coalesce(input_permissions, '[]'::jsonb)) as value
  ) p
  where clean_permission = any(array[
    'delete_post',
    'pin_post',
    'hide_post',
    'delete_comment',
    'edit_comment',
    'manage_reports',
    'reset_password',
    'reset_pin',
    'disable_user',
    'manage_badges',
    'manage_private_settings'
  ]::text[]);
$$;

drop function if exists public.public_space_user_can(uuid, text);
create or replace function public.public_space_user_can(input_user_id uuid, input_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce((
    select u.is_admin is true
      or lower(trim(coalesce(input_permission, ''))) = any(coalesce(p.permissions, '{}'::text[]))
    from public.public_space_users u
    left join public.public_space_user_permissions p on p.user_id = u.id
    where u.id = input_user_id
      and u.is_disabled is false
    limit 1
  ), false);
$$;

drop function if exists public.public_space_current_user_can(text, text);
create or replace function public.public_space_current_user_can(input_session_token text, input_permission text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  active_user public.public_space_users;
begin
  active_user := public.public_space_current_user(input_session_token);
  if active_user.id is null then
    return false;
  end if;

  return public.public_space_user_can(active_user.id, input_permission);
end;
$$;

drop function if exists public.list_public_space_users(text);
create or replace function public.list_public_space_users(input_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  active_user public.public_space_users;
begin
  active_user := public.public_space_current_user(input_session_token);

  if active_user.id is null or public.public_space_user_can(active_user.id, 'manage_badges') is not true then
    raise exception 'Admin only.';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', u.id,
          'username', u.username,
          'is_admin', u.is_admin,
          'is_premium', u.is_premium,
          'badge_label', u.badge_label,
          'is_disabled', u.is_disabled,
          'created_at', u.created_at,
          'last_login_at', u.last_login_at,
          'last_seen_at', u.last_seen_at,
          'is_active', public.public_space_is_active(u.last_seen_at),
          'permissions', coalesce(p.permissions, '{}'::text[])
        )
        order by u.created_at desc
      )
      from public.public_space_users u
      left join public.public_space_user_permissions p on p.user_id = u.id
    ),
    '[]'::jsonb
  );
end;
$$;

drop function if exists public.admin_update_public_space_user(text, uuid, boolean, text, boolean, text);
drop function if exists public.admin_update_public_space_user(text, uuid, boolean, text, boolean, text, text);
drop function if exists public.admin_update_public_space_user(text, uuid, boolean, text, boolean, text, text, jsonb);

create or replace function public.admin_update_public_space_user(
  input_session_token text,
  input_user_id uuid,
  input_is_premium boolean default null,
  input_badge_label text default null,
  input_is_disabled boolean default null,
  input_new_password text default null,
  input_new_pin text default null,
  input_permissions jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  active_user public.public_space_users;
  updated_count integer := 0;
  next_permissions text[] := null;
begin
  active_user := public.public_space_current_user(input_session_token);

  if active_user.id is null then
    raise exception 'Admin only.';
  end if;

  if input_badge_label is not null and public.public_space_user_can(active_user.id, 'manage_badges') is not true then
    raise exception 'Missing manage_badges permission.';
  end if;

  if input_is_premium is not null and public.public_space_user_can(active_user.id, 'manage_badges') is not true then
    raise exception 'Missing manage_badges permission.';
  end if;

  if input_permissions is not null and public.public_space_user_can(active_user.id, 'manage_badges') is not true then
    raise exception 'Missing manage_badges permission.';
  end if;

  if input_is_disabled is not null and public.public_space_user_can(active_user.id, 'disable_user') is not true then
    raise exception 'Missing disable_user permission.';
  end if;

  if input_new_password is not null and public.public_space_user_can(active_user.id, 'reset_password') is not true then
    raise exception 'Missing reset_password permission.';
  end if;

  if input_new_pin is not null and public.public_space_user_can(active_user.id, 'reset_pin') is not true then
    raise exception 'Missing reset_pin permission.';
  end if;

  if input_user_id is null then
    raise exception 'User is required.';
  end if;

  if input_new_password is not null and (char_length(coalesce(input_new_password, '')) < 6 or char_length(coalesce(input_new_password, '')) > 8) then
    raise exception 'New password must be 6 to 8 characters.';
  end if;

  if input_new_pin is not null and coalesce(input_new_pin, '') !~ '^[0-9]{4}$' then
    raise exception 'New PIN/key must be exactly 4 numbers.';
  end if;

  if input_badge_label is not null and char_length(trim(input_badge_label)) > 120 then
    raise exception 'Badge label is too long.';
  end if;

  if input_permissions is not null then
    next_permissions := public.public_space_permission_array(input_permissions);
  end if;

  update public.public_space_users
  set
    is_premium = case
      when input_badge_label is not null then coalesce(input_badge_label, '') ~* '(^|,\s*)premium(\s*,|$)'
      when input_is_premium is not null then input_is_premium
      else is_premium
    end,
    badge_label = case
      when input_badge_label is null then badge_label
      when trim(input_badge_label) = '' then null
      else trim(input_badge_label)
    end,
    is_disabled = coalesce(input_is_disabled, is_disabled),
    password_hash = case
      when input_new_password is null then password_hash
      else crypt(input_new_password, gen_salt('bf'))
    end,
    pin_hash = case
      when input_new_pin is null then pin_hash
      else crypt(input_new_pin, gen_salt('bf'))
    end
  where id = input_user_id;

  get diagnostics updated_count = row_count;

  if updated_count = 0 then
    raise exception 'User not found.';
  end if;

  if input_permissions is not null then
    insert into public.public_space_user_permissions (user_id, permissions, updated_by, updated_at)
    values (input_user_id, coalesce(next_permissions, '{}'::text[]), active_user.id, now())
    on conflict (user_id)
    do update set permissions = excluded.permissions,
                  updated_by = excluded.updated_by,
                  updated_at = now();
  end if;

  if input_new_password is not null or input_new_pin is not null or input_is_disabled is true then
    delete from public.public_space_sessions
    where user_id = input_user_id;
  end if;

  insert into public.public_space_moderation_log (admin_user_id, action, target_type, target_id, details)
  values (
    active_user.id,
    'admin_update_user',
    'user',
    input_user_id,
    jsonb_build_object(
      'is_premium', input_is_premium,
      'premium_from_badge', input_badge_label is not null and coalesce(input_badge_label, '') ~* '(^|,\s*)premium(\s*,|$)',
      'badge_label_changed', input_badge_label is not null,
      'permissions_changed', input_permissions is not null,
      'permissions', coalesce(to_jsonb(next_permissions), 'null'::jsonb),
      'is_disabled', input_is_disabled,
      'password_reset', input_new_password is not null,
      'pin_reset', input_new_pin is not null
    )
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_set_public_space_post_hidden(
  input_session_token text,
  input_post_id uuid,
  input_is_hidden boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  active_user public.public_space_users;
begin
  active_user := public.public_space_current_user(input_session_token);

  if active_user.id is null or public.public_space_user_can(active_user.id, 'hide_post') is not true then
    raise exception 'Missing hide_post permission.';
  end if;

  update public.public_space_posts
  set is_hidden = input_is_hidden
  where id = input_post_id;

  insert into public.public_space_moderation_log (admin_user_id, action, target_type, target_id, details)
  values (
    active_user.id,
    case when input_is_hidden then 'hide_post' else 'unhide_post' end,
    'post',
    input_post_id,
    jsonb_build_object('is_hidden', input_is_hidden)
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.delete_public_space_post(
  input_session_token text,
  input_post_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  active_user public.public_space_users;
  target_post public.public_space_posts;
begin
  active_user := public.public_space_current_user(input_session_token);

  if active_user.id is null then
    raise exception 'Login required.';
  end if;

  select * into target_post from public.public_space_posts where id = input_post_id;

  if target_post.id is null then
    raise exception 'Post not found.';
  end if;

  if active_user.id <> target_post.user_id and public.public_space_user_can(active_user.id, 'delete_post') is not true then
    raise exception 'Missing delete_post permission.';
  end if;

  update public.public_space_posts
  set is_deleted = true
  where id = input_post_id;

  if active_user.id <> target_post.user_id then
    insert into public.public_space_moderation_log (admin_user_id, action, target_type, target_id, details)
    values (active_user.id, 'delete_post', 'post', input_post_id, jsonb_build_object('post_owner_id', target_post.user_id));
  end if;

  return jsonb_build_object('ok', true);
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

  if active_user.id is null or public.public_space_user_can(active_user.id, 'manage_reports') is not true then
    raise exception 'Missing manage_reports permission.';
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

  if active_user.id is null or public.public_space_user_can(active_user.id, 'manage_reports') is not true then
    raise exception 'Missing manage_reports permission.';
  end if;

  if coalesce(input_hide_post, false) is true and public.public_space_user_can(active_user.id, 'hide_post') is not true then
    raise exception 'Missing hide_post permission.';
  end if;

  if coalesce(input_delete_post, false) is true and public.public_space_user_can(active_user.id, 'delete_post') is not true then
    raise exception 'Missing delete_post permission.';
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

create or replace function public.delete_public_space_comment(
  input_session_token text,
  input_comment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  active_user public.public_space_users;
  target_comment public.public_space_comments;
begin
  active_user := public.public_space_current_user(input_session_token);

  if active_user.id is null then
    raise exception 'Login required.';
  end if;

  select *
  into target_comment
  from public.public_space_comments
  where id = input_comment_id
    and is_deleted is false;

  if target_comment.id is null then
    raise exception 'Comment not found.';
  end if;

  if active_user.id <> target_comment.user_id and public.public_space_user_can(active_user.id, 'delete_comment') is not true then
    raise exception 'Missing delete_comment permission.';
  end if;

  update public.public_space_comments
  set is_deleted = true,
      updated_at = now()
  where id = input_comment_id;

  if active_user.id <> target_comment.user_id then
    insert into public.public_space_moderation_log (admin_user_id, action, target_type, target_id, details)
    values (
      active_user.id,
      'delete_comment',
      'comment',
      input_comment_id,
      jsonb_build_object('post_id', target_comment.post_id, 'comment_owner_id', target_comment.user_id)
    );
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.edit_public_space_comment(
  input_session_token text,
  input_comment_id uuid,
  input_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  active_user public.public_space_users;
  target_comment public.public_space_comments;
  target_post public.public_space_posts;
  clean_body text := trim(coalesce(input_body, ''));
  is_admin_edit boolean := false;
begin
  active_user := public.public_space_current_user(input_session_token);

  if active_user.id is null then
    raise exception 'Login required.';
  end if;

  if char_length(clean_body) < 1 or char_length(clean_body) > 500 then
    raise exception 'Comment must be between 1 and 500 characters.';
  end if;

  select *
  into target_comment
  from public.public_space_comments
  where id = input_comment_id
    and is_deleted is false;

  if target_comment.id is null then
    raise exception 'Comment not found.';
  end if;

  is_admin_edit := active_user.id <> target_comment.user_id;

  if target_comment.user_id <> active_user.id and public.public_space_user_can(active_user.id, 'edit_comment') is not true then
    raise exception 'Missing edit_comment permission.';
  end if;

  if target_comment.is_hidden is true and target_comment.user_id <> active_user.id and public.public_space_user_can(active_user.id, 'edit_comment') is not true then
    raise exception 'Hidden comments cannot be edited.';
  end if;

  select *
  into target_post
  from public.public_space_posts
  where id = target_comment.post_id
    and is_deleted is false;

  if target_post.id is null then
    raise exception 'Post not found.';
  end if;

  if target_post.is_hidden is true and target_post.user_id <> active_user.id and public.public_space_user_can(active_user.id, 'edit_comment') is not true then
    raise exception 'Post not found.';
  end if;

  if target_post.visibility <> 'public'
    and target_post.user_id <> active_user.id
    and public.public_space_user_can(active_user.id, 'edit_comment') is not true then
    raise exception 'Not allowed.';
  end if;

  if target_comment.user_id = active_user.id
    and target_comment.created_at < now() - interval '30 minutes' then
    raise exception 'Comment can only be edited within 30 minutes.';
  end if;

  update public.public_space_comments
  set body = clean_body,
      updated_at = now()
  where id = input_comment_id
    and is_deleted is false;

  if not found then
    raise exception 'Comment could not be updated.';
  end if;

  if is_admin_edit then
    insert into public.public_space_moderation_log (admin_user_id, action, target_type, target_id, details)
    values (
      active_user.id,
      'admin_edit_comment',
      'comment',
      input_comment_id,
      jsonb_build_object(
        'post_id', target_comment.post_id,
        'comment_owner_id', target_comment.user_id,
        'old_body', target_comment.body,
        'new_body', clean_body
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'admin_edit', is_admin_edit
  );
end;
$$;

create or replace function public.admin_set_public_space_comment_hidden(
  input_session_token text,
  input_comment_id uuid,
  input_is_hidden boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  active_user public.public_space_users;
begin
  active_user := public.public_space_current_user(input_session_token);

  if active_user.id is null or public.public_space_user_can(active_user.id, 'delete_comment') is not true then
    raise exception 'Missing delete_comment permission.';
  end if;

  update public.public_space_comments
  set is_hidden = input_is_hidden,
      updated_at = now()
  where id = input_comment_id
    and is_deleted is false;

  insert into public.public_space_moderation_log (admin_user_id, action, target_type, target_id, details)
  values (
    active_user.id,
    case when input_is_hidden then 'hide_comment' else 'unhide_comment' end,
    'comment',
    input_comment_id,
    jsonb_build_object('is_hidden', input_is_hidden)
  );

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.public_space_permission_array(jsonb) to anon, authenticated;
grant execute on function public.public_space_user_can(uuid, text) to anon, authenticated;
grant execute on function public.public_space_current_user_can(text, text) to anon, authenticated;
grant execute on function public.list_public_space_users(text) to anon, authenticated;
grant execute on function public.admin_update_public_space_user(text, uuid, boolean, text, boolean, text, text, jsonb) to anon, authenticated;
grant execute on function public.admin_set_public_space_post_hidden(text, uuid, boolean) to anon, authenticated;
grant execute on function public.delete_public_space_post(text, uuid) to anon, authenticated;
grant execute on function public.list_public_space_reports(text, text) to anon, authenticated;
grant execute on function public.admin_update_public_space_report(text, uuid, text, text, boolean, boolean) to anon, authenticated;
grant execute on function public.delete_public_space_comment(text, uuid) to anon, authenticated;
grant execute on function public.edit_public_space_comment(text, uuid, text) to anon, authenticated;
grant execute on function public.admin_set_public_space_comment_hidden(text, uuid, boolean) to anon, authenticated;

notify pgrst, 'reload schema';

select
  'v51_public_space_permissions_ready' as status,
  count(*) as permission_rows
from public.public_space_user_permissions;

commit;
