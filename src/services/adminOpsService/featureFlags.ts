import { listRegisteredFeatureFlags, notifyFeatureFlagUpdated } from '../featureFlagService'
import { supabase } from '../supabase'
import { ensureOpsMigrationError, mapDbFeatureFlagRow, normalizeFeatureFlagKey } from './shared'
import type {
  AdminFeatureFlagItem,
  DbFeatureFlagRow,
  DbSetFeatureFlagRow,
  SetAdminFeatureFlagInput,
} from './types'

function formatRegistryFlagLabel(key: string) {
  return key
    .split(/[._:-]+/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function buildRegistryOnlyFeatureFlagItem(
  key: string,
  entry: ReturnType<typeof listRegisteredFeatureFlags>[number],
): AdminFeatureFlagItem {
  return {
    id: `registry:${key}`,
    key,
    label: formatRegistryFlagLabel(key),
    description: entry.amac,
    isEnabled: entry.varsayilan === true,
    rolloutPercent: 100,
    isPublic: false,
    metadata: {
      registryOnly: true,
      owner: entry.owner,
      cleanupNotu: entry.cleanupNotu,
      sonKullanmaTarihi: entry.sonKullanmaTarihi,
      varsayilan: entry.varsayilan,
    },
    createdAt: '',
    updatedAt: '',
  }
}

function mergeFeatureFlagsWithRegistry(rows: AdminFeatureFlagItem[]) {
  const registeredFlags = listRegisteredFeatureFlags()
  const byKey = new Map(rows.map((row) => [row.key, row]))

  for (const registryEntry of registeredFlags) {
    if (byKey.has(registryEntry.key)) continue
    byKey.set(
      registryEntry.key,
      buildRegistryOnlyFeatureFlagItem(registryEntry.key, registryEntry),
    )
  }

  return Array.from(byKey.values()).sort((left, right) => left.key.localeCompare(right.key, 'tr'))
}

export async function listAdminFeatureFlags(): Promise<AdminFeatureFlagItem[]> {
  const { data, error } = await supabase
    .from('feature_flags')
    .select(`
      id,
      key,
      label,
      description,
      is_enabled,
      rollout_percent,
      is_public,
      metadata,
      updated_by,
      created_at,
      updated_at,
      updated_by_user:updated_by (
        id,
        username,
        avatar_url
      )
    `)
    .order('key', { ascending: true })

  if (error) {
    console.error('[adminOpsService] listAdminFeatureFlags error', error)
    ensureOpsMigrationError(error)
  }

  const mappedRows = ((data || []) as DbFeatureFlagRow[]).map(mapDbFeatureFlagRow)
  return mergeFeatureFlagsWithRegistry(mappedRows)
}

export async function setAdminFeatureFlag(input: SetAdminFeatureFlagInput): Promise<AdminFeatureFlagItem> {
  const normalizedKey = normalizeFeatureFlagKey(input.key)
  if (!normalizedKey) {
    throw new Error('Flag anahtari bos olamaz.')
  }

  const trimmedLabel = (input.label || '').trim()
  if (trimmedLabel.length < 2) {
    throw new Error('Flag basligi en az 2 karakter olmali.')
  }

  const rollout = Math.min(100, Math.max(0, Number(input.rolloutPercent ?? 100)))
  const { data, error } = await supabase.rpc('set_feature_flag', {
    p_key: normalizedKey,
    p_label: trimmedLabel,
    p_description: (input.description || '').trim(),
    p_is_enabled: input.isEnabled === true,
    p_rollout_percent: rollout,
    p_is_public: input.isPublic === true,
    p_metadata: input.metadata || {},
  })

  if (error) {
    console.error('[adminOpsService] setAdminFeatureFlag error', error)
    ensureOpsMigrationError(error)
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row) {
    throw new Error('Flag kaydi donmedi.')
  }

  const mapped = mapDbFeatureFlagRow(row as DbSetFeatureFlagRow)
  notifyFeatureFlagUpdated(normalizedKey, mapped.isEnabled)
  return mapped
}
