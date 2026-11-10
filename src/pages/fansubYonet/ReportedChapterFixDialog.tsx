/**
 * ReportedChapterFixDialog: dialog for a fansub admin to edit the pages
 * (add/remove/order images) + title of a reported and removed chapter and resubmit it for
 * review.
 *
 * The existing FansubChapterEditModal is reused as the presentation component; the flow follows the
 * FansubYonetChaptersTab chapter edit pattern, the only difference being the
 * save call fixReportedChapter.
 *
 * Permission is checked in the RPC (fansub_fix_reported_chapter is fansub admin only).
 */
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  fixReportedChapter,
  getFansubManageChapterEditData,
  type FansubReportedContentItem,
} from '@/services/fansubManageService'
import { uploadChapterPages } from '@/services/storageService'
import { resolveChapterPageUrl } from '@/services/assetUrlService'
import { toast } from '@/services/toastService'
import FansubChapterEditModal from '@/components/fansub/FansubChapterEditModal'
import {
  createLocalDraftId,
  revokeDraftPagePreviews,
  type ChapterPageItem,
} from '../fansubYonetChapterEditUtils'
import { toErrorText } from './useFansubYonetState'
import { txa } from '@/i18n/activeLocale'

interface ReportedChapterFixDialogProps {
  item: FansubReportedContentItem | null
  fansubId: string
  open: boolean
  onClose: () => void
  onFixed: () => void
}

export default function ReportedChapterFixDialog({ item, fansubId, open, onClose, onFixed }: ReportedChapterFixDialogProps) {
  const [titleDraft, setTitleDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [pageItems, setPageItems] = useState<ChapterPageItem[]>([])

  const metaRef = useRef<{ mangaId: string; chapterNumber: number } | null>(null)
  const pageItemsRef = useRef<ChapterPageItem[]>([])
  pageItemsRef.current = pageItems

  // Load chapter data.
  useEffect(() => {
    if (!item || !open) return
    const chapterId = item.targetId
    let disposed = false
    setLoading(true)
    setError(null)
    setPageItems([])
    metaRef.current = null

    void (async () => {
      try {
        const data = await getFansubManageChapterEditData(fansubId, chapterId)
        if (disposed) return
        metaRef.current = { mangaId: data.mangaId, chapterNumber: data.chapterNumber }
        setTitleDraft(data.title || '')
        setPageItems(
          data.pages.map((url, index) => ({
            id: `existing-${index}-${createLocalDraftId()}`,
            source: 'existing' as const,
            assetRef: url,
            previewUrl: resolveChapterPageUrl(url) || url,
          })),
        )
      } catch (err) {
        if (!disposed) setError(toErrorText(err, txa('Bolum detaylari yuklenemedi.')))
      } finally {
        if (!disposed) setLoading(false)
      }
    })()

    return () => { disposed = true }
  }, [item, open, fansubId])

  // On close clear new page previews + reset state.
  useEffect(() => {
    if (open) return
    revokeDraftPagePreviews(pageItemsRef.current)
    setPageItems([])
    setTitleDraft('')
    setError(null)
    setLoading(false)
    metaRef.current = null
  }, [open])

  useEffect(() => () => { revokeDraftPagePreviews(pageItemsRef.current) }, [])

  function movePage(pageId: string, direction: 'up' | 'down') {
    setPageItems((prev) => {
      const idx = prev.findIndex((p) => p.id === pageId)
      if (idx < 0) return prev
      const next = direction === 'up' ? idx - 1 : idx + 1
      if (next < 0 || next >= prev.length) return prev
      const copy = [...prev]
      const [moved] = copy.splice(idx, 1)
      copy.splice(next, 0, moved)
      return copy
    })
  }

  function handleNewPageSelect(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return
    const newPages: ChapterPageItem[] = files.map((file) => ({
      id: createLocalDraftId(),
      source: 'new',
      previewUrl: URL.createObjectURL(file),
      file,
    }))
    setPageItems((prev) => [...prev, ...newPages])
    event.target.value = ''
  }

  function removePage(pageId: string) {
    setPageItems((prev) => {
      const target = prev.find((p) => p.id === pageId)
      if (target) revokeDraftPagePreviews([target])
      return prev.filter((p) => p.id !== pageId)
    })
  }

  async function handleSave() {
    if (!item || loading || saving) return
    if (pageItems.length === 0) {
      toast.warning(txa('Bolum en az bir sayfa icermelidir.'))
      return
    }
    const meta = metaRef.current
    if (!meta) {
      toast.error(txa('Bolum bilgisi eksik, lutfen modali yeniden acin.'))
      return
    }
    setSaving(true)
    try {
      const uploadMap = new Map<string, string>()
      const newOnly = pageItems.filter(
        (p): p is Extract<ChapterPageItem, { source: 'new' }> => p.source === 'new',
      )
      if (newOnly.length > 0) {
        const uploaded = await uploadChapterPages(
          newOnly.map((p) => p.file),
          meta.mangaId,
          meta.chapterNumber,
          fansubId,
        )
        // Note: the report fix path goes through an RPC, so dimensions are not written in this flow.
        // That is fine: dimensions are keyed by page REFERENCE, unchanged pages' records
        // stay valid, a new page is "unknown" and the reader measures the ratio from the image.
        newOnly.forEach((p, i) => { if (uploaded[i]) uploadMap.set(p.id, uploaded[i].ref) })
      }
      const finalPages = pageItems
        .map((p) => (p.source === 'existing' ? p.assetRef : uploadMap.get(p.id) || ''))
        .filter(Boolean)
      if (finalPages.length !== pageItems.length) {
        throw new Error(txa('Sayfa sirasi olusturulurken bazi yeni sayfalar yuklenemedi.'))
      }
      await fixReportedChapter(item.id, { title: titleDraft.trim() || undefined, pages: finalPages })
      toast.success(txa('Bolum duzeltildi ve yeniden incelemeye gonderildi.'))
      onFixed()
      onClose()
    } catch (err) {
      toast.error(toErrorText(err, txa('Bolum duzeltilemedi.')))
    } finally {
      setSaving(false)
    }
  }

  const existingPageCount = pageItems.filter((p) => p.source === 'existing').length
  const newPageCount = pageItems.filter((p) => p.source === 'new').length

  return (
    <FansubChapterEditModal
      isOpen={open}
      chapterTitleDraft={titleDraft}
      chapterEditLoading={loading}
      chapterEditError={error}
      chapterExistingPageCount={existingPageCount}
      chapterNewPageCount={newPageCount}
      chapterPageItems={pageItems.map((p) => ({ id: p.id, source: p.source, previewUrl: p.previewUrl }))}
      chapterResultPageCount={pageItems.length}
      chapterSaving={saving}
      onTitleChange={setTitleDraft}
      onMovePage={movePage}
      onSelectNewPages={handleNewPageSelect}
      onRemovePage={removePage}
      onClose={() => { if (!saving) onClose() }}
      onSave={handleSave}
    />
  )
}
