begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter function public.public_space_hash_token(text)
set search_path to public, extensions;

alter function public.register_public_space_user(text, text, text)
set search_path to public, extensions;

alter function public.login_public_space_user(text, text)
set search_path to public, extensions;

alter function public.reset_public_space_password(text, text, text)
set search_path to public, extensions;


alter function public.admin_update_public_space_user(text, uuid, boolean, text, boolean, text)
set search_path to public, extensions;

notify pgrst, 'reload schema';

commit;