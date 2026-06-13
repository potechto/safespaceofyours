-- V33 Public Space admin comment edit
-- Allows admins to edit comments safely through the backend RPC.
-- Owner edits remain limited to the 30-minute window.

begin;

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
            'is_admin', u.is_admin
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

  is_admin_edit := coalesce(active_user.is_admin, false) and active_user.id <> target_comment.user_id;

  if target_comment.user_id <> active_user.id and coalesce(active_user.is_admin, false) is false then
    raise exception 'Not allowed.';
  end if;

  if target_comment.is_hidden is true and coalesce(active_user.is_admin, false) is false then
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

  if target_post.is_hidden is true and coalesce(active_user.is_admin, false) is false then
    raise exception 'Post not found.';
  end if;

  if target_post.visibility <> 'public'
    and target_post.user_id <> active_user.id
    and coalesce(active_user.is_admin, false) is false then
    raise exception 'Not allowed.';
  end if;

  if coalesce(active_user.is_admin, false) is false
    and target_comment.created_at < now() - interval '30 minutes' then
    raise exception 'Comment can only be edited within 30 minutes.';
  end if;

  update public.public_space_comments
  set body = clean_body,
      updated_at = now()
  where id = input_comment_id
    and is_deleted is false
    and (
      coalesce(active_user.is_admin, false)
      or (
        user_id = active_user.id
        and is_hidden is false
        and created_at >= now() - interval '30 minutes'
      )
    );

  if not found then
    raise exception 'Comment could not be updated.';
  end if;

  if coalesce(active_user.is_admin, false) then
    insert into public.public_space_moderation_log (admin_user_id, action, target_type, target_id, details)
    values (
      active_user.id,
      case when is_admin_edit then 'admin_edit_comment' else 'edit_own_comment' end,
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

grant execute on function public.list_public_space_comments(text, uuid) to anon, authenticated;
grant execute on function public.edit_public_space_comment(text, uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;

select
  'v33_public_space_admin_comment_edit_applied' as status;
