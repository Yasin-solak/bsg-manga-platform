import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@/i18n/router'
import { ChevronLeft, Flag, Heart, Link2, MoreHorizontal, Share2, Star } from 'lucide-react'
import ActionSheet, { type ActionSheetItem } from '@/components/common/ActionSheet'
import { toast } from '@/services/toastService'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

/**
 * The prototype's screen top bar: back | title | share | ⋯
 *
 * REPLACES the app's mobile bar (takes over its content) without removing it:
 * removing it broke Layout's height calculation, see
 * MobileTopBarOverrideContext.
 *
 * THE TITLE APPEARS ON SCROLL (`mdBarOpacity` in the prototype): showing the title in the bar while
 * the details are on screen would print the same info twice; when details
 * scroll up the bar answers "where am I".
 *
 * ⋯ opens a BOTTOM ACTION SHEET, not a dropdown: a menu opened in the phone's top
 * corner, out of thumb reach.
 *
 * Measures from the prototype: buttons 44x44 r12, icon 19px, title 14/800.
 */

const TITLE_REVEAL_OFFSET = 96

interface MangaDetailTopBarProps {
  title: string
  /** Not given if the report flag is off; the row is not drawn at all. */
  onReport?: () => void
  isFollowing: boolean
  onFollowToggle: () => void
  onOpenRating: () => void
  userRating: number
}

export default function MangaDetailTopBar({
  title,
  onReport,
  isFollowing,
  onFollowToggle,
  onOpenRating,
  userRating,
}: MangaDetailTopBarProps) {
  const navigate = useNavigate()
  const [titleVisible, setTitleVisible] = useState(false)

  useEffect(() => {
    const update = () => setTitleVisible(window.scrollY > TITLE_REVEAL_OFFSET)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success(txa('Bağlantı kopyalandı.'))
    } catch {
      // Clipboard access can be denied (permission, insecure context). Staying silent
      // would feel like "I tapped and nothing happened".
      toast.error(txa('Bağlantı kopyalanamadı.'))
    }
  }

  const share = () => {
    if (navigator.share) {
      void navigator.share({ title, url: window.location.href }).catch(() => {
        // Kullanici paylasim sayfasini kapattiysa hata degildir; sessiz gec.
      })
      return
    }
    void copyLink()
  }

  /*
   * Follow and Rate are also in the details; repeating them here is intentional. The bar
   * stays on screen throughout, while details stay above after the first screen:
   * scrolling a user wanting to follow in the middle of 84 chapters back to the top
   * would make them travel the page twice.
   */
  const sheetItems = useMemo<ActionSheetItem[]>(() => {
    const items: ActionSheetItem[] = [
      { id: 'copy', label: txa('Bağlantıyı kopyala'), icon: Link2, onSelect: () => { void copyLink() } },
      {
        id: 'follow',
        label: isFollowing ? txa('Takibi bırak') : txa('Takip et'),
        icon: Heart,
        onSelect: onFollowToggle,
      },
      {
        id: 'rate',
        label: userRating > 0 ? txa('Puanını değiştir ({rating}/5)', { rating: userRating }) : txa('Puanla'),
        icon: Star,
        onSelect: onOpenRating,
      },
    ]
    if (onReport) {
      items.push({ id: 'report', label: txa('Seriyi raporla'), icon: Flag, onSelect: onReport, destructive: true })
    }
    return items
    // copyLink her renderda yeniden kuruluyor ama kapanis degeri yok
    // (window'dan okuyor), bagimliliga gerek yok.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFollowing, onFollowToggle, onOpenRating, onReport, userRating])

  return (
    <div className="-mx-2 flex w-[calc(100%_+_1rem)] items-center gap-1.5">
      <button
        type="button"
        onClick={() => navigate(-1)}
        aria-label={txa('Geri dön')}
        data-testid="manga-detail-back"
        className="flex size-11 shrink-0 items-center justify-center rounded-[12px] text-foreground transition-colors hover:bg-accent"
      >
        <ChevronLeft className="size-[19px]" />
      </button>

      <div
        data-testid="manga-detail-topbar-title"
        className={cn(
          'min-w-0 flex-1 truncate text-sm font-extrabold tracking-[-0.01em] transition-opacity duration-200',
          titleVisible ? 'opacity-100' : 'opacity-0',
        )}
        aria-hidden={!titleVisible}
      >
        {title}
      </div>

      <button
        type="button"
        onClick={share}
        aria-label={txa('Seriyi paylaş')}
        data-testid="manga-detail-share"
        className="flex size-11 shrink-0 items-center justify-center rounded-[12px] text-foreground transition-colors hover:bg-accent"
      >
        <Share2 className="size-[19px]" />
      </button>

      <ActionSheet
        title={txa('Seri işlemleri')}
        description={txa('Bu seri için yapabileceklerin')}
        items={sheetItems}
        trigger={(
          <button
            type="button"
            aria-label={txa('Diğer seçenekler')}
            data-testid="manga-detail-more"
            className="flex size-11 shrink-0 items-center justify-center rounded-[12px] text-foreground transition-colors hover:bg-accent"
          >
            <MoreHorizontal className="size-[19px]" />
          </button>
        )}
      />
    </div>
  )
}
