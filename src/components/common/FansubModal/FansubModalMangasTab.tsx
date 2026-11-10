import type { ChapterRow, MangasTabProps } from './FansubModalTabPanels.types'
import { txa } from '@/i18n/activeLocale'

export function FansubModalMangasTab({
  chapters,
  activeMangaId,
  onToggleMangaGroup,
  onRemoveChapter,
}: MangasTabProps) {
  const groupedChapters = Object.values(
    chapters.reduce<Record<string, { manga: ChapterRow['mangas']; chapters: ChapterRow[] }>>(
      (acc, chapter) => {
        const mangaId = chapter.manga_id
        if (!acc[mangaId]) {
          acc[mangaId] = { manga: chapter.mangas, chapters: [] }
        }
        acc[mangaId].chapters.push(chapter)
        return acc
      },
      {}
    )
  )

  return (
    <div className="spm-mangas-list">
      {chapters.length === 0 && (
        <p className="spm-empty-text">{txa('Henüz yüklenmiş bir bölüm yok.')}</p>
      )}

      {groupedChapters.map((group) => {
        const mangaId = group.manga?.id || ''
        return (
          <div key={mangaId} className="spm-manga-group">
            <div className="spm-manga-header" onClick={() => onToggleMangaGroup(mangaId)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <img loading="lazy" decoding="async"
                  src={group.manga?.cover_image_url || ''}
                  alt={group.manga?.title || txa('Manga')}
                  style={{ width: 36, height: 48, objectFit: 'cover', borderRadius: '4px' }}
                />
                <span>{group.manga?.title || txa('Bilinmeyen Manga')}</span>
              </div>
              <span>{activeMangaId === mangaId ? txa('Yukarı') : txa('Aşağı')}</span>
            </div>

            {activeMangaId === mangaId && (
              <div className="spm-chapter-list">
                {group.chapters.map((chapter) => (
                  <div key={chapter.id} className="spm-chapter-item">
                    <span>
                      {txa('Bolum')}{' '}{chapter.chapter_number}{' '}
                      {chapter.title ? `- ${chapter.title}` : ''}
                    </span>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <span className="spm-chapter-date">
                        {new Date(chapter.created_at).toLocaleDateString()}
                      </span>
                      <button
                        onClick={() => void onRemoveChapter(chapter)}
                        className="action-btn delete"
                        title={txa('Bölümü Sil')}
                      >
                        X
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
