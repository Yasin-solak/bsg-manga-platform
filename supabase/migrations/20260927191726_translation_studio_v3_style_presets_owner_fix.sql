-- created_by ties to public.users(id); auth.uid() is not the same identity (users.auth_user_id).
-- Like other translation tables the app user identity is used.
alter table public.translation_style_presets
  alter column created_by set default app_private.current_public_user_id();
