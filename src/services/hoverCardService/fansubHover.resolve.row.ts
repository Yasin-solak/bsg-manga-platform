import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import {
  FANSUB_ACTIVE_PROFILE_EFFECT_COLUMN_STORAGE_KEY,
  readStoredColumnCapability,
  writeStoredColumnCapability,
} from '../dbSchemaCapability'
import { supabase } from '../supabase'
import {
  isAbortError,
  isMissingColumnError,
  withAbortSignal,
} from './shared'
import { normalizeFansubHoverInput } from './fansubHover.state'
import type {
  FansubHoverFetchInput,
  FansubRow,
} from './types'

const QUERY_COLUMNS = 'id, slug, name, avatar_url, description, frame_type, primary_color, secondary_color, custom_background_asset_url, active_name_style, manga_count, follower_count, active_frame_id, active_background_id, active_pattern_id, active_profile_effect_id, hover_theme'
const LEGACY_QUERY_COLUMNS = 'id, slug, name, avatar_url, description, frame_type, primary_color, secondary_color, custom_background_asset_url, active_name_style, manga_count, follower_count, active_frame_id, active_background_id, active_pattern_id'
const fansubHoverRowLogger = createScopedLogger('hoverCardService.fansubHoverRow')

let fansubProfileEffectColumnAvailable: boolean | null = readStoredColumnCapability(FANSUB_ACTIVE_PROFILE_EFFECT_COLUMN_STORAGE_KEY)

function shouldRetryWithLegacyColumns(error: unknown) {
  return isMissingColumnError(error, 'fansubs', 'active_profile_effect_id')
    || isMissingColumnError(error, 'fansubs', 'hover_theme')
}

async function runFansubQuery(
  field: 'id' | 'slug',
  value: string,
  columns: string,
  signal?: AbortSignal,
) {
  return withAbortSignal(
    supabase
      .from('fansubs')
      .select(columns)
      .eq(field, value)
      .eq('is_active', true)
      .maybeSingle(),
    signal,
  )
}

export async function fetchFansubRow(input: FansubHoverFetchInput, signal?: AbortSignal): Promise<FansubRow | null> {
  const normalizedInput = normalizeFansubHoverInput(input)
  const fansubId = normalizedInput.fansubId
  const slug = normalizedInput.slug

  if (!fansubId && !slug) return null

  const queryByField = async (field: 'id' | 'slug', value?: string | null) => {
    if (!value) return null

    const requestContext = createRequestContext('hoverCardService.fansubHoverRow', `fetch-fansub-row-by-${field}`, {
      field,
      value,
    })
    const initialColumns = fansubProfileEffectColumnAvailable === false ? LEGACY_QUERY_COLUMNS : QUERY_COLUMNS
    let response = await runFansubQuery(field, value, initialColumns, signal)

    if (!response.error && initialColumns === QUERY_COLUMNS) {
      fansubProfileEffectColumnAvailable = true
      writeStoredColumnCapability(FANSUB_ACTIVE_PROFILE_EFFECT_COLUMN_STORAGE_KEY, true)
    }

    if (response.error && shouldRetryWithLegacyColumns(response.error)) {
      fansubProfileEffectColumnAvailable = false
      writeStoredColumnCapability(FANSUB_ACTIVE_PROFILE_EFFECT_COLUMN_STORAGE_KEY, false)
      response = await runFansubQuery(field, value, LEGACY_QUERY_COLUMNS, signal)
    }

    if (response.error && !isAbortError(response.error) && !shouldRetryWithLegacyColumns(response.error)) {
      fansubHoverRowLogger.error({
        event: requestContext.event,
        message: 'fansub satiri alinamadi.',
        context: toRequestContextLogContext(requestContext, { usedLegacyColumns: initialColumns === LEGACY_QUERY_COLUMNS }),
        error: response.error,
      })
    }

    if (response.error) return null
    return (response.data || null) as FansubRow | null
  }

  const byId = await queryByField('id', fansubId)
  if (byId) return byId
  return queryByField('slug', slug)
}
