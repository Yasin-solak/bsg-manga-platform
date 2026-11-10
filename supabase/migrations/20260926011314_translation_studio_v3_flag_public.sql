-- Translation Studio V3 fix: is_feature_enabled for non-admins reads only
-- public (is_public) flags. Even with the flag on fansub teams could not reach
-- the studio. Only the on/off info is visible; the flag stays off.
update public.feature_flags set is_public = true where key = 'translation.studio_v3';
