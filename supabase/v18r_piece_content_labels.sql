alter table public.piece_settings
  add column if not exists content_label text;

update public.piece_settings
set content_label = coalesce(content_label, 'spoken-poetry')
where content_label is null;

update public.piece_settings
set content_label = 'motivational'
where slug in ('genesis2214', 'isaiah6022', 'psalm375');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'piece_settings_content_label_check'
  ) then
    alter table public.piece_settings
      add constraint piece_settings_content_label_check
      check (content_label in ('spoken-poetry', 'motivational', 'story'));
  end if;
end $$;

commit;
