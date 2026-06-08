-- safespaceofsyours V18F promo request read/unread status
-- Run this in Supabase SQL Editor after committing this patch.

begin;

alter table public.promo_requests
  add column if not exists is_read boolean not null default false;

create index if not exists promo_requests_is_read_idx
on public.promo_requests (is_read);

notify pgrst, 'reload schema';

commit;
