/**
 * ChapterCreateDialog: chapter add modal inside the studio.
 *
 * Adding happens inside the studio shell without a separate route; no page
 * reload/remount. After success the list refreshes in place.
 */
import { useState } from 'react'
import { CheckCircle2, FilePlus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { Chapter } from '@/types'
import ChapterCreateForm from './ChapterCreateForm'
import { getChapterCreationFeedback } from './chapterCreationFeedback'
import { useChapterCreateForm } from './useChapterCreateForm'
import { txa } from '@/i18n/activeLocale'

interface ChapterCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  fansubId: string
  defaultMangaId?: string
  /** Chapter number entered during setup; the form opens with it. */
  defaultChapterNumber?: number
  /** Ready pages (Translation Studio output); the form opens with them. */
  initialPageFiles?: File[]
  /** Bolum olusturulunca cagrilir (liste/sayac tazeleme). */
  onCreated: (chapter: Chapter) => void
  /** Adding another chapter to the same manga needs a new modal. */
  onRequestAddAnother?: (mangaId: string) => void
}

export default function ChapterCreateDialog({
  open,
  onOpenChange,
  fansubId,
  defaultMangaId,
  defaultChapterNumber,
  initialPageFiles,
  onCreated,
  onRequestAddAnother,
}: ChapterCreateDialogProps) {
  const [created, setCreated] = useState<{ chapter: Chapter; mangaId: string; label: string } | null>(null)

  const form = useChapterCreateForm({
    fansubId,
    defaultMangaId,
    defaultChapterNumber,
    initialPageFiles,
    onSuccess: (chapter) => {
      onCreated(chapter)
      setCreated({
        chapter,
        mangaId: chapter.mangaId,
        label: `${txa('{v1}. Bolum', { v1: chapter.chapterNumber })}${chapter.title ? ` - ${chapter.title}` : ''}`,
      })
    },
  })

  const feedback = created ? getChapterCreationFeedback(created.chapter) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92vh] w-full overflow-y-auto p-5 sm:max-w-[min(1040px,calc(100%-2rem))] sm:p-6"
        aria-describedby="chapter-create-desc"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <FilePlus className="h-4 w-4 text-primary" />
            </span>
            {txa('Bolum Ekle')}
          </DialogTitle>
          <DialogDescription id="chapter-create-desc">
            {txa('Zorunlu alanlar * ile isaretlidir. Sayfalar otomatik birlestirilir ve sikistirilir.')}
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-chart-2/15 text-chart-2">
              <CheckCircle2 className="h-7 w-7" />
            </span>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-foreground">{feedback?.title}</h3>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{created.label}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                {feedback?.description}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {txa('Kapat')}
              </Button>
              {onRequestAddAnother && (
                <Button
                  className="gap-1.5"
                  onClick={() => {
                    const mangaId = created.mangaId
                    onOpenChange(false)
                    onRequestAddAnother(mangaId)
                  }}
                >
                  <FilePlus className="h-4 w-4" />
                  {txa('Bir bolum daha ekle')}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <ChapterCreateForm form={form} variant="modal" onCancel={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}
