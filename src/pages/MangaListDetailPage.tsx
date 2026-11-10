import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Navigate } from '@/i18n/router'
import type { Comment, Manga, RelatedFansub, RelatedManga, RelatedUser } from '@/types'
import type { FrameType } from '@components/common/AvatarFrame'
import { useAuth } from '@/contexts/AuthContext'
import { listMangas } from '@/services/mangaService'
import { CommentThread } from '@/components/common/CommentThread'
import { ReportModal } from '@/components/common/ReportModal/ReportModal'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { buildPublicMangaPath } from '@/lib/routes'
import {
  getMangaListDetail,
  listMangaListComments,
  postMangaListComment,
  setMangaListCommentReaction,
  setMangaListRating,
  updateMangaList,
  type MangaListCommentSortBy,
  type MangaListDetail,
} from '@/services/mangaListService'
import { getRuntimeFeatureFlags, listenFeatureFlagUpdates } from '@/services/featureFlagService'
import { showInactiveFeatureToast } from '@/services/inactiveFeatureToast'
import { resolveCommentMentionContext } from '@/services/commentMentionService'
import { createScopedLogger } from '@/services/logger'
import { createRequestContext } from '@/services/requestContext'
import { reportUserFacingError } from '@/services/userFacingError'
import type { ReportTargetType } from '@/services/reportService'
import { toast } from '@/services/toastService'
import {
  LIST_DESCRIPTION_MAX_LENGTH,
  LIST_TITLE_MAX_LENGTH,
  LIST_TITLE_MIN_LENGTH,
  MANGA_LIST_ITEM_NOTE_MAX_LENGTH,
  MANGA_LIST_MIN_ITEM_COUNT,
} from '@/pages/mangaLists/mangaListsPage.shared'
import {
  Home,
  BookOpen,
  MessageSquare,
  Loader2,
} from 'lucide-react'

// Subcomponents
import { MangaListDetailActionBar, MangaListDetailHero } from './mangaLists/MangaListDetailHero'
import { MangaListDetailTable } from './mangaLists/MangaListDetailTable'
import { MangaListDetailSidebar } from './mangaLists/MangaListDetailSidebar'
import { MangaListDetailEditDialog } from './mangaLists/MangaListDetailEditDialog'
import { txa, getActiveLocale } from '@/i18n/activeLocale'
import { localizeHref } from '@/i18n/localizedRoutes'

const logger = createScopedLogger('MangaListDetailPage')

/* ------------------------------------------------------------------ */
/* Tab definitions */
/* ------------------------------------------------------------------ */
type TabKey = 'overview' | 'series' | 'comments'

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'overview', get label() { return txa('Genel Bakış') }, icon: Home },
  { key: 'series', get label() { return txa('Seriler') }, icon: BookOpen },
  { key: 'comments', get label() { return txa('Yorumlar') }, icon: MessageSquare },
]

/* ------------------------------------------------------------------ */
/* Helper: Manga item → Manga type conversion */
/* ------------------------------------------------------------------ */
function mapItemToManga(item: MangaListDetail['items'][number]): Manga {
  return { id: item.mangaId, title: item.title, coverImage: item.coverImage, lastChapter: item.lastChapter, isNew: item.isNew, rating: item.rating }
}

/* ------------------------------------------------------------------ */
/* Main page component */
/* ------------------------------------------------------------------ */
function MangaListDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { currentUser } = useAuth()

  // Page data
  const [detail, setDetail] = useState<MangaListDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('series')

  // Yorum state
  const [comments, setComments] = useState<Comment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(true)
  const [commentSortBy, setCommentSortBy] = useState<MangaListCommentSortBy>('newest')
  const [newComment, setNewComment] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [resolvedMentionedUsers, setResolvedMentionedUsers] = useState<RelatedUser[]>([])
  const [resolvedRelatedFansubs, setResolvedRelatedFansubs] = useState<RelatedFansub[]>([])
  const [resolvedMentionedMangas, setResolvedMentionedMangas] = useState<RelatedManga[]>([])

  // Rapor state
  const [isReportsEnabled, setIsReportsEnabled] = useState(false)
  const [isReportModalOpen, setIsReportModalOpen] = useState(false)
  const [reportTargetId, setReportTargetId] = useState('')
  const [reportTargetType, setReportTargetType] = useState<ReportTargetType>('manga_list_comment')

  // Edit state
  const [editOpen, setEditOpen] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editIsPublic, setEditIsPublic] = useState(true)
  const [editSearchQuery, setEditSearchQuery] = useState('')
  const [editSearchLoading, setEditSearchLoading] = useState(false)
  const [editSearchResults, setEditSearchResults] = useState<Manga[]>([])
  const [editSelectedMangas, setEditSelectedMangas] = useState<Manga[]>([])
  const [editNotes, setEditNotes] = useState<Record<string, string>>({})

  const editSelectedIds = useMemo(() => new Set(editSelectedMangas.map((m) => m.id)), [editSelectedMangas])

  const totalCommentCount = useMemo(() => {
    const count = (nodes: Comment[]): number => nodes.reduce((a, n) => a + 1 + count(n.replies || []), 0)
    return count(comments)
  }, [comments])

  const clearMentions = useCallback(() => {
    setResolvedMentionedUsers([])
    setResolvedRelatedFansubs([])
    setResolvedMentionedMangas([])
  }, [])

  const resolveMentions = useCallback(async (rows: Comment[], signal?: AbortSignal) => {
    try {
      const r = await resolveCommentMentionContext(rows, signal)
      if (signal?.aborted) return
      setResolvedMentionedUsers(r.mentionedUsers)
      setResolvedRelatedFansubs(r.relatedFansubs)
      setResolvedMentionedMangas(r.mentionedMangas)
    } catch {
      if (!signal?.aborted) clearMentions()
    }
  }, [clearMentions])

  // ── Feature flags ──
  useEffect(() => {
    let cancelled = false
    const load = async (force = false) => {
      const flags = await getRuntimeFeatureFlags(['moderation.reports'], false, force)
      if (!cancelled) setIsReportsEnabled(flags['moderation.reports'] === true)
    }
    void load()
    const unsub = listenFeatureFlagUpdates((p) => { if (p.key === 'moderation.reports') void load(true) })
    return () => { cancelled = true; unsub() }
  }, [])

  useEffect(() => { if (!isReportsEnabled) setIsReportModalOpen(false) }, [isReportsEnabled])

  // ── List detail loading ──
  useEffect(() => {
    if (!id) return
    let m = true
    setLoading(true); setNotFound(false)
    void (async () => {
      const data = await getMangaListDetail(id)
      if (!m) return
      if (!data) { setNotFound(true); setDetail(null); setLoading(false); return }
      setDetail(data); setLoading(false)
    })()
    return () => { m = false }
  }, [id])

  // ── Yorumlar ──
  useEffect(() => {
    if (!id) return
    let m = true
    const ctrl = new AbortController()
    setCommentsLoading(true)
    void (async () => {
      try {
        const rows = await listMangaListComments(id, commentSortBy)
        if (!m) return
        setComments(rows)
        await resolveMentions(rows, ctrl.signal)
      } catch { if (m) { setComments([]); clearMentions() } }
      finally { if (m) setCommentsLoading(false) }
    })()
    return () => { m = false; ctrl.abort() }
  }, [id, commentSortBy, clearMentions, resolveMentions])

  // ── Edit search ──
  useEffect(() => {
    if (!editOpen) return
    const q = editSearchQuery.trim()
    if (q.length < 2) { setEditSearchResults([]); setEditSearchLoading(false); return }
    let c = false
    setEditSearchLoading(true)
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const r = await listMangas({ search: q, sort: 'popular', page: 1, limit: 10 })
          if (!c) setEditSearchResults(r.data || [])
        } catch { if (!c) setEditSearchResults([]) }
        finally { if (!c) setEditSearchLoading(false) }
      })()
    }, 260)
    return () => { c = true; window.clearTimeout(t) }
  }, [editOpen, editSearchQuery])

  // ── Helpers ──
  const refreshDetail = async () => { if (id) { const n = await getMangaListDetail(id); if (n) setDetail(n) } }

  const openEditDialog = () => {
    if (!detail) return
    setEditTitle(detail.title); setEditDescription(detail.description || ''); setEditIsPublic(detail.isPublic)
    setEditSelectedMangas(detail.items.map(mapItemToManga))
    const n: Record<string, string> = {}; detail.items.forEach((i) => { n[i.mangaId] = i.note || '' }); setEditNotes(n)
    setEditSearchQuery(''); setEditSearchResults([]); setEditOpen(true)
  }

  // ── Comment reaction helpers ──
  const patchReaction = (list: Comment[], cid: string, patch: Pick<Comment, 'isLiked' | 'isDisliked' | 'likes' | 'dislikes'>): Comment[] =>
    list.map((e) => e.id === cid ? { ...e, ...patch } : e.replies?.length ? { ...e, replies: patchReaction(e.replies, cid, patch) } : e)

  const findComment = (list: Comment[], cid: string): Comment | null => {
    for (const e of list) { if (e.id === cid) return e; if (e.replies?.length) { const f = findComment(e.replies, cid); if (f) return f } }
    return null
  }

  // ── Handler'lar ──
  const handleRate = async (score: number) => {
    if (!detail) return
    if (!currentUser) return toast.warning(txa('Puan vermek için giriş yapmalısınız.'))
    try {
      const r = await setMangaListRating(detail.id, score)
      setDetail((p) => p ? { ...p, ratingAvg: r.ratingAvg, ratingsCount: r.ratingsCount, myRating: r.userRating } : p)
      toast.success(txa('Liste puanınız kaydedildi.'))
    } catch (err) {
      const ctx = createRequestContext('MangaListDetailPage', 'rate-list', { listId: detail.id, score })
      toast.error(reportUserFacingError(logger, { event: ctx.event, error: err, fallback: txa('Liste puanı kaydedilemedi.'), requestContext: ctx }).userMessage)
    }
  }

  const handleReaction = async (commentId: string, type: 'like' | 'dislike') => {
    const cur = findComment(comments, commentId)
    if (!cur) return
    const reaction = type === 'like' ? (cur.isLiked ? 'none' : 'like') : (cur.isDisliked ? 'none' : 'dislike')
    try {
      const r = await setMangaListCommentReaction(commentId, reaction as 'like' | 'dislike' | 'none')
      setComments((p) => patchReaction(p, commentId, { isLiked: r.isLiked, isDisliked: r.isDisliked, likes: r.likes, dislikes: r.dislikes }))
    } catch (err) {
      const ctx = createRequestContext('MangaListDetailPage', `${type}-comment`, { listId: id, commentId })
      toast.error(reportUserFacingError(logger, { event: ctx.event, error: err, fallback: txa('Reaksiyon güncellenemedi.'), requestContext: ctx }).userMessage)
    }
  }

  const handleAddComment = async (isSpoiler = false) => {
    if (!id || !currentUser) return !currentUser ? toast.warning(txa('Yorum yapmak için giriş yapmalısınız.')) : undefined
    if (!newComment.trim()) return
    try {
      await postMangaListComment(id, newComment.trim(), undefined, { isSpoiler })
      setNewComment('')
      const rows = await listMangaListComments(id, commentSortBy)
      setComments(rows); await resolveMentions(rows); await refreshDetail()
    } catch (err) {
      const ctx = createRequestContext('MangaListDetailPage', 'add-comment', { listId: id })
      toast.error(reportUserFacingError(logger, { event: ctx.event, error: err, fallback: txa('Yorum gönderilemedi.'), requestContext: ctx }).userMessage)
    }
  }

  const handleSubmitReply = async (parentId: string, replyToId?: string, isSpoiler = false) => {
    if (!id || !currentUser) return !currentUser ? toast.warning(txa('Yanıt vermek için giriş yapmalısınız.')) : undefined
    if (!replyText.trim()) return
    try {
      await postMangaListComment(id, replyText.trim(), replyToId || parentId, { isSpoiler })
      setReplyText(''); setReplyingTo(null)
      const rows = await listMangaListComments(id, commentSortBy)
      setComments(rows); await resolveMentions(rows); await refreshDetail()
    } catch (err) {
      const ctx = createRequestContext('MangaListDetailPage', 'reply-comment', { listId: id, parentId: replyToId || parentId })
      toast.error(reportUserFacingError(logger, { event: ctx.event, error: err, fallback: txa('Yanıt gönderilemedi.'), requestContext: ctx }).userMessage)
    }
  }

  const handleReport = (commentId: string) => {
    if (!isReportsEnabled) { showInactiveFeatureToast('Raporlama sistemi'); return }
    setReportTargetId(commentId); setReportTargetType('manga_list_comment'); setIsReportModalOpen(true)
  }

  const handleShareList = async () => {
    if (!detail) return

    const sharePath = `/listeler/${encodeURIComponent(detail.id)}`
    const shareUrl = typeof window === 'undefined'
      ? sharePath
      : new URL(localizeHref(sharePath, getActiveLocale()), window.location.origin).toString()

    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: detail.title, text: detail.description || txa('Manga listesini incele.'), url: shareUrl })
        return
      }

      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl)
        toast.success(txa('Liste bağlantısı kopyalandı.'))
        return
      }

      toast.info(txa('Paylaşım bağlantısı hazırlanamadı.'))
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return
      const ctx = createRequestContext('MangaListDetailPage', 'share-list', { listId: detail.id })
      toast.error(reportUserFacingError(logger, { event: ctx.event, error: err, fallback: txa('Liste bağlantısı paylaşılamadı.'), requestContext: ctx }).userMessage)
    }
  }

  const handleFollowList = async () => {
    if (myRating > 0) {
      toast.info(txa('Bu liste takip ettiklerin arasında.'))
      return
    }

    await handleRate(5)
  }

  const handleSaveEdit = async () => {
    if (!detail) return
    const t = editTitle.trim(), d = editDescription.trim()
    if (t.length < LIST_TITLE_MIN_LENGTH || t.length > LIST_TITLE_MAX_LENGTH) {
      toast.warning(txa('Başlık {min}-{max} karakter arasında olmalıdır.', { min: LIST_TITLE_MIN_LENGTH, max: LIST_TITLE_MAX_LENGTH }))
      return
    }
    if (d.length > LIST_DESCRIPTION_MAX_LENGTH) {
      toast.warning(txa('Açıklama en fazla {max} karakter olabilir.', { max: LIST_DESCRIPTION_MAX_LENGTH }))
      return
    }
    if (editSelectedMangas.length < MANGA_LIST_MIN_ITEM_COUNT) {
      toast.warning(txa('Liste en az {min} manga içermelidir.', { min: MANGA_LIST_MIN_ITEM_COUNT }))
      return
    }
    setEditSaving(true)
    try {
      await updateMangaList(detail.id, { title: t, description: d, isPublic: editIsPublic, mangaIds: editSelectedMangas.map((m) => m.id), itemNotes: editNotes })
      await refreshDetail(); setEditOpen(false); toast.success(txa('Liste güncellendi.'))
    } catch (err) {
      const ctx = createRequestContext('MangaListDetailPage', 'save-edit', { listId: detail.id })
      toast.error(reportUserFacingError(logger, { event: ctx.event, error: err, fallback: txa('Liste güncellenemedi.'), requestContext: ctx }).userMessage)
    } finally { setEditSaving(false) }
  }

  const handleAddMangaToEdit = (manga: Manga) => {
    if (editSelectedIds.has(manga.id)) return
    setEditSelectedMangas((p) => [...p, manga])
    setEditNotes((p) => p[manga.id] !== undefined ? p : { ...p, [manga.id]: '' })
  }
  const handleRemoveMangaFromEdit = (mangaId: string) => {
    setEditSelectedMangas((p) => p.filter((m) => m.id !== mangaId))
    setEditNotes((p) => { if (!(mangaId in p)) return p; const n = { ...p }; delete n[mangaId]; return n })
  }
  const handleMoveEditItem = (index: number, dir: 'up' | 'down') => {
    setEditSelectedMangas((p) => {
      const t = dir === 'up' ? index - 1 : index + 1
      if (t < 0 || t >= p.length) return p
      const n = [...p]; const c = n[index]; n[index] = n[t]; n[t] = c; return n
    })
  }

  // ── Guard states ──
  if (!id) return <Navigate to="/404" replace />
  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  if (notFound || !detail) return <Navigate to={`/404?resource=list&value=${encodeURIComponent(id)}`} replace />

  const myRating = detail.myRating || 0
  const firstItem = detail.items[0]
  const firstItemPath = firstItem
    ? buildPublicMangaPath({ id: firstItem.mangaId, slug: firstItem.slug, title: firstItem.title })
    : undefined

  return (
    <div className="w-full px-4 pb-12 pt-6 sm:px-6 2xl:px-8">
      {/* ────────────── Ana Grid: Sol İçerik + Sağ Sidebar ────────────── */}
      {/* Sidebar hero seviyesinden başlar, görseldeki layout'a uygun */}
      <section className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* ══════════ Sol Kolon: Hero + Tablar + Tab İçeriği ══════════ */}
        <div className="flex min-w-0 flex-col gap-5">
          {/* Hero / Header */}
          <div>
            <MangaListDetailHero
              detail={detail}
              onEdit={detail.canEdit ? openEditDialog : undefined}
            />
            <MangaListDetailActionBar
              detail={detail}
              myRating={myRating}
              startPath={firstItemPath}
              onEdit={detail.canEdit ? openEditDialog : undefined}
              onFollow={handleFollowList}
              onRate={handleRate}
              onShare={handleShareList}
            />
          </div>

          {/* Tab Navigasyonu */}
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabKey)}>
            <TabsList className="grid h-auto w-full grid-cols-3 overflow-hidden rounded-2xl border border-border/60 bg-background/55 p-1.5">
              {TABS.map((tab) => {
                const Icon = tab.icon
                return (
                  <TabsTrigger
                    key={tab.key}
                    value={tab.key}
                    className="min-h-10 min-w-0 gap-2 rounded-xl px-4 text-xs text-muted-foreground transition-colors data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:text-sm"
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                    {tab.key === 'comments' && (
                      <Badge variant="outline" className="ml-1 h-5 px-1.5 text-[10px]">{totalCommentCount}</Badge>
                    )}
                    {tab.key === 'series' && (
                      <Badge variant="outline" className="ml-1 h-5 px-1.5 text-[10px]">{detail.itemsCount}</Badge>
                    )}
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </Tabs>

          {/* Aktif tab içeriği */}
          {activeTab === 'overview' && (
            <Card className="flex flex-col gap-4 border-border/50 bg-card/60 p-6">
              <h2 className="text-lg font-bold">{txa('Genel Bakış')}</h2>
              <p className="text-sm text-muted-foreground">{detail.description || txa('Bu liste için açıklama eklenmedi.')}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {detail.items.slice(0, 6).map((item) => (
                  <div key={item.id} className="flex items-center gap-3 rounded-lg border border-border/40 bg-background/40 p-2.5">
                    <img src={item.coverImage} alt={item.title} className="h-14 w-10 rounded-lg object-cover" loading="lazy" />
                    <div className="min-w-0">
                      <p className="line-clamp-1 text-sm font-semibold">{item.title}</p>
                      <p className="line-clamp-1 text-[11px] text-muted-foreground">{item.note || '-'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {activeTab === 'series' && (
            <div>
              <MangaListDetailTable items={detail.items} baseDate={detail.updatedAt || detail.createdAt} />
            </div>
          )}

          {activeTab === 'comments' && (
            <Card className="border-border/50 bg-card/60 p-4 sm:p-5">
              {commentsLoading ? (
                <div className="flex min-h-[120px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <CommentThread
                  comments={comments}
                  newComment={newComment}
                  setNewComment={setNewComment}
                  onAddComment={handleAddComment}
                  replyingTo={replyingTo}
                  setReplyingTo={setReplyingTo}
                  replyText={replyText}
                  setReplyText={setReplyText}
                  onSubmitReply={handleSubmitReply}
                  onLike={(cid) => handleReaction(cid, 'like')}
                  onDislike={(cid) => handleReaction(cid, 'dislike')}
                  onReport={handleReport}
                  variant="community"
                  currentUserAvatar={currentUser?.avatar}
                  currentUserFrameType={(currentUser?.frameType as FrameType | null) || 'default'}
                  allowCommentCreate={Boolean(currentUser)}
                  allowReplyCreate={Boolean(currentUser)}
                  allowReport={isReportsEnabled}
                  reportPassive={!isReportsEnabled}
                  commentCreateDisabledMessage={txa('Yorum göndermek için giriş yapmalısınız.')}
                  replyCreateDisabledMessage={txa('Yanıt göndermek için giriş yapmalısınız.')}
                  mentionedUsers={resolvedMentionedUsers}
                  relatedFansubs={resolvedRelatedFansubs}
                  mentionedMangas={resolvedMentionedMangas}
                  sortBy={commentSortBy}
                  onSortChange={setCommentSortBy}
                  hoverSideOffset={34}
                />
              )}
            </Card>
          )}

        </div>

        {/* Sağ: Sidebar */}
        <div className="hidden 2xl:block">
          <div className="sticky top-20">
            <MangaListDetailSidebar
              detail={detail}
              onShare={handleShareList}
            />
          </div>
        </div>

        {/* Orta ekran ve mobilde sidebar, ana içerik sıkışmasın diye altta gösterilir. */}
        <div className="2xl:hidden">
          <MangaListDetailSidebar
            detail={detail}
            onShare={handleShareList}
          />
        </div>
      </section>

      {/* ────────────── Düzenleme Modalı ────────────── */}
      <MangaListDetailEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        saving={editSaving}
        title={editTitle}
        setTitle={setEditTitle}
        description={editDescription}
        setDescription={setEditDescription}
        isPublic={editIsPublic}
        setIsPublic={setEditIsPublic}
        searchQuery={editSearchQuery}
        setSearchQuery={setEditSearchQuery}
        searchLoading={editSearchLoading}
        searchResults={editSearchResults}
        selectedMangas={editSelectedMangas}
        notes={editNotes}
        onAddManga={handleAddMangaToEdit}
        onRemoveManga={handleRemoveMangaFromEdit}
        onMoveItem={handleMoveEditItem}
        onNoteChange={(mangaId, note) => setEditNotes((p) => ({
          ...p,
          [mangaId]: note.slice(0, MANGA_LIST_ITEM_NOTE_MAX_LENGTH),
        }))}
        onSave={() => void handleSaveEdit()}
      />

      {/* ────────────── Rapor Modalı ────────────── */}
      {isReportsEnabled && (
        <ReportModal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          targetId={reportTargetId}
          targetType={reportTargetType}
        />
      )}
    </div>
  )
}

export default MangaListDetailPage
