-- Moving reading position across devices (reader v2, Phase B).
--
-- `reading_history` already keeps ONE row per manga
-- (user_id, manga_id unique), so "where you last stopped in this series".
-- No separate table is needed for page position: three fields are added to the same row.
--
-- Why `position_at` is separate: `read_at` updates on chapter entry. The cross-device
-- "which is newer" comparison wants the time of the PAGE write;
-- read_at does not represent that.
--
-- Writes are SPARSE: local position is kept in localStorage all the time, written here only
-- at exit points (tab hidden, chapter change, leaving).
-- Position changes often; writing to Postgres on each scroll would needlessly burn the only
-- bottleneck in the scale notes.

alter table public.reading_history
  add column if not exists page_index integer,
  add column if not exists page_count integer,
  add column if not exists position_at timestamptz;

-- No broken value must be written: a page index cannot be negative, a page count must be
-- positive. Both can stay NULL (unknown position = from chapter start).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.reading_history'::regclass
      and conname = 'reading_history_page_position_sane'
  ) then
    alter table public.reading_history
      add constraint reading_history_page_position_sane
      check (
        (page_index is null or page_index >= 0)
        and (page_count is null or page_count > 0)
        and (page_index is null or page_count is null or page_index < page_count)
      );
  end if;
end $$;

comment on column public.reading_history.page_index is
  'Bolum icinde kalinan sayfa (0 tabanli). NULL = konum bilinmiyor, bolum basindan.';
comment on column public.reading_history.page_count is
  'Konum yazildigi andaki toplam sayfa sayisi; bolum yeniden yuklenirse konumun eskidigini anlamak icin.';
comment on column public.reading_history.position_at is
  'Sayfa konumunun yazildigi an; cihazlar arasinda hangi konumun daha yeni oldugunu belirler.';
