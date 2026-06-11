-- V26 Public Space edit posts
-- Allows users, including admins, to edit ONLY their own posts within 30 minutes.
-- Run this in Supabase before testing the frontend Edit post action.

create or replace function public.edit_public_space_post(
  input_session_token text,
  input_post_id uuid,
  input_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  active_user public.public_space_users;
  target_post public.public_space_posts;
  clean_body text := trim(coalesce(input_body, ''));
begin
  active_user := public.public_space_current_user(input_session_token);

  if active_user.id is null then
    raise exception 'Login required.';
  end if;

  if char_length(clean_body) < 1 or char_length(clean_body) > 1000 then
    raise exception 'Post must be 1 to 1,000 characters.';
  end if;

  select *
  into target_post
  from public.public_space_posts
  where id = input_post_id
    and is_deleted is false;

  if target_post.id is null then
    raise exception 'Post not found.';
  end if;

  if target_post.user_id <> active_user.id then
    raise exception 'You can only edit your own posts.';
  end if;

  if target_post.created_at < now() - interval '30 minutes' then
    raise exception 'Posts can only be edited within 30 minutes.';
  end if;

  update public.public_space_posts
  set body = clean_body
  where id = input_post_id
  returning * into target_post;

  return jsonb_build_object(
    'ok', true,
    'post_id', target_post.id,
    'body', target_post.body,
    'updated_at', target_post.updated_at
  );
end;
$$;

grant execute on function public.edit_public_space_post(text, uuid, text) to anon, authenticated;
