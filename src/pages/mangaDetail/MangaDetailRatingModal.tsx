import { Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

interface MangaDetailRatingModalProps {
  isOpen: boolean
  userRating: number
  onClose: () => void
  onRatingChange: (rating: number) => void
  onSubmit: (rating: number) => void
}

export default function MangaDetailRatingModal({
  isOpen,
  userRating,
  onClose,
  onRatingChange,
  onSubmit,
}: MangaDetailRatingModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[90%] max-w-xs rounded-xl border border-border bg-card p-5 text-center shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="mb-3 font-semibold">{txa('Mangayı Değerlendir')}</p>
        <div className="mb-3 flex justify-center gap-1.5">
          {[1, 2, 3, 4, 5].map((score) => (
            <button
              key={score}
              type="button"
              aria-label={txa('{score} puan seç', { score })}
              className={cn('transition-transform', score <= userRating ? 'scale-110' : 'opacity-50 hover:opacity-70')}
              onClick={() => onRatingChange(score)}
            >
              <Star className={cn('h-6 w-6', score <= userRating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')} />
            </button>
          ))}
        </div>
        <p className="mb-3 text-sm text-muted-foreground">{userRating > 0 ? `${userRating}/5` : txa('Yıldıza tıklayın')}</p>
        <div className="flex justify-center gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>{txa('İptal')}</Button>
          <Button size="sm" onClick={() => onSubmit(userRating)} disabled={userRating === 0}>{txa('Gönder')}</Button>
        </div>
      </div>
    </div>
  )
}
