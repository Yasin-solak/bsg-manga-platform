import type { AdminUserDetail, AdminUserDetailInsights } from '@/services/adminUserService'
import { AdminSurface } from '@/components/admin/shared/AdminSurface'
import { Badge } from '@/components/ui/badge'
import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'
import { cn } from '@/lib/utils'
import { formatDateTime, fansubRoleLabel, membershipExitReasonLabel } from './adminUserDetailUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

export function AdminUserReadingTab({ detail, insights }: { detail: AdminUserDetail; insights?: AdminUserDetailInsights | null }) {
  const readingDays = insights?.activity.daily.slice(-14) ?? []
  const maxReads = Math.max(1, ...readingDays.map((day) => day.reads))
  const readEvents = readingDays.reduce((sum, day) => sum + day.reads, 0)
  const activeReadingDays = readingDays.filter((day) => day.reads > 0).length
  const estimatedHours = Math.floor(detail.stats.estimatedReadMinutes / 60)
  const estimatedMinutes = detail.stats.estimatedReadMinutes % 60

  return (
    <div className="space-y-3" data-testid="admin-user-detail-reading">
      <div className="grid items-stretch gap-3 lg:grid-cols-[1.35fr_0.95fr_0.8fr]">
        <DataSection title={txa('Son Okunanlar')} count={detail.recentReads.length}>
          {detail.recentReads.length === 0 ? <EmptyData text={txa('Okuma kaydı bulunmuyor.')} compact /> : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {detail.recentReads.slice(0, 5).map((read) => (
                <div key={`${read.mangaId}-${read.readAt}`} className="min-w-0">
                  <img
                    src={read.mangaCoverUrl || buildCoverPlaceholder(read.mangaTitle)}
                    alt={txa('{v1} kapak görseli', { v1: read.mangaTitle })}
                    className="h-24 w-full rounded-md border border-border object-cover shadow-sm"
                    loading="lazy"
                    decoding="async"
                  />
                  <p className="mt-1.5 truncate text-[10px] font-semibold text-foreground">{read.mangaTitle}</p>
                  <p className="truncate text-[9px] text-muted-foreground">
                    {read.chapterNumber != null ? txa('{v1}. bölüm', { v1: read.chapterNumber }) : txa('Bölüm bilgisi yok')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </DataSection>

        <DataSection title={txa('Devam Ediyor')} count={detail.topMangas.length}>
          {detail.topMangas.length === 0 ? <EmptyData text={txa('Devam eden seri sinyali yok.')} compact /> : (
            <div className="space-y-1.5">
              {detail.topMangas.slice(0, 5).map((manga) => (
                <div key={manga.mangaId} className="flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-muted/40">
                  <img src={manga.mangaCoverUrl || buildCoverPlaceholder(manga.mangaTitle)} alt="" className="h-8 w-6 shrink-0 rounded object-cover" loading="lazy" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10px] font-semibold text-foreground">{manga.mangaTitle}</p>
                    <p className="text-[9px] text-muted-foreground">{txa('Son bölüm {v1}', { v1: manga.lastChapterNumber ?? '—' })}</p>
                  </div>
                  <span className="text-[9px] tabular-nums text-muted-foreground">{manga.readCount}</span>
                </div>
              ))}
            </div>
          )}
        </DataSection>

        <DataSection title={txa('Okuma Serisi')}>
          <div className="grid grid-cols-2 gap-2">
            <Metric label={txa('Aktif gün')} value={activeReadingDays} />
            <Metric label={txa('14 gün / olay')} value={readEvents} />
          </div>
          <div className="mt-3">
            <p className="text-[10px] text-muted-foreground">{txa('Son 14 gün')}</p>
            <div className="mt-2 grid grid-cols-7 gap-1" aria-label={txa('Son 14 günlük okuma günleri')}>
              {readingDays.map((day) => (
                <span key={day.date} className={cn('aspect-square rounded-full border border-border', day.reads > 0 ? 'border-primary bg-primary' : 'bg-muted')} title={txa('{v1}: {v2} okuma', { v1: day.date, v2: day.reads })} />
              ))}
            </div>
          </div>
        </DataSection>
      </div>

      <div className="grid items-stretch gap-3 lg:grid-cols-3">
        <DataSection title={txa('Tahmini Okuma Süresi')}>
          <p className="text-2xl font-semibold tabular-nums text-foreground">
            {estimatedHours.toLocaleString(intlLocale())} <span className="text-sm font-medium">{txa('saat')}</span>{' '}
            {estimatedMinutes} <span className="text-sm font-medium">{txa('dk')}</span>
          </p>
          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
            {txa('Okuma kaydı başına beş dakikalık ürün tahminidir; gerçek süre telemetrisi değildir.')}
          </p>
        </DataSection>

        <DataSection title={txa('Favori Türler')} count={detail.favoriteGenres.length}>
          {detail.favoriteGenres.length === 0 ? <EmptyData text={txa('Tür dağılımı için yeterli veri yok.')} compact /> : (
            <div className="space-y-2">
              {detail.favoriteGenres.slice(0, 4).map((genre) => (
                <div key={genre.name}>
                  <div className="flex items-center justify-between gap-3 text-[10px]">
                    <span className="font-medium text-foreground">{genre.name}</span>
                    <span className="tabular-nums text-muted-foreground">{txa('%{v1}', { v1: genre.percent })}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, genre.percent))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </DataSection>

        <DataSection title={txa('Okuma Aktivitesi')}>
          {!insights ? <EmptyData text={txa('Günlük okuma olayları henüz hazır değil.')} compact /> : (
            <>
              <div className="flex h-20 items-end gap-1 rounded-lg border border-border bg-muted/20 p-2" role="img" aria-label={txa('Son 14 günlük okuma olayları')}>
                {readingDays.map((day) => (
                  <span key={day.date} className="min-w-0 flex-1 rounded-sm bg-primary/70" style={{ height: `${day.reads === 0 ? 4 : Math.max(12, Math.round((day.reads / maxReads) * 100))}%` }} title={txa('{v1}: {v2} okuma', { v1: new Date(`${day.date}T12:00:00`).toLocaleDateString(intlLocale()), v2: day.reads })} />
                ))}
              </div>
              <p className="mt-2 text-[9px] text-muted-foreground">{txa('Kayıtlı okuma olayları gösterilir.')}</p>
            </>
          )}
        </DataSection>

        <DataSection title={txa('Yer İmleri')} count={detail.topChapters.length}>
          {detail.topChapters.length === 0 ? <EmptyData text={txa('Bölüm yer imi sinyali yok.')} compact /> : (
            <div className="space-y-1.5">
              {detail.topChapters.slice(0, 3).map((chapter) => (
                <div key={chapter.key} className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-2.5 py-1.5">
                  <div className="min-w-0"><p className="truncate text-[10px] font-medium text-foreground">{chapter.mangaTitle}</p><p className="text-[9px] text-muted-foreground">{txa('Bölüm {v1}', { v1: chapter.chapterNumber ?? '—' })}</p></div>
                  <span className="text-[9px] tabular-nums text-muted-foreground">{txa('{v1} okuma', { v1: chapter.readCount })}</span>
                </div>
              ))}
            </div>
          )}
        </DataSection>

        <DataSection title={txa('Veri Kapsamı')}>
          <p className="text-xs font-medium text-primary">{txa('Doğrulanmış okuma kayıtları')}</p>
          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
            {txa('Seri, bölüm ve tür sinyalleri kayıtlı okuma olaylarından gelir. Dakika ve saat değerleri yalnızca tahmindir.')}
          </p>
        </DataSection>

        <DataSection title={txa('Hesap Okuma Özeti')}>
          <div className="grid grid-cols-3 gap-2">
            <Metric label={txa('Okuma')} value={detail.stats.readingCount} />
            <Metric label={txa('Takip')} value={detail.stats.mangaFollows} />
            <Metric label={txa('Seri')} value={detail.topMangas.length} />
          </div>
        </DataSection>
      </div>
    </div>
  )
}

export function AdminUserFansubTab({ detail }: { detail: AdminUserDetail }) {
  return (
    <div className="grid items-start gap-3 lg:grid-cols-2" data-testid="admin-user-detail-fansub">
      <DataSection title={txa('Aktif Üyelikler')} count={detail.fansubMemberships.length}>
        {detail.fansubMemberships.length === 0 ? <EmptyData text={txa('Aktif fansub üyeliği yok.')} /> : (
          <DataList>{detail.fansubMemberships.map((membership) => (
            <DataRow key={`${membership.fansubId}-${membership.joinedAt}`} title={membership.fansubName} meta={`${fansubRoleLabel(membership.role)} · ${membership.fansubIsActive ? txa('Aktif fansub') : txa('Pasif fansub')}${membership.teamTag ? ` · ${membership.teamTag}` : ''}`} sub={txa('Katılım: {v1}', { v1: formatDateTime(membership.joinedAt) })} />
          ))}</DataList>
        )}
      </DataSection>

      <DataSection title={txa('Rol Geçmişi')} count={detail.fansubMembershipHistory.length}>
        {detail.fansubMembershipHistory.length === 0 ? <EmptyData text={txa('Fansub rol geçmişi yok.')} /> : (
          <DataList>{detail.fansubMembershipHistory.map((history) => (
            <DataRow key={history.id} title={history.fansubName} meta={`${fansubRoleLabel(history.role)} · ${membershipExitReasonLabel(history.leftReason)}`} sub={txa('Giriş: {v1}{v2}', { v1: formatDateTime(history.joinedAt), v2: history.leftAt ? txa(' · Çıkış: {v1}', { v1: formatDateTime(history.leftAt) }) : '' })} />
          ))}</DataList>
        )}
      </DataSection>

      <DataSection title={txa('Gönderilen Davetler')} count={detail.sentFansubInvites.length}>
        {detail.sentFansubInvites.length === 0 ? <EmptyData text={txa('Gönderilmiş fansub daveti yok.')} /> : (
          <DataList>{detail.sentFansubInvites.map((invite) => (
            <DataRow key={invite.id} title={invite.fansubName} meta={`@${invite.invitedUsername} · ${invite.role} · ${invite.status}`} sub={invite.respondedAt ? txa('Yanıt: {v1}', { v1: formatDateTime(invite.respondedAt) }) : txa('Gönderim: {v1}', { v1: formatDateTime(invite.createdAt) })} />
          ))}</DataList>
        )}
      </DataSection>

      <DataSection title={txa('Katılım Başvuruları')} count={detail.joinRequests.length}>
        {detail.joinRequests.length === 0 ? <EmptyData text={txa('Fansub başvurusu yok.')} /> : (
          <DataList>{detail.joinRequests.map((request) => (
            <DataRow key={request.id} title={request.fansubName} meta={`${request.status}${request.reviewedByUsername ? ` · @${request.reviewedByUsername}` : ''}`} sub={request.message || request.reviewNote || formatDateTime(request.createdAt)} />
          ))}</DataList>
        )}
      </DataSection>
    </div>
  )
}

export function AdminUserCommentsTab({ detail }: { detail: AdminUserDetail }) {
  return (
    <div data-testid="admin-user-detail-comments">
      <DataSection title={txa('Manga Yorumları')} count={detail.mangaComments.length}>
        {detail.mangaComments.length === 0 ? <EmptyData text={txa('Manga yorumu yok.')} /> : (
          <DataList>{detail.mangaComments.slice(0, 7).map((comment) => (
            <DataRow key={comment.id} title={comment.mangaTitle} meta={comment.content} sub={txa('{v1} beğeni · {v2} · {v3}', { v1: comment.likes, v2: comment.isActive ? txa('Aktif') : txa('Pasif'), v3: formatDateTime(comment.createdAt) })} />
          ))}</DataList>
        )}
      </DataSection>
    </div>
  )
}

function DataSection({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <AdminSurface className="h-full p-3.5">
      <div className="mb-3 flex min-h-7 items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {typeof count === 'number' ? <Badge variant="secondary">{count}</Badge> : null}
      </div>
      {children}
    </AdminSurface>
  )
}

function DataList({ children }: { children: React.ReactNode }) {
  return <div className="space-y-2">{children}</div>
}

function DataRow({ title, meta, sub }: { title: string; meta?: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-2.5">
      <p className="text-xs font-semibold text-foreground">{title}</p>
      {meta ? <p className="mt-1 line-clamp-2 break-words text-[11px] leading-4 text-muted-foreground">{meta}</p> : null}
      {sub ? <p className="mt-1 break-words text-[10px] leading-4 text-muted-foreground">{sub}</p> : null}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-2.5">
      <p className="text-lg font-semibold tabular-nums text-foreground">{value.toLocaleString(intlLocale())}</p>
      <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{label}</p>
    </div>
  )
}

function EmptyData({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <p className={cn('rounded-lg border border-dashed border-border text-center text-xs text-muted-foreground', compact ? 'px-3 py-4' : 'p-5')}>
      {text}
    </p>
  )
}
