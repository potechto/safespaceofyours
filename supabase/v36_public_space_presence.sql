-- V36 Public Space active presence
-- Adds backend-backed last_seen_at heartbeat and exposes is_active to posts, comments, session, and Registered Users.

begin;

alter table public.public_space_users
  add column if not exists last_seen_at timestamptz;


update public.public_space_users u
set badge_label = cleaned.badge_label
from (
  select
    id,
    nullif(
      string_agg(
        case
          when lower(trim(label)) = 'beta tester' then 'tester'
          else trim(label)
        end,
        ', '
        order by ord
      ),
      ''
    ) as badge_label
  from public.public_space_users
  cross join lateral unnest(string_to_array(coalesce(badge_label, ''), ',')) with ordinality as labels(label, ord)
  where trim(label) <> ''
  group by id
) cleaned
where cleaned.id = u.id
  and coalesce(u.badge_label, '') ~* '(^|,\s*)beta tester(\s*,|$)';

create or replace function public.public_space_is_active(input_last_seen_at timestamptz)
returns boolean
language sql
stable
as $$
  select input_last_seen_at is not null
    and input_last_seen_at >= now() - interval '2 minutes';
$$;

create or replace function public.touch_public_space_presence(input_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  active_user public.public_space_users;
begin
  active_user := public.public_space_current_user(input_session_token);

  if active_user.id is null then
    return jsonb_build_object('ok', false);
  end if;

  update public.public_space_users
  set last_seen_at = now()
  where id = active_user.id
  returning * into active_user;

  return jsonb_build_object(
    'ok', true,
    'user', jsonb_build_object(
      'id', active_user.id,
      'username', active_user.username,
      'is_admin', active_user.is_admin,
      'is_premium', active_user.is_premium,
      'badge_label', active_user.badge_label,
      'is_disabled', active_user.is_disabled,
      'created_at', active_user.created_at,
      'last_seen_at', active_user.last_seen_at,
      'is_active', public.public_space_is_active(active_user.last_seen_at)
    )
  );
end;
$$;

create or replace function public.register_public_space_user(
  input_username text,
  input_password text,
  input_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  clean_username text := public.public_space_normalize_username(input_username);
  new_user public.public_space_users;
  raw_token text;
  session_expiry timestamptz := now() + interval '30 days';
begin
  if clean_username !~ '^[a-z0-9_]{3,15}$' then
    raise exception 'Username must be 3 to 15 characters using letters, numbers, and underscore only.';
  end if;

  if char_length(coalesce(input_password, '')) < 6 or char_length(coalesce(input_password, '')) > 8 then
    raise exception 'Password must be 6 to 8 characters.';
  end if;

  if coalesce(input_pin, '') !~ '^[0-9]{4}$' then
    raise exception 'PIN/key must be exactly 4 numbers.';
  end if;

  insert into public.public_space_users (username, password_hash, pin_hash, last_seen_at)
  values (
    clean_username,
    crypt(input_password, gen_salt('bf')),
    crypt(input_pin, gen_salt('bf')),
    now()
  )
  returning * into new_user;

  raw_token := encode(gen_random_bytes(32), 'hex');

  insert into public.public_space_sessions (user_id, token_hash, expires_at)
  values (new_user.id, public.public_space_hash_token(raw_token), session_expiry);

  return jsonb_build_object(
    'ok', true,
    'session_token', raw_token,
    'expires_at', session_expiry,
    'user', jsonb_build_object(
      'id', new_user.id,
      'username', new_user.username,
      'is_admin', new_user.is_admin,
      'is_premium', new_user.is_premium,
      'badge_label', new_user.badge_label,
      'is_disabled', new_user.is_disabled,
      'created_at', new_user.created_at,
      'last_seen_at', new_user.last_seen_at,
      'is_active', public.public_space_is_active(new_user.last_seen_at)
    )
  );
exception
  when unique_violation then
    raise exception 'Username is already taken.';
end;
$$;

create or replace function public.login_public_space_user(
  input_username text,
  input_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  clean_username text := public.public_space_normalize_username(input_username);
  found_user public.public_space_users;
  raw_token text;
  session_expiry timestamptz := now() + interval '30 days';
begin
  select *
  into found_user
  from public.public_space_users
  where username = clean_username
  limit 1;

  if found_user.id is null then
    raise exception 'Invalid username or password.';
  end if;

  if found_user.is_disabled then
    raise exception 'This account is disabled.';
  end if;

  if crypt(coalesce(input_password, ''), found_user.password_hash) <> found_user.password_hash then
    raise exception 'Invalid username or password.';
  end if;

  raw_token := encode(gen_random_bytes(32), 'hex');

  insert into public.public_space_sessions (user_id, token_hash, expires_at)
  values (found_user.id, public.public_space_hash_token(raw_token), session_expiry);

  update public.public_space_users
  set last_login_at = now(),
      last_seen_at = now()
  where id = found_user.id
  returning * into found_user;

  return jsonb_build_object(
    'ok', true,
    'session_token', raw_token,
    'expires_at', session_expiry,
    'user', jsonb_build_object(
      'id', found_user.id,
      'username', found_user.username,
      'is_admin', found_user.is_admin,
      'is_premium', found_user.is_premium,
      'badge_label', found_user.badge_label,
      'is_disabled', found_user.is_disabled,
      'created_at', found_user.created_at,
      'last_seen_at', found_user.last_seen_at,
      'is_active', public.public_space_is_active(found_user.last_seen_at)
    )
  );
end;
$$;

create or replace function public.get_public_space_session(input_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  active_user public.public_space_users;
begin
  active_user := public.public_space_current_user(input_session_token);

  if active_user.id is null then
    return jsonb_build_object('ok', false);
  end if;

  return jsonb_build_object(
    'ok', true,
    'user', jsonb_build_object(
      'id', active_user.id,
      'username', active_user.username,
      'is_admin', active_user.is_admin,
      'is_premium', active_user.is_premium,
      'badge_label', active_user.badge_label,
      'is_disabled', active_user.is_disabled,
      'created_at', active_user.created_at,
      'last_seen_at', active_user.last_seen_at,
      'is_active', public.public_space_is_active(active_user.last_seen_at)
    )
  );
end;
$$;

create or replace function public.list_public_space_posts(input_session_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  active_user public.public_space_users;
begin
  active_user := public.public_space_current_user(input_session_token);

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'body', p.body,
          'visibility', p.visibility,
          'is_hidden', p.is_hidden,
          'created_at', p.created_at,
          'updated_at', p.updated_at,
          'author', jsonb_build_object(
            'id', u.id,
            'username', u.username,
            'is_premium', u.is_premium,
            'badge_label', u.badge_label,
            'is_admin', u.is_admin,
            'last_seen_at', u.last_seen_at,
            'is_active', public.public_space_is_active(u.last_seen_at)
          ),
          'heart_count', (
            select count(*) from public.public_space_reactions r
            where r.post_id = p.id and r.reaction_type = 'heart'
          ),
          'comment_count', (
            select count(*) from public.public_space_comments c
            where c.post_id = p.id and c.is_deleted is false and c.is_hidden is false
          ),
          'hearted_by_me', exists (
            select 1 from public.public_space_reactions r
            where r.post_id = p.id and r.user_id = active_user.id and r.reaction_type = 'heart'
          ),
          'can_manage', (
            active_user.id = p.user_id or coalesce(active_user.is_admin, false)
          )
        )
        order by p.created_at desc
      )
      from public.public_space_posts p
      join public.public_space_users u on u.id = p.user_id
      where p.is_deleted is false
        and (
          p.visibility = 'public'
          or active_user.id = p.user_id
          or coalesce(active_user.is_admin, false)
        )
        and (
          p.is_hidden is false
          or coalesce(active_user.is_admin, false)
        )
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.list_public_space_comments(
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

  select *
  into target_post
  from public.public_space_posts
  where id = input_post_id
    and is_deleted is false;

  if target_post.id is null then
    raise exception 'Post not found.';
  end if;

  if target_post.visibility <> 'public'
    and (
      active_user.id is null
      or (
        active_user.id <> target_post.user_id
        and coalesce(active_user.is_admin, false) is false
      )
    ) then
    raise exception 'Not allowed.';
  end if;

  if target_post.is_hidden is true and coalesce(active_user.is_admin, false) is false then
    raise exception 'Post not found.';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'user_id', c.user_id,
          'post_id', c.post_id,
          'body', c.body,
          'is_hidden', c.is_hidden,
          'created_at', c.created_at,
          'updated_at', c.updated_at,
          'author', jsonb_build_object(
            'id', u.id,
            'username', u.username,
            'is_premium', u.is_premium,
            'badge_label', u.badge_label,
            'is_admin', u.is_admin,
            'last_seen_at', u.last_seen_at,
            'is_active', public.public_space_is_active(u.last_seen_at)
          ),
          'can_manage', (
            active_user.id = c.user_id
            or coalesce(active_user.is_admin, false)
          ),
          'can_hide', coalesce(active_user.is_admin, false),
          'can_edit', (
            coalesce(active_user.is_admin, false)
            or (
              active_user.id = c.user_id
              and c.is_hidden is false
              and c.is_deleted is false
              and c.created_at >= now() - interval '30 minutes'
            )
          )
        )
        order by c.created_at asc
      )
      from public.public_space_comments c
      join public.public_space_users u on u.id = c.user_id
      where c.post_id = input_post_id
        and c.is_deleted is false
        and (
          c.is_hidden is false
          or coalesce(active_user.is_admin, false)
        )
    ),
    '[]'::jsonb
  );
end;
$$;

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

  if active_user.id is null or active_user.is_admin is not true then
    raise exception 'Admin only.';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'username', username,
          'is_admin', is_admin,
          'is_premium', is_premium,
          'badge_label', badge_label,
          'is_disabled', is_disabled,
          'created_at', created_at,
          'last_login_at', last_login_at,
          'last_seen_at', last_seen_at,
          'is_active', public.public_space_is_active(last_seen_at)
        )
        order by created_at desc
      )
      from public.public_space_users
    ),
    '[]'::jsonb
  );
end;
$$;

grant execute on function public.public_space_is_active(timestamptz) to anon, authenticated;
grant execute on function public.touch_public_space_presence(text) to anon, authenticated;
grant execute on function public.register_public_space_user(text, text, text) to anon, authenticated;
grant execute on function public.login_public_space_user(text, text) to anon, authenticated;
grant execute on function public.get_public_space_session(text) to anon, authenticated;
grant execute on function public.list_public_space_posts(text) to anon, authenticated;
grant execute on function public.list_public_space_comments(text, uuid) to anon, authenticated;
grant execute on function public.list_public_space_users(text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;

select 'v36_public_space_presence_applied' as status;
