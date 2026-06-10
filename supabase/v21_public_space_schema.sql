begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.public_space_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  pin_hash text not null,
  is_admin boolean not null default false,
  is_premium boolean not null default false,
  badge_label text,
  is_disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz,
  check (username ~ '^[a-z0-9_]{3,15}$'),
  check (badge_label is null or char_length(badge_label) <= 24)
);

create table if not exists public.public_space_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.public_space_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.public_space_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.public_space_users(id) on delete cascade,
  body text not null,
  visibility text not null default 'public',
  is_hidden boolean not null default false,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (visibility in ('public', 'private')),
  check (char_length(body) between 1 and 1000)
);

create table if not exists public.public_space_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.public_space_posts(id) on delete cascade,
  user_id uuid not null references public.public_space_users(id) on delete cascade,
  body text not null,
  is_hidden boolean not null default false,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(body) between 1 and 500)
);

create table if not exists public.public_space_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.public_space_posts(id) on delete cascade,
  user_id uuid not null references public.public_space_users(id) on delete cascade,
  reaction_type text not null default 'heart',
  created_at timestamptz not null default now(),
  unique (post_id, user_id, reaction_type),
  check (reaction_type = 'heart')
);

create table if not exists public.public_space_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.public_space_users(id) on delete cascade,
  actor_user_id uuid references public.public_space_users(id) on delete set null,
  post_id uuid references public.public_space_posts(id) on delete cascade,
  comment_id uuid references public.public_space_comments(id) on delete cascade,
  type text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  check (type in ('heart', 'comment', 'admin'))
);

create table if not exists public.public_space_moderation_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references public.public_space_users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists public_space_sessions_token_hash_idx on public.public_space_sessions(token_hash);
create index if not exists public_space_posts_created_at_idx on public.public_space_posts(created_at desc);
create index if not exists public_space_comments_post_id_idx on public.public_space_comments(post_id);
create index if not exists public_space_reactions_post_id_idx on public.public_space_reactions(post_id);
create index if not exists public_space_notifications_recipient_idx on public.public_space_notifications(recipient_user_id, is_read, created_at desc);

drop trigger if exists set_public_space_users_updated_at on public.public_space_users;
create trigger set_public_space_users_updated_at
before update on public.public_space_users
for each row execute function public.set_updated_at();

drop trigger if exists set_public_space_posts_updated_at on public.public_space_posts;
create trigger set_public_space_posts_updated_at
before update on public.public_space_posts
for each row execute function public.set_updated_at();

drop trigger if exists set_public_space_comments_updated_at on public.public_space_comments;
create trigger set_public_space_comments_updated_at
before update on public.public_space_comments
for each row execute function public.set_updated_at();

create or replace function public.public_space_normalize_username(input_username text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(coalesce(input_username, ''), '\s+', '', 'g'));
$$;

create or replace function public.public_space_hash_token(input_token text)
returns text
language sql
immutable
as $$
  select encode(digest(coalesce(input_token, ''), 'sha256'), 'hex');
$$;

create or replace function public.public_space_current_user(input_session_token text)
returns public.public_space_users
language plpgsql
security definer
set search_path = public
as $$
declare
  user_record public.public_space_users;
begin
  delete from public.public_space_sessions where expires_at <= now();

  select u.*
  into user_record
  from public.public_space_sessions s
  join public.public_space_users u on u.id = s.user_id
  where s.token_hash = public.public_space_hash_token(input_session_token)
    and s.expires_at > now()
    and u.is_disabled is false
  limit 1;

  return user_record;
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
set search_path = public
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

  insert into public.public_space_users (username, password_hash, pin_hash)
  values (
    clean_username,
    crypt(input_password, gen_salt('bf')),
    crypt(input_pin, gen_salt('bf'))
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
      'created_at', new_user.created_at
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
set search_path = public
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
  set last_login_at = now()
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
      'created_at', found_user.created_at
    )
  );
end;
$$;

create or replace function public.get_public_space_session(input_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
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
      'created_at', active_user.created_at
    )
  );
end;
$$;

create or replace function public.logout_public_space_user(input_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.public_space_sessions
  where token_hash = public.public_space_hash_token(input_session_token);

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.reset_public_space_password(
  input_username text,
  input_new_password text,
  input_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_username text := public.public_space_normalize_username(input_username);
  found_user public.public_space_users;
begin
  if char_length(coalesce(input_new_password, '')) < 6 or char_length(coalesce(input_new_password, '')) > 8 then
    raise exception 'New password must be 6 to 8 characters.';
  end if;

  if coalesce(input_pin, '') !~ '^[0-9]{4}$' then
    raise exception 'PIN/key must be exactly 4 numbers.';
  end if;

  select *
  into found_user
  from public.public_space_users
  where username = clean_username
  limit 1;

  if found_user.id is null then
    raise exception 'Invalid username or PIN/key.';
  end if;

  if crypt(coalesce(input_pin, ''), found_user.pin_hash) <> found_user.pin_hash then
    raise exception 'Invalid username or PIN/key.';
  end if;

  update public.public_space_users
  set password_hash = crypt(input_new_password, gen_salt('bf'))
  where id = found_user.id;

  delete from public.public_space_sessions
  where user_id = found_user.id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.create_public_space_post(
  input_session_token text,
  input_body text,
  input_visibility text default 'public'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  active_user public.public_space_users;
  new_post public.public_space_posts;
begin
  active_user := public.public_space_current_user(input_session_token);

  if active_user.id is null then
    raise exception 'Login required.';
  end if;

  if input_visibility not in ('public', 'private') then
    raise exception 'Invalid visibility.';
  end if;

  if char_length(trim(coalesce(input_body, ''))) < 1 or char_length(trim(coalesce(input_body, ''))) > 1000 then
    raise exception 'Post must be 1 to 1,000 characters.';
  end if;

  insert into public.public_space_posts (user_id, body, visibility)
  values (active_user.id, trim(input_body), input_visibility)
  returning * into new_post;

  return jsonb_build_object('ok', true, 'post_id', new_post.id);
end;
$$;

create or replace function public.list_public_space_posts(input_session_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
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
            'badge_label', u.badge_label
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

create or replace function public.delete_public_space_post(
  input_session_token text,
  input_post_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
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

  if active_user.id <> target_post.user_id and active_user.is_admin is not true then
    raise exception 'Not allowed.';
  end if;

  update public.public_space_posts
  set is_deleted = true
  where id = input_post_id;

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
set search_path = public
as $$
declare
  active_user public.public_space_users;
begin
  active_user := public.public_space_current_user(input_session_token);

  if active_user.id is null or active_user.is_admin is not true then
    raise exception 'Admin only.';
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

create or replace function public.toggle_public_space_heart(
  input_session_token text,
  input_post_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  active_user public.public_space_users;
  target_post public.public_space_posts;
  deleted_count integer := 0;
begin
  active_user := public.public_space_current_user(input_session_token);

  if active_user.id is null then
    raise exception 'Login required.';
  end if;

  select * into target_post
  from public.public_space_posts
  where id = input_post_id and is_deleted is false;

  if target_post.id is null then
    raise exception 'Post not found.';
  end if;

  delete from public.public_space_reactions
  where post_id = input_post_id
    and user_id = active_user.id
    and reaction_type = 'heart';

  get diagnostics deleted_count = row_count;

  if deleted_count = 0 then
    insert into public.public_space_reactions (post_id, user_id, reaction_type)
    values (input_post_id, active_user.id, 'heart');

    if target_post.user_id <> active_user.id then
      insert into public.public_space_notifications (recipient_user_id, actor_user_id, post_id, type)
      values (target_post.user_id, active_user.id, input_post_id, 'heart');
    end if;
  end if;

  return jsonb_build_object('ok', true, 'hearted', deleted_count = 0);
end;
$$;

create or replace function public.list_public_space_users(input_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
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
          'last_login_at', last_login_at
        )
        order by created_at desc
      )
      from public.public_space_users
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.admin_update_public_space_user(
  input_session_token text,
  input_user_id uuid,
  input_is_premium boolean default null,
  input_badge_label text default null,
  input_is_disabled boolean default null,
  input_new_password text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  active_user public.public_space_users;
begin
  active_user := public.public_space_current_user(input_session_token);

  if active_user.id is null or active_user.is_admin is not true then
    raise exception 'Admin only.';
  end if;

  update public.public_space_users
  set
    is_premium = coalesce(input_is_premium, is_premium),
    badge_label = case
      when input_badge_label is null then badge_label
      when trim(input_badge_label) = '' then null
      else left(trim(input_badge_label), 24)
    end,
    is_disabled = coalesce(input_is_disabled, is_disabled),
    password_hash = case
      when input_new_password is null or input_new_password = '' then password_hash
      when char_length(input_new_password) between 6 and 8 then crypt(input_new_password, gen_salt('bf'))
      else password_hash
    end
  where id = input_user_id;

  insert into public.public_space_moderation_log (admin_user_id, action, target_type, target_id, details)
  values (
    active_user.id,
    'admin_update_user',
    'user',
    input_user_id,
    jsonb_build_object(
      'is_premium', input_is_premium,
      'badge_label', input_badge_label,
      'is_disabled', input_is_disabled,
      'changed_password', input_new_password is not null and input_new_password <> ''
    )
  );

  return jsonb_build_object('ok', true);
end;
$$;

alter table public.public_space_users enable row level security;
alter table public.public_space_sessions enable row level security;
alter table public.public_space_posts enable row level security;
alter table public.public_space_comments enable row level security;
alter table public.public_space_reactions enable row level security;
alter table public.public_space_notifications enable row level security;
alter table public.public_space_moderation_log enable row level security;

revoke all on public.public_space_users from anon, authenticated;
revoke all on public.public_space_sessions from anon, authenticated;
revoke all on public.public_space_posts from anon, authenticated;
revoke all on public.public_space_comments from anon, authenticated;
revoke all on public.public_space_reactions from anon, authenticated;
revoke all on public.public_space_notifications from anon, authenticated;
revoke all on public.public_space_moderation_log from anon, authenticated;

grant usage on schema public to anon, authenticated;

grant execute on function public.register_public_space_user(text, text, text) to anon, authenticated;
grant execute on function public.login_public_space_user(text, text) to anon, authenticated;
grant execute on function public.get_public_space_session(text) to anon, authenticated;
grant execute on function public.logout_public_space_user(text) to anon, authenticated;
grant execute on function public.reset_public_space_password(text, text, text) to anon, authenticated;
grant execute on function public.create_public_space_post(text, text, text) to anon, authenticated;
grant execute on function public.list_public_space_posts(text) to anon, authenticated;
grant execute on function public.delete_public_space_post(text, uuid) to anon, authenticated;
grant execute on function public.admin_set_public_space_post_hidden(text, uuid, boolean) to anon, authenticated;
grant execute on function public.toggle_public_space_heart(text, uuid) to anon, authenticated;
grant execute on function public.list_public_space_users(text) to anon, authenticated;
grant execute on function public.admin_update_public_space_user(text, uuid, boolean, text, boolean, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;