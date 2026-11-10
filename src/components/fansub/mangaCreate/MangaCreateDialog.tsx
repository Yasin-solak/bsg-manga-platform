/**
 * MangaCreateDialog: manga add modal inside the studio.
 *
 * Why a modal: adding no longer goes to a separate route; the studio shell stays
 * mounted, with no page reload/remount feeling. After success the list refreshes in place
 * and the user gets an "add a chapter now" shortcut.
 */
import { useState } from 'react'
import { BookPlus, CheckCircle2, FilePlus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { Manga } from '@/types'
import MangaCreateForm from './MangaCreateForm'
import { useMangaCreateForm } from './useMangaCreateForm'
import { txa } from '@/i18n/activeLocale'

interface MangaCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  fansubId: string
  /** Manga olusturulunca cagrilir (liste/sayac tazeleme). */
  onCreated: (manga: Manga) => void
  /** "Add a chapter to this manga" shortcut. */
  onRequestAddChapter?: (manga: Manga) => void
}

export default function MangaCreateDialog({
  open,
  onOpenChange,
  fansubId,
  onCreated,
  onRequestAddChapter,
}: MangaCreateDialogProps) {
  const [createdManga, setCreatedManga] = useState<Manga | null>(null)

  const form = useMangaCreateForm({
    fansubId,
    onSuccess: (manga) => {
      onCreated(manga)
      setCreatedManga(manga)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92vh] w-full overflow-y-auto p-5 sm:max-w-[min(980px,calc(100%-2rem))] sm:p-6"
        aria-describedby="manga-create-desc"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <BookPlus className="h-4 w-4 text-primary" />
            </span>
            {txa('Manga Ekle')}
          </DialogTitle>
          <DialogDescription id="manga-create-desc">
            {txa('Zorunlu alanlar * ile isaretlidir. Kaydedince liste otomatik guncellenir.')}
          </DialogDescription>
        </DialogHeader>

        {createdManga ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-chart-2/15 text-chart-2">
              <CheckCircle2 className="h-7 w-7" />
            </span>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-foreground">{txa('Manga olusturuldu')}</h3>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{createdManga.title}</span>{' '}{txa('kaydi eklendi. Simdi ilk bolumu yukleyebilirsin.')}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {txa('Kapat')}
              </Button>
              {onRequestAddChapter && (
                <Button
                  className="gap-1.5"
                  onClick={() => {
                    const manga = createdManga
                    onOpenChange(false)
                    onRequestAddChapter(manga)
                  }}
                >
                  <FilePlus className="h-4 w-4" />
                  {txa('Bu mangaya bolum ekle')}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <MangaCreateForm form={form} variant="modal" onCancel={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}
