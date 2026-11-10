/**
 * adminEvents: site-admin seasonal EVENT (quest_events entity) management
 *
 * Two layers:
 * 1) Event: admin_list_quest_events / admin_upsert_quest_event / admin_delete_quest_event
 * 2) Event quests: admin_list_event_quests / admin_upsert_event_quest /
 * admin_delete_event_quest / admin_set_event_quest_active
 * All protected in the DB by is_admin().
 */

import { supabase } from '../supabase'
import { withAbortSignal, withServiceTimeout } from '../apiResilience'

// A Supabase PostgrestError is NOT an Error INSTANCE; convert to a real Error to keep the
// message (otherwise the UI falls back to 'Kaydedilemedi').
function rpcFail(error: { message?: string; hint?: string | null; details?: string | null } | null): never {
  const parts = [error?.message, error?.details, error?.hint].filter(Boolean)
  throw new Error(parts.join(' — ') || 'Sunucu islemi basarisiz oldu.')
}

// ---- Etkinlik varligi ----
export interface AdminQuestEvent {
  id: string
  slug: string
  title: string
  description: string
  themeKey: string
  bannerUrl: string | null
  structure: 'independent' | 'chain'
  startsAt: string | null
  endsAt: string | null
  isActive: boolean
  sortOrder: number
  isLive: boolean
  questCount: number
  participantCount: number
  coinCredited: number
  createdAt: string
  updatedAt: string
}

export interface AdminQuestEventInput {
  id?: string | null
  slug?: string | null
  title: string
  description?: string
  themeKey?: string
  bannerUrl?: string | null
  structure?: 'independent' | 'chain'
  startsAt?: string | null
  endsAt?: string | null
  isActive?: boolean
  sortOrder?: number
}

// ---- Event quest ----
export interface AdminEventQuest {
  id: string
  slug: string
  title: string
  description: string
  metricKey: string
  targetValue: number
  coinReward: number
  sortOrder: number
  isActive: boolean
  unlockRequiresQuestId: string | null
  participantCount: number
  completedCount: number
  claimedCount: number
}

export interface AdminEventQuestInput {
  eventId: string
  id?: string | null
  title: string
  description?: string
  metricKey: string
  targetValue: number
  coinReward: number
  sortOrder?: number
  unlockRequiresQuestId?: string | null
  isActive?: boolean
}

interface EventRow {
  id: string
  slug: string
  title: string
  description: string | null
  theme_key: string
  banner_url: string | null
  structure: string
  starts_at: string | null
  ends_at: string | null
  is_active: boolean
  sort_order: number | string
  is_live: boolean
  quest_count: number | string
  participant_count: number | string
  coin_credited: number | string
  created_at: string
  updated_at: string
}

interface EventQuestRow {
  id: string
  slug: string
  title: string
  description: string | null
  metric_key: string
  target_value: number | string
  coin_reward: number | string
  sort_order: number | string
  is_active: boolean
  unlock_requires_quest_id: string | null
  participant_count: number | string
  completed_count: number | string
  claimed_count: number | string
}

function mapEvent(row: EventRow): AdminQuestEvent {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description || '',
    themeKey: row.theme_key,
    bannerUrl: row.banner_url,
    structure: row.structure === 'chain' ? 'chain' : 'independent',
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isActive: row.is_active,
    sortOrder: Number(row.sort_order) || 0,
    isLive: row.is_live,
    questCount: Number(row.quest_count) || 0,
    participantCount: Number(row.participant_count) || 0,
    coinCredited: Number(row.coin_credited) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapEventQuest(row: EventQuestRow): AdminEventQuest {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description || '',
    metricKey: row.metric_key,
    targetValue: Number(row.target_value) || 0,
    coinReward: Number(row.coin_reward) || 0,
    sortOrder: Number(row.sort_order) || 0,
    isActive: row.is_active,
    unlockRequiresQuestId: row.unlock_requires_quest_id,
    participantCount: Number(row.participant_count) || 0,
    completedCount: Number(row.completed_count) || 0,
    claimedCount: Number(row.claimed_count) || 0,
  }
}

// ================= Etkinlik varligi =================
export async function listAdminQuestEvents(): Promise<AdminQuestEvent[]> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc('admin_list_quest_events'), signal),
    { label: 'Admin etkinlik listesi' },
  )
  if (error) rpcFail(error)
  return ((data as EventRow[] | null) || []).map(mapEvent)
}

export async function upsertAdminQuestEvent(input: AdminQuestEventInput): Promise<void> {
  const { error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc('admin_upsert_quest_event', {
      p_id: input.id ?? null,
      p_slug: input.slug ?? null,
      p_title: input.title,
      p_description: input.description ?? '',
      p_theme_key: input.themeKey ?? 'ozel',
      p_banner_url: input.bannerUrl ?? null,
      p_structure: input.structure ?? 'independent',
      p_starts_at: input.startsAt ?? null,
      p_ends_at: input.endsAt ?? null,
      p_is_active: input.isActive ?? true,
      p_sort_order: input.sortOrder ?? 0,
    }), signal),
    { label: 'Admin etkinlik kaydetme' },
  )
  if (error) rpcFail(error)
}

export async function deleteAdminQuestEvent(eventId: string): Promise<void> {
  const { error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc('admin_delete_quest_event', { p_id: eventId }), signal),
    { label: 'Admin etkinlik silme' },
  )
  if (error) rpcFail(error)
}

// ================= Event quests =================
export async function listAdminEventQuests(eventId: string): Promise<AdminEventQuest[]> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc('admin_list_event_quests', { p_event_id: eventId }), signal),
    { label: 'Admin etkinlik gorevleri listesi' },
  )
  if (error) rpcFail(error)
  return ((data as EventQuestRow[] | null) || []).map(mapEventQuest)
}

export async function upsertAdminEventQuest(input: AdminEventQuestInput): Promise<void> {
  const { error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc('admin_upsert_event_quest', {
      p_event_id: input.eventId,
      p_id: input.id ?? null,
      p_title: input.title,
      p_description: input.description ?? '',
      p_metric_key: input.metricKey,
      p_target_value: input.targetValue,
      p_coin_reward: input.coinReward,
      p_sort_order: input.sortOrder ?? 0,
      p_unlock_requires_quest_id: input.unlockRequiresQuestId ?? null,
      p_is_active: input.isActive ?? true,
    }), signal),
    { label: 'Admin etkinlik gorevi kaydetme' },
  )
  if (error) rpcFail(error)
}

export async function deleteAdminEventQuest(questId: string): Promise<void> {
  const { error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc('admin_delete_event_quest', { p_id: questId }), signal),
    { label: 'Admin etkinlik gorevi silme' },
  )
  if (error) rpcFail(error)
}

export async function setAdminEventQuestActive(questId: string, isActive: boolean): Promise<void> {
  const { error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc('admin_set_event_quest_active', {
      p_quest_id: questId,
      p_is_active: isActive,
    }), signal),
    { label: 'Admin etkinlik gorevi durumu' },
  )
  if (error) rpcFail(error)
}
