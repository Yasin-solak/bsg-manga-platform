-- ============================================
-- BSG Manga | Reports support user target
-- Date: 2026-02-28
-- ============================================

begin;

alter table public.reports
  drop constraint if exists reports_target_type_check;

alter table public.reports
  add constraint reports_target_type_check
  check (target_type in ('post', 'comment', 'manga_comment', 'manga_list_comment', 'user'));

commit;
