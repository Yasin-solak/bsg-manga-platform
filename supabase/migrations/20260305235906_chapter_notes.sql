alter table public.chapters
    add column if not exists notes text;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'chapters_notes_length_check'
          and conrelid = 'public.chapters'::regclass
    ) then
        alter table public.chapters
            add constraint chapters_notes_length_check
            check (notes is null or char_length(notes) <= 2000);
    end if;
end
$$;
