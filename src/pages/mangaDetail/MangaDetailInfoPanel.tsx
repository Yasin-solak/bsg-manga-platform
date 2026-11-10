import { Link } from '@/i18n/router'
import { Info } from 'lucide-react'
import { buildExplorePath, buildPublicFansubPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { deriveTranslationTeams, formatTeamMeta } from './mangaDetailTeams'
import type { Chapter, Manga } from '@/types'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface MangaDetailInfoPanelProps {
  manga: Manga
  chapters: Chapter[]
  chaptersCount: number
  formatGenreLabel: (genre: string) => string
  statusLabel: (status?: string) => string
}

export default function MangaDetailInfoPanel({
  manga,
  chapters,
  chaptersCount,
  formatGenreLabel,
  statusLabel,
}: MangaDetailInfoPanelProps) {
  const teams = deriveTranslationTeams(chapters)

  return (
    <div className="space-y-[22px]">
      <div className="overflow-hidden rounded-[14px] border border-border">
        {[
          { label: txa('Durum'), value: statusLabel(manga.status) },
          { label: txa('Görüntüleme'), value: manga.views?.toLocaleString(intlLocale()) },
          { label: txa('Takipçi'), value: manga.followerCount?.toLocaleString(intlLocale()) },
          { label: txa('Bölüm Sayısı'), value: String(chaptersCount) },
        ].filter((row) => row.value).map((row) => (
          <div
            key={txa(row.label)}
            className="flex items-center justify-between gap-3.5 border-b border-border/60 bg-card px-3.5 py-[11px]"
          >
            <span className="shrink-0 text-[12.5px] font-semibold text-muted-foreground">{txa(row.label)}</span>
            <span className="min-w-0 text-right text-[12.5px] font-extrabold">{row.value}</span>
          </div>
        ))}

        {manga.genres && manga.genres.length > 0 ? (
          <div className="flex items-start justify-between gap-3.5 bg-card px-3.5 py-[11px]">
            <span className="shrink-0 text-[12.5px] font-semibold text-muted-foreground">{txa('Türler')}</span>
            <div className="flex flex-wrap justify-end gap-[5px]">
              {manga.genres.map((genre, index) => (
                <Link
                  key={index}
                  to={buildExplorePath({ genres: genre.toLowerCase() })}
                  className="rounded-[7px] bg-secondary px-2 py-[3px] text-[11px] font-extrabold text-secondary-foreground transition-colors hover:bg-primary/15 hover:text-primary"
                >
                  {txa(formatGenreLabel(genre))}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {teams.length > 0 ? (
        <section data-testid="manga-detail-teams">
          <div className="flex items-baseline justify-between">
            <h3 className="m-0 text-[13px] font-black uppercase tracking-[0.045em]">{txa('Çeviren ekipler')}</h3>
            <span className="text-[11px] font-bold text-muted-foreground">
              {teams.length === 1 ? txa('1 ekip') : txa('{count} ekip', { count: teams.length })}
            </span>
          </div>

          <div className="mt-[9px] overflow-hidden rounded-[14px] border border-border">
            {teams.map((team) => (
              <div
                key={team.fansub.id}
                data-testid="manga-detail-team-row"
                className={cn(
                  'flex items-center gap-[11px] border-b border-border/60 px-3 py-[11px] last:border-b-0',
                  team.isMain ? 'bg-primary/5' : 'bg-card',
                )}
              >
                {team.fansub.avatar ? (
                  <img
                    src={team.fansub.avatar}
                    alt=""
                    loading="lazy"
                    className="size-9 shrink-0 rounded-[11px] object-cover"
                  />
                ) : (
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-muted text-[13px] font-black text-muted-foreground">
                    {team.fansub.name.charAt(0).toUpperCase()}
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="min-w-0 truncate text-[12.5px] font-black">{team.fansub.name}</span>
                    {team.isMain ? (
                      <span className="shrink-0 rounded-[6px] bg-primary/15 px-1.5 py-0.5 text-[9px] font-black tracking-[0.04em] text-primary">
                        {txa('ANA EKIP')}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-[3px] text-[11px] font-semibold text-muted-foreground">
                    {formatTeamMeta(team)}
                  </div>
                  <div className="mt-[7px] h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn('h-full rounded-full', team.isMain ? 'bg-primary' : 'bg-muted-foreground/50')}
                      style={{ width: `${Math.round(team.share * 100)}%` }}
                    />
                  </div>
                </div>

                <Link
                  to={buildPublicFansubPath({ id: team.fansub.id, slug: team.fansub.slug })}
                  className="flex h-9 shrink-0 items-center rounded-[10px] border border-border px-3 text-[11.5px] font-extrabold text-foreground/80 transition-colors hover:border-primary hover:text-primary"
                >
                  {txa('Ekip')}
                </Link>
              </div>
            ))}
          </div>

          <div className="mt-[11px] flex items-center gap-[9px] rounded-[13px] border border-border bg-muted/40 px-3 py-[11px]">
            <Info className="size-[15px] shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1 text-[11.5px] font-bold leading-[1.45] text-muted-foreground">
              {txa('Bölüm listesindeki sürüm seçiciyle hangi ekibin çevirisini okuyacağını seçebilirsin.')}
            </span>
          </div>
        </section>
      ) : null}
    </div>
  )
}
