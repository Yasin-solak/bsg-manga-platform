import { RefreshCw } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type {
    SeriesType,
    AdminMangaChapterBrief,
    AdminMangaCommentItem,
    AdminMangaControlDetail,
    AdminMangaDetailMetrics,
    AdminMangaRatingItem,
} from '@/services/adminService'
import { MangaDetailChapterReview } from './MangaDetailChapterReview'
import { MangaDetailCommunityPanel } from './MangaDetailCommunityPanel'
import { MangaDetailMetaPanel } from './MangaDetailMetaPanel'
import { MangaDetailSidebar } from './MangaDetailSidebar'
import { txa } from '@/i18n/activeLocale'

/**
 * Manga detail control window.
 *
 * **Workbench layout.** Unchanging context on the left (identity, warnings,
 * metrics), one work area on the right. The previous version spread everything across tabs:
 * moving to "Comments" you could not see which series you were in or what was
 * broken.
 *
 * **Tabs are split by job**, not data type:
 * Chapters  -> the main job (does the uploaded translation meet criteria): DEFAULT
 * Details   -> cover / genre / description editing
 * Community -> comment and rating moderation
 * The old "General" tab was a junk drawer: metrics + three edit forms +
 * contributing teams all in one place.
 *
 * **Fixed height**, only the work area scrolls; the window does not grow and shrink
 * on tab changes.
 */

export type MangaDetailTab = 'chapters' | 'meta' | 'community'

interface RatingSummary {
    total: number
    average: number | null
    distribution: number[]
}

interface ChapterGroup {
    chapterNumber: number
    versions: AdminMangaChapterBrief[]
}

interface MangaDetailControlModalProps {
    isOpen: boolean
    onClose: () => void
    detailLoading: boolean
    detailError: string | null
    detailTab: MangaDetailTab
    onDetailTabChange: (tab: MangaDetailTab) => void
    onRefreshDetail: () => void | Promise<void>
    selectedMangaDetail: AdminMangaControlDetail | null
    detailMetrics: AdminMangaDetailMetrics | null
    metricsLoading: boolean
    chapterPageCounts: Record<string, number>
    coverPreview: string | null
    coverFile: File | null
    coverSaving: boolean
    coverInputRef: React.RefObject<HTMLInputElement | null>
    onCoverInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void
    onSaveCover: () => void | Promise<void>
    onClearCoverSelection: () => void
    genreInput: string
    onGenreInputChange: (value: string) => void
    genreDraft: string[]
    savingGenres: boolean
    seriesTypeDraft: SeriesType
    onSeriesTypeChange: (value: SeriesType) => void
    savingSeriesType: boolean
    onSaveSeriesType: () => void | Promise<void>
    matureDraft: boolean
    onMatureChange: (value: boolean) => void
    savingMature: boolean
    onSaveMature: () => void | Promise<void>
    onAddGenre: () => void
    onRemoveGenre: (genre: string) => void
    onSaveGenres: () => void | Promise<void>
    descriptionDraft: string
    onDescriptionDraftChange: (value: string) => void
    onSaveDescription: () => void | Promise<void>
    savingDescription: boolean
    chapterGroups: ChapterGroup[]
    chapterPublishDraft: Record<string, string>
    onChapterPublishDraftChange: (chapterId: string, value: string) => void
    detailBusyKey: string | null
    filteredComments: AdminMangaCommentItem[]
    commentSearch: string
    onCommentSearchChange: (value: string) => void
    filteredRatings: AdminMangaRatingItem[]
    ratingSearch: string
    onRatingSearchChange: (value: string) => void
    ratingSummary: RatingSummary
    onToggleChapterApproved: (chapter: AdminMangaChapterBrief) => void | Promise<void>
    onToggleChapterActive: (chapter: AdminMangaChapterBrief) => void | Promise<void>
    onSaveChapterPublishAt: (chapter: AdminMangaChapterBrief) => void | Promise<void>
    onToggleCommentPinned: (comment: AdminMangaCommentItem) => void | Promise<void>
    onToggleCommentActive: (comment: AdminMangaCommentItem) => void | Promise<void>
    onDeleteComment: (comment: AdminMangaCommentItem) => void | Promise<void>
    onDeleteRating: (ratingItem: AdminMangaRatingItem) => void | Promise<void>
}

const TABS: Array<{ id: MangaDetailTab; label: string }> = [
    { id: 'chapters', get label() { return txa('Bölümler') } },
    { id: 'meta', get label() { return txa('Künye') } },
    { id: 'community', get label() { return txa('Yorum ve puanlar') } },
]

function MangaDetailControlModal(props: MangaDetailControlModalProps) {
    const {
        isOpen,
        onClose,
        detailLoading,
        detailError,
        detailTab,
        onDetailTabChange,
        onRefreshDetail,
        selectedMangaDetail,
        detailMetrics,
        metricsLoading,
        chapterPageCounts,
        chapterGroups,
        chapterPublishDraft,
        onChapterPublishDraftChange,
        detailBusyKey,
        filteredComments,
        commentSearch,
        onCommentSearchChange,
        filteredRatings,
        ratingSearch,
        onRatingSearchChange,
        ratingSummary,
        onToggleChapterApproved,
        onToggleChapterActive,
        onSaveChapterPublishAt,
        onToggleCommentPinned,
        onToggleCommentActive,
        onDeleteComment,
        onDeleteRating,
    } = props

    const pendingCount = selectedMangaDetail?.chapterStats.pending ?? 0

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
            <DialogContent
                className={cn(
                    'flex h-[min(90vh,880px)] w-[min(96vw,1180px)] flex-col overflow-hidden p-0',
                    // The shared DialogContent enforces `sm:max-w-lg` (512px).
                    // Writing only `max-w-none` is NOT ENOUGH: tailwind-merge treats prefixed and unprefixed
                    // classes as separate keys, so on `sm:` 512px wins and the window narrows (measured).
                    'max-w-none sm:max-w-none',
                )}
            >
                <DialogHeader className="shrink-0 border-b border-border px-5 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                            <DialogTitle className="text-base">
                                {selectedMangaDetail ? selectedMangaDetail.title : txa('Seri yönetimi')}
                            </DialogTitle>
                            <DialogDescription className="text-[11px]">
                                {txa('Bolum incelemesi, kunye duzenleme ve topluluk moderasyonu.')}
                            </DialogDescription>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="min-h-11 shrink-0"
                            onClick={() => { void onRefreshDetail() }}
                            disabled={detailLoading}
                        >
                            <RefreshCw className={cn('size-4', detailLoading && 'animate-spin motion-reduce:animate-none')} aria-hidden="true" />
                            {txa('Yenile')}
                        </Button>
                    </div>
                </DialogHeader>

                {detailLoading ? (
                    <p className="grid flex-1 place-items-center text-sm text-muted-foreground">{txa('Ayrıntı yükleniyor…')}</p>
                ) : detailError ? (
                    <p className="grid flex-1 place-items-center px-6 text-center text-sm text-muted-foreground">{detailError}</p>
                ) : !selectedMangaDetail ? (
                    <p className="grid flex-1 place-items-center text-sm text-muted-foreground">{txa('Ayrıntı bulunamadı.')}</p>
                ) : (
                    <div className={cn(
                        'flex min-h-0 flex-1 flex-col lg:flex-row',
                        // On mobile the rail and work area flow in ONE scroll; two independent scrollers
                        // stacked fight each other on a narrow screen.
                        // On desktop the two columns scroll inside themselves.
                        'overflow-y-auto lg:overflow-hidden',
                    )}>
                        <MangaDetailSidebar
                            detail={selectedMangaDetail}
                            metrics={detailMetrics}
                            metricsLoading={metricsLoading}
                        />

                        <div className="flex min-w-0 flex-col lg:min-h-0 lg:flex-1">
                            <div
                                role="tablist"
                                aria-label={txa('Seri bölümleri')}
                                className="flex shrink-0 gap-1 border-b border-border px-4 pt-2"
                            >
                                {TABS.map((tab) => {
                                    const selected = detailTab === tab.id
                                    return (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            role="tab"
                                            aria-selected={selected}
                                            onClick={() => onDetailTabChange(tab.id)}
                                            className={cn(
                                                'relative min-h-11 rounded-t-md px-3 text-sm font-medium transition-colors',
                                                selected
                                                    ? 'text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary'
                                                    : 'text-muted-foreground hover:text-foreground',
                                            )}
                                        >
                                            {tab.label}
                                            {tab.id === 'chapters' && pendingCount > 0 ? (
                                                <span className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                                    {pendingCount}
                                                </span>
                                            ) : null}
                                        </button>
                                    )
                                })}
                            </div>

                            {/* Tek kaydirma alani: ic ice kaydirici yok. */}
                            <div className="p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain">
                                {detailTab === 'chapters' ? (
                                    <MangaDetailChapterReview
                                        detail={selectedMangaDetail}
                                        chapterGroups={chapterGroups}
                                        chapterPageCounts={chapterPageCounts}
                                        chapterPublishDraft={chapterPublishDraft}
                                        onChapterPublishDraftChange={onChapterPublishDraftChange}
                                        detailBusyKey={detailBusyKey}
                                        onToggleChapterApproved={onToggleChapterApproved}
                                        onToggleChapterActive={onToggleChapterActive}
                                        onSaveChapterPublishAt={onSaveChapterPublishAt}
                                    />
                                ) : null}

                                {detailTab === 'meta' ? (
                                    <MangaDetailMetaPanel
                                        detail={selectedMangaDetail}
                                        coverPreview={props.coverPreview}
                                        coverFile={props.coverFile}
                                        coverSaving={props.coverSaving}
                                        coverInputRef={props.coverInputRef}
                                        onCoverInputChange={props.onCoverInputChange}
                                        onSaveCover={props.onSaveCover}
                                        onClearCoverSelection={props.onClearCoverSelection}
                                        genreInput={props.genreInput}
                                        onGenreInputChange={props.onGenreInputChange}
                                        genreDraft={props.genreDraft}
                                        savingGenres={props.savingGenres}
                                        seriesTypeDraft={props.seriesTypeDraft}
                                        onSeriesTypeChange={props.onSeriesTypeChange}
                                        savingSeriesType={props.savingSeriesType}
                                        onSaveSeriesType={props.onSaveSeriesType}
                                        matureDraft={props.matureDraft}
                                        onMatureChange={props.onMatureChange}
                                        savingMature={props.savingMature}
                                        onSaveMature={props.onSaveMature}
                                        onAddGenre={props.onAddGenre}
                                        onRemoveGenre={props.onRemoveGenre}
                                        onSaveGenres={props.onSaveGenres}
                                        descriptionDraft={props.descriptionDraft}
                                        onDescriptionDraftChange={props.onDescriptionDraftChange}
                                        onSaveDescription={props.onSaveDescription}
                                        savingDescription={props.savingDescription}
                                    />
                                ) : null}

                                {detailTab === 'community' ? (
                                    <MangaDetailCommunityPanel
                                        comments={filteredComments}
                                        commentSearch={commentSearch}
                                        onCommentSearchChange={onCommentSearchChange}
                                        ratings={filteredRatings}
                                        ratingSearch={ratingSearch}
                                        onRatingSearchChange={onRatingSearchChange}
                                        ratingSummary={ratingSummary}
                                        detailBusyKey={detailBusyKey}
                                        onToggleCommentPinned={onToggleCommentPinned}
                                        onToggleCommentActive={onToggleCommentActive}
                                        onDeleteComment={onDeleteComment}
                                        onDeleteRating={onDeleteRating}
                                    />
                                ) : null}
                            </div>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}

export default MangaDetailControlModal
