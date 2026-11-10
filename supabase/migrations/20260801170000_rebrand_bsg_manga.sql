-- Brand move: MangaZone -> BSG Manga (database side).
--
-- The code side is separate; here only brand traces in LIVE data are cleaned.
-- Old migration files were NOT TOUCHED: they already ran and will not
-- rerun; editing would only produce diff noise.
--
-- The seed fansub (aaaaaaaa-...-aaa1) is deleted. Everything tied to it is seed: 3 chapters,
-- 1 manga, 5 post references, 1 follower (the account owner).

-- For the maintenance operation related guard and side-effect triggers are temporarily disabled.
--
-- `session_replication_role = replica` is NOT USED: it also disables foreign key
-- triggers; on fansub delete CASCADE would not run, leaving
-- orphan rows. Instead only the needed triggers are disabled.
--
-- Why needed: the moderation guard blocks updating a reviewed post
-- and changing `related_fansub_id`; on fansub delete
-- the SET NULL from CASCADE tripped this guard too.
alter table public.community_posts disable trigger trg_enforce_community_post_moderation_guard;
alter table public.community_posts disable trigger trg_capture_fansub_post_activity_event;
alter table public.community_posts disable trigger trg_prevent_duyuru_in_community_posts;
alter table public.mangas disable trigger trg_enforce_manga_approval_guard;
alter table public.mangas disable trigger trg_capture_fansub_manga_activity_event;
-- Chapters are also tied to the fansub (SET NULL); the approval guard blocks that write too.
alter table public.chapters disable trigger trg_enforce_chapter_approval_guard;
alter table public.chapters disable trigger trg_capture_fansub_chapter_activity_event;
alter table public.fansub_members disable trigger trg_sync_fansub_member_history;

-- 1) References in the array column must be cleaned FIRST.
-- `related_fansub_ids` is a UUID array, NOT a foreign key, so
-- deleting the fansub does not clean it via CASCADE and an id matching no row
-- would remain.
update public.community_posts
set related_fansub_ids = array_remove(related_fansub_ids, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid)
where 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid = any(related_fansub_ids);

-- 2) Seed notifications of the fansub being deleted; once it is gone they would point
-- to a team that no longer exists.
delete from public.notifications where message ilike '%mangazone%';

-- 3) Kalan marka metinleri.
update public.mangas set author = 'BSG Manga Studio' where author = 'MangaZone Studio';
update public.mangas set artist = 'BSG Manga Studio' where artist = 'MangaZone Studio';

update public.community_posts set title = replace(title, 'MangaZone', 'BSG Manga') where title like '%MangaZone%';
update public.user_level_rulesets set name = replace(name, 'MangaZone', 'BSG Manga') where name like '%MangaZone%';
update public.user_level_thresholds set title = replace(title, 'MangaZone', 'BSG Manga') where title like '%MangaZone%';

-- provider_asset_id resolves to no storage object (dead seed data);
-- still updated to leave no trace.
update public.community_post_assets
set provider_asset_id = replace(provider_asset_id, 'mangazone', 'bsgmanga'),
    alt_text = replace(alt_text, 'MangaZone', 'BSG Manga')
where provider_asset_id ilike '%mangazone%' or alt_text ilike '%mangazone%';

-- 4) Delete the seed fansub. Tied records (activity, inventory, operation, follow)
-- go via CASCADE; chapter/manga references are SET NULL so
-- the content itself stays.
delete from public.fansubs where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid;

alter table public.community_posts enable trigger trg_enforce_community_post_moderation_guard;
alter table public.community_posts enable trigger trg_capture_fansub_post_activity_event;
alter table public.community_posts enable trigger trg_prevent_duyuru_in_community_posts;
alter table public.mangas enable trigger trg_enforce_manga_approval_guard;
alter table public.mangas enable trigger trg_capture_fansub_manga_activity_event;
alter table public.chapters enable trigger trg_enforce_chapter_approval_guard;
alter table public.chapters enable trigger trg_capture_fansub_chapter_activity_event;
alter table public.fansub_members enable trigger trg_sync_fansub_member_history;
