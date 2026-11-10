import { useCallback, useEffect, useState } from 'react'
import { customFontKey, ensureCustomFont, registerCustomFontName } from '@/lib/customFonts'
import {
  deleteStylePreset, listCustomFonts, listStylePresets, saveStylePreset, uploadCustomFont,
  type TlCustomFont, type TlItem, type TlStyle, type TlStylePreset,
} from '@/services/translationEditorService'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import { resolveStyle } from './editorModel'
import { txa } from '@/i18n/activeLocale'

/*
 * Team resources (shared across all the fansub's chapters): custom fonts and style library.
 * Font names are saved, files load ahead for preview and publishing.
 */
export function useTeamResources(fansubId: string, pageWidth: number, onToast: (message: string) => void) {
  const [customFonts, setCustomFonts] = useState<TlCustomFont[]>([])
  const [stylePresets, setStylePresets] = useState<TlStylePreset[]>([])
  const [uploadingFont, setUploadingFont] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    listCustomFonts(fansubId, controller.signal).then((fonts) => {
      if (controller.signal.aborted) return
      for (const font of fonts) {
        registerCustomFontName(font.id, font.name)
        void ensureCustomFont(customFontKey(font.id))
      }
      setCustomFonts(fonts)
    }).catch(() => {})
    return () => controller.abort()
  }, [fansubId])

  useEffect(() => {
    const controller = new AbortController()
    listStylePresets(fansubId, controller.signal).then((presets) => { if (!controller.signal.aborted) setStylePresets(presets) }).catch(() => {})
    return () => controller.abort()
  }, [fansubId])

  const savePreset = useCallback(async (name: string, target: TlItem | null) => {
    if (!target) return
    // If the style was never changed by hand the visible font is saved (an empty style cannot be saved).
    const style: TlStyle = Object.keys(target.style).length ? target.style : { font: resolveStyle(target, pageWidth).font }
    try {
      const preset = await saveStylePreset(fansubId, name, style)
      setStylePresets((current) => [...current.filter((entry) => entry.id !== preset.id && entry.name !== preset.name), preset].sort((a, b) => a.name.localeCompare(b.name, 'tr')))
      onToast(txa('"{v1}" ekip stillerine kaydedildi', { v1: preset.name }))
    } catch (error) {
      onToast(toUserFacingErrorMessage(error, txa('Stil kaydedilemedi.')))
    }
  }, [fansubId, onToast, pageWidth])

  const deletePreset = useCallback(async (presetId: string) => {
    try {
      await deleteStylePreset(presetId)
      setStylePresets((current) => current.filter((entry) => entry.id !== presetId))
    } catch (error) {
      onToast(toUserFacingErrorMessage(error, txa('Stil silinemedi.')))
    }
  }, [onToast])

  /** The font uploads; applied to the selected item if any (onApply). */
  const uploadFont = useCallback(async (file: File, onApply: (fontKey: string) => void) => {
    setUploadingFont(true)
    try {
      const font = await uploadCustomFont(fansubId, file)
      registerCustomFontName(font.id, font.name)
      await ensureCustomFont(customFontKey(font.id))
      setCustomFonts((current) => [font, ...current.filter((entry) => entry.id !== font.id)])
      onApply(customFontKey(font.id))
      onToast(txa('"{v1}" yüklendi', { v1: font.name }))
    } catch (error) {
      onToast(toUserFacingErrorMessage(error, txa('Font yüklenemedi.')))
    } finally {
      setUploadingFont(false)
    }
  }, [fansubId, onToast])

  return { customFonts, stylePresets, uploadingFont, savePreset, deletePreset, uploadFont }
}
