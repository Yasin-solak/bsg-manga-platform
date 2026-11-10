import type { FansubPermission } from '@/services/fansubRolesService'
import { PAINT_TOOLS, SELECT_TOOLS, type ToolId } from './editor/editorModel'

/*
 * Translation Studio access (Roles and Permissions). The DB and workers already apply the same
 * permissions; the UI only hides or locks what cannot be done.
 */

export interface StudioAccess {
  view: boolean
  /** Open chapters, upload pages, scan, AI translation. */
  project: boolean
  /** Write and approve translation text. */
  text: boolean
  /** Alan ekle / tasi / sil, yazi stili. */
  layout: boolean
  /** Cleaning and retouch tools. */
  clean: boolean
  /** Ekip fontlari, stil kutuphanesi, sozluk. */
  resources: boolean
  publish: boolean
  /** AI (scan, re-read, translation): off on 18+ series. */
  ai: boolean
}

export const FULL_STUDIO_ACCESS: StudioAccess = {
  view: true, project: true, text: true, layout: true, clean: true, resources: true, publish: true, ai: true,
}

export function studioAccessFrom(permissions: ReadonlySet<FansubPermission>): StudioAccess {
  return {
    view: permissions.has('ceviri.gor'),
    project: permissions.has('ceviri.proje'),
    text: permissions.has('ceviri.metin'),
    layout: permissions.has('ceviri.dizgi'),
    clean: permissions.has('ceviri.temizlik'),
    resources: permissions.has('ceviri.kaynak'),
    publish: permissions.has('ceviri.yayinla'),
    ai: true,
  }
}

const LAYOUT_TOOLS: ToolId[] = ['ekle', 'kement', 'metin', 'stil']

/** Tools shown in the tool rail: navigation for everyone, others by permission. */
export function toolAllowed(tool: ToolId, access: StudioAccess) {
  if (LAYOUT_TOOLS.includes(tool)) return access.layout
  if (PAINT_TOOLS.includes(tool) || SELECT_TOOLS.includes(tool)) return access.clean
  return true
}
