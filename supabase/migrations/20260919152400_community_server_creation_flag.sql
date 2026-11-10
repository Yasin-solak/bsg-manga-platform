-- Keeps the automatic/manual creation preference of a new community manageable up front.
-- There is no server creation engine yet; this record alone creates no server.
insert into public.feature_flags (
  key, label, description, is_enabled, rollout_percent, is_public, metadata
)
values (
  'community.servers_auto_create',
  'Fansub sunucularını otomatik oluştur',
  'Hazırlık ayarı: yeni topluluk altyapısı bağlandığında açık = otomatik, kapalı = lider tarafından manuel oluşturma. Mevcut sunucular korunur. Genel mod için rollout %100 tutulur.',
  false,
  100,
  false,
  jsonb_build_object(
    'owner', 'topluluk',
    'implementation_status', 'pending_server_core',
    'setting_kind', 'persistent_policy',
    'enabled_mode', 'automatic',
    'disabled_mode', 'manual',
    'existing_servers', 'preserve',
    'cleanupNotu', 'Kalıcı yönetim tercihi; sunucu motoruna bağlanınca hazırlık açıklaması güncellenir.'
  )
)
-- A rerun must not reset the mode the admin later picked.
on conflict (key) do nothing;
