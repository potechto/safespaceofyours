-- safespaceofsyours V16/V17 piece control foundation
-- Run this once in Supabase SQL Editor, then refresh admin.html.
-- Safe to rerun: it creates missing objects and seeds missing piece rows without resetting owner controls.

begin;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.piece_settings (
  slug text primary key,
  title text not null,
  category text not null default 'Uncategorized',
  type text not null default 'spoken-poetry',
  is_enabled boolean not null default true,
  access_type text not null default 'free' check (access_type in ('free', 'paid')),
  price numeric(10, 2) check (price is null or price >= 0),
  preview_mode text not null default 'chars' check (preview_mode in ('chars')),
  preview_char_limit integer not null default 700 check (preview_char_limit >= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists piece_settings_category_idx on public.piece_settings (category);
create index if not exists piece_settings_enabled_idx on public.piece_settings (is_enabled);
create index if not exists piece_settings_access_type_idx on public.piece_settings (access_type);

drop trigger if exists set_piece_settings_updated_at on public.piece_settings;
create trigger set_piece_settings_updated_at
before update on public.piece_settings
for each row
execute function public.set_updated_at();

alter table public.promo_codes add column if not exists max_uses integer check (max_uses is null or max_uses > 0);
alter table public.promo_codes add column if not exists used_count integer not null default 0 check (used_count >= 0);
alter table public.promo_codes add column if not exists is_public boolean not null default true;
alter table public.promo_codes add column if not exists applies_to_all boolean not null default true;

alter table public.unlock_codes add column if not exists piece_slug text;
alter table public.unlock_codes add column if not exists expires_at timestamptz;
alter table public.unlock_codes add column if not exists note text;

create table if not exists public.promo_code_targets (
  promo_code_id text not null,
  piece_slug text not null references public.piece_settings(slug) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (promo_code_id, piece_slug)
);

create index if not exists promo_code_targets_piece_slug_idx on public.promo_code_targets (piece_slug);

create table if not exists public.unlock_code_targets (
  unlock_code_id text not null,
  piece_slug text not null references public.piece_settings(slug) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (unlock_code_id, piece_slug)
);

create index if not exists unlock_code_targets_piece_slug_idx on public.unlock_code_targets (piece_slug);

insert into public.piece_settings (
  slug,
  title,
  category,
  type,
  is_enabled,
  access_type,
  price,
  preview_mode,
  preview_char_limit
)
values
  ('adreamtochooseortofollow', 'A Dream to Choose or to Follow?', 'Dreams', 'spoken-poetry', true, 'paid', 49, 'chars', 700),
  ('biglanglingon', 'Biglang Lingon', 'Reflection', 'spoken-poetry', true, 'paid', 49, 'chars', 700),
  ('genesis2214', 'Genesis 22:14', 'Faith', 'spoken-poetry', true, 'free', null, 'chars', 700),
  ('hindikanamantalaganagiisa', 'Hindi Ka Naman Talaga Nag-iisa', 'Healing', 'spoken-poetry', true, 'paid', 49, 'chars', 700),
  ('isaiah6022', 'Isaiah 60:22', 'Faith', 'spoken-poetry', true, 'free', null, 'chars', 700),
  ('kailanbaangnanditona', 'Kailan Ba Ang Nandito Na?', 'Life', 'spoken-poetry', true, 'free', null, 'chars', 700),
  ('kakapitkapaba', 'Kakapit Ka Pa Ba?', 'Love', 'spoken-poetry', true, 'free', null, 'chars', 700),
  ('kayamobagawinlahatparasapangarap', 'Kaya Mo Ba Gawin Lahat Para Sa Pangarap?', 'Dreams', 'spoken-poetry', true, 'free', null, 'chars', 700),
  ('kungangpaglisanmoypaglaya', 'Kung Ang Paglisan Mo''y Paglaya', 'Heartbreak', 'spoken-poetry', true, 'paid', 49, 'chars', 700),
  ('love', 'Love', 'Love', 'spoken-poetry', true, 'paid', 49, 'chars', 700),
  ('makakamitmorin', 'Makakamit Mo Rin', 'Dreams', 'spoken-poetry', true, 'free', null, 'chars', 700),
  ('maligawsasarilingako', 'Maligaw Sa Sariling Ako', 'Reflection', 'spoken-poetry', true, 'free', null, 'chars', 700),
  ('minsannakakalimutannanatinmagmahal', 'Minsan Nakakalimutan Na Natin Magmahal', 'Love', 'spoken-poetry', true, 'paid', 49, 'chars', 700),
  ('nakakatakotpalangtumanda', 'Nakakatakot Palang Tumanda', 'Life', 'spoken-poetry', true, 'free', null, 'chars', 700),
  ('okaykanaba', 'Okay Ka Na Ba?', 'Healing', 'spoken-poetry', true, 'free', null, 'chars', 700),
  ('papakuinkorinpalaangpangakokosasariliko', 'Papakuin Ko Rin Pala Ang Pangako Ko Sa Sarili Ko', 'Reflection', 'spoken-poetry', true, 'free', null, 'chars', 700),
  ('psalm375', 'Psalm 37:5', 'Faith', 'spoken-poetry', true, 'free', null, 'chars', 700),
  ('righttimingrightperson', 'Right Timing, Right Person?', 'Love', 'spoken-poetry', true, 'free', null, 'chars', 700),
  ('sapagmamahalparinpalatayobabalik', 'Sa Pagmamahal Pa Rin Pala Tayo Babalik', 'Love', 'spoken-poetry', true, 'free', null, 'chars', 700),
  ('simulanghindinagingwakas', 'Simulang Hindi Naging Wakas', 'Heartbreak', 'spoken-poetry', true, 'free', null, 'chars', 700),
  ('tomyfamily', 'To My Family', 'Family', 'spoken-poetry', true, 'free', null, 'chars', 700),
  ('walanguunlad', 'Walang Uunlad', 'Society', 'spoken-poetry', true, 'free', null, 'chars', 700)
on conflict (slug) do update set
  title = excluded.title,
  category = excluded.category,
  type = excluded.type,
  updated_at = now();

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.admin_profiles
    where user_id = auth.uid()
  );
$$;

alter table public.piece_settings enable row level security;
alter table public.promo_code_targets enable row level security;
alter table public.unlock_code_targets enable row level security;

drop policy if exists "Public can read piece display settings" on public.piece_settings;
drop policy if exists "Admins can manage piece display settings" on public.piece_settings;
drop policy if exists "Public can read promo targets" on public.promo_code_targets;
drop policy if exists "Admins can manage promo targets" on public.promo_code_targets;
drop policy if exists "Admins can read unlock targets" on public.unlock_code_targets;
drop policy if exists "Admins can manage unlock targets" on public.unlock_code_targets;

create policy "Public can read piece display settings"
on public.piece_settings
for select
to anon, authenticated
using (true);

create policy "Admins can manage piece display settings"
on public.piece_settings
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Public can read promo targets"
on public.promo_code_targets
for select
to anon, authenticated
using (true);

create policy "Admins can manage promo targets"
on public.promo_code_targets
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can read unlock targets"
on public.unlock_code_targets
for select
to authenticated
using (public.is_admin());

create policy "Admins can manage unlock targets"
on public.unlock_code_targets
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant usage on schema public to anon, authenticated;
grant select on public.piece_settings to anon, authenticated;
grant select on public.promo_code_targets to anon, authenticated;
grant select on public.unlock_code_targets to authenticated;
grant insert, update, delete on public.piece_settings to authenticated;
grant insert, update, delete on public.promo_code_targets to authenticated;
grant insert, update, delete on public.unlock_code_targets to authenticated;

commit;
