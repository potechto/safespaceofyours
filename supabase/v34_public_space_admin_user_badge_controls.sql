-- V34 Public Space admin user badge controls
-- Extends admin user updates for preset badge strings and keeps reset password/PIN support.

begin;

alter table public.public_space_users
  alter column badge_label type text;

drop function if exists public.admin_update_public_space_user(text, uuid, boolean, text, boolean, text);
drop function if exists public.admin_update_public_space_user(text, uuid, boolean, text, boolean, text, text);

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
  updated_count integer := 0;
begin
  active_user := public.public_space_current_user(input_session_token);

  if active_user.id is null or active_user.is_admin is not true then
    raise exception 'Admin only.';
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

  if input_badge_label is not null and char_length(trim(input_badge_label)) > 80 then
    raise exception 'Badge label is too long.';
  end if;

  update public.public_space_users
  set
    is_premium = coalesce(input_is_premium, is_premium),
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

grant execute on function public.admin_update_public_space_user(text, uuid, boolean, text, boolean, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
