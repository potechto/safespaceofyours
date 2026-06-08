-- safespaceofsyours V18C promo request flow
-- Run this in Supabase SQL Editor after committing this patch.

begin;

create extension if not exists pgcrypto;

create table if not exists public.promo_requests (
  id uuid primary key default gen_random_uuid(),
  piece_slug text not null references public.piece_settings(slug) on delete cascade,
  piece_title text not null,
  requester_contact text,
  note text,
  status text not null default 'pending' check (status in ('pending', 'done', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists promo_requests_piece_slug_idx on public.promo_requests (piece_slug);
create index if not exists promo_requests_status_idx on public.promo_requests (status);
create index if not exists promo_requests_created_at_idx on public.promo_requests (created_at desc);

drop trigger if exists set_promo_requests_updated_at on public.promo_requests;
create trigger set_promo_requests_updated_at
before update on public.promo_requests
for each row
execute function public.set_updated_at();

alter table public.promo_requests enable row level security;

drop policy if exists "Admins can read promo requests" on public.promo_requests;
drop policy if exists "Admins can update promo requests" on public.promo_requests;
drop policy if exists "Admins can delete promo requests" on public.promo_requests;

create policy "Admins can read promo requests"
on public.promo_requests
for select
to authenticated
using (public.is_admin());

create policy "Admins can update promo requests"
on public.promo_requests
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can delete promo requests"
on public.promo_requests
for delete
to authenticated
using (public.is_admin());

grant select, update, delete on public.promo_requests to authenticated;

create or replace function public.submit_promo_request(
  input_piece_slug text,
  input_contact text default null,
  input_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_piece public.piece_settings%rowtype;
  clean_slug text := trim(coalesce(input_piece_slug, ''));
  clean_contact text := nullif(left(trim(coalesce(input_contact, '')), 160), '');
  clean_note text := nullif(left(trim(coalesce(input_note, '')), 500), '');
begin
  if clean_slug = '' then
    return jsonb_build_object(
      'ok', false,
      'message', 'Please choose a piece first.'
    );
  end if;

  select *
  into selected_piece
  from public.piece_settings
  where slug = clean_slug
    and is_enabled = true
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'message', 'Selected piece is not available.'
    );
  end if;

  insert into public.promo_requests (
    piece_slug,
    piece_title,
    requester_contact,
    note,
    status
  )
  values (
    selected_piece.slug,
    selected_piece.title,
    clean_contact,
    clean_note,
    'pending'
  );

  return jsonb_build_object(
    'ok', true,
    'message', 'Request received. Please check again after 6-24 hours.'
  );
end;
$$;

grant execute on function public.submit_promo_request(text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
