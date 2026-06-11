begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create or replace function public.check_public_space_username(input_username text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  clean_username text := public.public_space_normalize_username(input_username);
  taken boolean := false;
begin
  if clean_username !~ '^[a-z0-9_]{3,15}$' then
    return jsonb_build_object(
      'ok', false,
      'available', false,
      'username', clean_username,
      'message', 'Username must be 3 to 15 characters using letters, numbers, and underscore only.'
    );
  end if;

  select exists (
    select 1
    from public.public_space_users
    where username = clean_username
  )
  into taken;

  return jsonb_build_object(
    'ok', true,
    'available', not taken,
    'username', clean_username,
    'message', case
      when taken then 'Username is already taken.'
      else 'Username is available.'
    end
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

  if exists (
    select 1
    from public.public_space_users
    where username = clean_username
  ) then
    raise exception 'Username is already taken.';
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
      'is_disabled', new_user.is_disabled
    )
  );
end;
$$;

drop function if exists public.admin_update_public_space_user(text, uuid, boolean, text, boolean, text);

create or replace function public.admin_update_public_space_user(
  input_session_token text,
  input_user_id uuid,
  input_is_premium boolean default null,
  input_badge_label text default null,
  input_is_disabled boolean default null,
  input_new_password text default null,
  input_new_pin text default null
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

  if active_user.id is null or active_user.is_admin is not true then
    raise exception 'Admin only.';
  end if;

  if input_new_password is not null and (char_length(coalesce(input_new_password, '')) < 6 or char_length(coalesce(input_new_password, '')) > 8) then
    raise exception 'New password must be 6 to 8 characters.';
  end if;

  if input_new_pin is not null and coalesce(input_new_pin, '') !~ '^[0-9]{4}$' then
    raise exception 'New PIN/key must be exactly 4 numbers.';
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
      when input_new_password is null then password_hash
      else crypt(input_new_password, gen_salt('bf'))
    end,
    pin_hash = case
      when input_new_pin is null then pin_hash
      else crypt(input_new_pin, gen_salt('bf'))
    end
  where id = input_user_id;

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
      'badge_label_changed', input_badge_label is not null,
      'is_disabled', input_is_disabled,
      'password_reset', input_new_password is not null,
      'pin_reset', input_new_pin is not null
    )
  );

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.check_public_space_username(text) to anon, authenticated;
grant execute on function public.register_public_space_user(text, text, text) to anon, authenticated;
grant execute on function public.admin_update_public_space_user(text, uuid, boolean, text, boolean, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;