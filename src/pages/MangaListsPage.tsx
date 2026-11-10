import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from '@/i18n/router'
import { Tags } from 'lucide-react'
import type { Manga } from '@/types'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { listMangas } from '@/services/mangaService'
import {
  createMangaList,
  listFollowedCreatorMangaLists,
  listMyMangaLists,
  listPublicMangaLists,
  listRatedMangaLists,
  listTopMangaListsByPeriod,
  type MangaListSummary,
} from '@/services/mangaListService'
import { toast } from '@/services/toastService'
import {
  DEFAULT_MANGA_LIST_CREATE_COVER_IMAGES,
  getPublicMangaListPageConfig,
} from '@/services/mangaListPageConfigService'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { MangaListsCreateDialog } from '@/pages/mangaLists/MangaListsCreateDialog'
import {
  CardSkeletonGrid,
  CategoryChip,
  CreateHero,
  CreateListTile,
  SignedOutListNotice,
} from '@/pages/mangaLists/MangaListsPageSections'
import { MangaListsSidebar, type ListCuratorSummary } from '@/pages/mangaLists/MangaListsSidebar'
import {
  EmptyListPanel,
  LIST_CATEGORY_PRESETS,
  LIST_DESCRIPTION_MAX_LENGTH,
  LIST_STATS_ICON_MAP,
  LIST_TABS,
  LIST_TITLE_MAX_LENGTH,
  LIST_TITLE_MIN_LENGTH,
  MANGA_LIST_HERO_COVER_COUNT,
  MANGA_LIST_ITEM_NOTE_MAX_LENGTH,
  MANGA_LIST_MIN_ITEM_COUNT,
  MangaListShowcaseCard,
  matchesListCategory,
  pickWeeklyList,
  SectionHeader,
  TOP_RAIL_LIMIT,
  type MangaListCategoryId,
  type MangaListTab,
} from '@/pages/mangaLists/mangaListsPage.shared'
import { txa, intlLocale } from '@/i18n/activeLocale'

function normalizeCategoryParam(value: string | null): MangaListCategoryId {
  if (!value) return 'all'
  return LIST_CATEGORY_PRESETS.some((category) => category.id === value)
    ? (value as MangaListCategoryId)
    : 'all'
}

function normalizeTabParam(value: string | null): MangaListTab {
  return LIST_TABS.some((tab) => tab.id === value)
    ? (value as MangaListTab)
    : 'all'
}

function dedupeLists(lists: MangaListSummary[]) {
  const seen = new Map<string, MangaListSummary>()
  lists.forEach((item) => {
    if (!seen.has(item.id)) seen.set(item.id, item)
  })
  return [...seen.values()]
}

function buildPopularTags(lists: MangaListSummary[]) {
  return buildCategoryStats(lists)
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count)
}

function buildCategoryStats(lists: MangaListSummary[]) {
  return LIST_CATEGORY_PRESETS.map((category) => ({
    id: category.id,
    label: category.label,
    icon: category.icon,
    count: lists.filter((item) => matchesListCategory(item, category.id)).length,
  }))
}

function buildCurators(lists: MangaListSummary[]): ListCuratorSummary[] {
  const map = new Map<string, ListCuratorSummary>()
  lists.forEach((item) => {
    const current = map.get(item.ownerId)
    const score = item.ratingAvg * 10 + item.ratingsCount * 2 + item.commentsCount + item.itemsCount * 0.3
    if (!current) {
      map.set(item.ownerId, {
        id: item.ownerId,
        username: item.ownerUsername,
        avatar: item.ownerAvatar,
        frameType: item.ownerFrameType,
        listCount: 1,
        score,
      })
      return
    }

    current.listCount += 1
    current.score += score
  })

  return [...map.values()].sort((left, right) => right.score - left.score)
}

function getCompletedListCount(lists: MangaListSummary[]) {
  return lists.filter((item) => {
    const text = `${item.title} ${item.description}`.toLocaleLowerCase(intlLocale())
    return text.includes('tamam') || text.includes('bitti') || text.includes('final')
  }).length
}

function getPlannedListCount(lists: MangaListSummary[]) {
  return lists.filter((item) => {
    const text = `${item.title} ${item.description}`.toLocaleLowerCase(intlLocale())
    return text.includes('okuyacak') || text.includes('plan') || text.includes('sonra')
  }).length
}

function MangaListsPage() {
  const { currentUser } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const currentUserId = currentUser?.id ?? null

  const [activeTab, setActiveTab] = useState<MangaListTab>(() => normalizeTabParam(searchParams.get('sekme')))
  const [activeCategory, setActiveCategory] = useState<MangaListCategoryId>(() => normalizeCategoryParam(searchParams.get('kategori')))
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false)
  const [totalCount, setTotalCount] = useState(0)

  const [discoverLists, setDiscoverLists] = useState<MangaListSummary[]>([])
  const [weeklyCandidates, setWeeklyCandidates] = useState<MangaListSummary[]>([])
  const [curationLoading, setCurationLoading] = useState(true)
  const [listCreateCoverImages, setListCreateCoverImages] = useState<string[]>(DEFAULT_MANGA_LIST_CREATE_COVER_IMAGES)

  const [myLists, setMyLists] = useState<MangaListSummary[]>([])
  const [followedLists, setFollowedLists] = useState<MangaListSummary[]>([])
  const [ratedLists, setRatedLists] = useState<MangaListSummary[]>([])

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [newCategoryId, setNewCategoryId] = useState<MangaListCategoryId>('action')
  const [mangaSearchQuery, setMangaSearchQuery] = useState('')
  const [mangaSearchLoading, setMangaSearchLoading] = useState(false)
  const [mangaSearchResults, setMangaSearchResults] = useState<Manga[]>([])
  const [selectedMangas, setSelectedMangas] = useState<Manga[]>([])
  const [selectedNotes, setSelectedNotes] = useState<Record<string, string>>({})

  const selectedIds = useMemo(
    () => new Set(selectedMangas.map((manga) => manga.id)),
    [selectedMangas],
  )
  const createPreviewCoverImages = useMemo(() => {
    const selectedCovers = selectedMangas
      .map((manga) => manga.coverImage)
      .filter(Boolean)
      .slice(0, MANGA_LIST_HERO_COVER_COUNT)

    return selectedCovers.length >= MANGA_LIST_HERO_COVER_COUNT
      ? selectedCovers
      : listCreateCoverImages
  }, [listCreateCoverImages, selectedMangas])

  useEffect(() => {
    const nextCategory = normalizeCategoryParam(searchParams.get('kategori'))
    const nextTab = normalizeTabParam(searchParams.get('sekme'))
    setActiveCategory((current) => (current === nextCategory ? current : nextCategory))
    setActiveTab((current) => (current === nextTab ? current : nextTab))
  }, [searchParams])

  useEffect(() => {
    let mounted = true

    void (async () => {
      const config = await getPublicMangaListPageConfig()
      if (mounted) setListCreateCoverImages(config.createCoverImages)
    })()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let mounted = true

    void (async () => {
      const response = await listPublicMangaLists({
        sort: 'recently_updated',
        page: 1,
        limit: 1,
      })
      if (!mounted) return
      setTotalCount(response.count)
    })()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let mounted = true
    setCurationLoading(true)

    void (async () => {
      const [weekly, topRated, recentlyUpdated] = await Promise.all([
        listTopMangaListsByPeriod('weekly', TOP_RAIL_LIMIT),
        listPublicMangaLists({ sort: 'top_rated', page: 1, limit: 24 }),
        listPublicMangaLists({ sort: 'recently_updated', page: 1, limit: 24 }),
      ])

      if (!mounted) return
      const merged = dedupeLists([...weekly, ...topRated.data, ...recentlyUpdated.data])
      setWeeklyCandidates(weekly)
      setDiscoverLists(merged)
      setCurationLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let mounted = true
    if (!currentUserId) {
      setMyLists([])
      setFollowedLists([])
      setRatedLists([])
      return () => {
        mounted = false
      }
    }

    void (async () => {
      const [mine, followed, rated] = await Promise.all([
        listMyMangaLists({ limit: 30 }),
        listFollowedCreatorMangaLists({ limit: 30 }),
        listRatedMangaLists({ limit: 30 }),
      ])
      if (!mounted) return
      setMyLists(mine)
      setFollowedLists(followed)
      setRatedLists(rated)
    })()

    return () => {
      mounted = false
    }
  }, [currentUserId])

  useEffect(() => {
    if (!createOpen) return
    const query = mangaSearchQuery.trim()
    if (query.length < 2) {
      setMangaSearchResults([])
      setMangaSearchLoading(false)
      return
    }

    let cancelled = false
    setMangaSearchLoading(true)
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await listMangas({
            search: query,
            sort: 'popular',
            page: 1,
            limit: 10,
          })
          if (cancelled) return
          setMangaSearchResults(result.data || [])
        } catch (error) {
          if (cancelled) return
          console.error('[MangaListsPage] manga search error', error)
          setMangaSearchResults([])
        } finally {
          if (!cancelled) setMangaSearchLoading(false)
        }
      })()
    }, 280)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [createOpen, mangaSearchQuery])

  const weeklyList = useMemo(
    () => pickWeeklyList([...weeklyCandidates, ...discoverLists]),
    [discoverLists, weeklyCandidates],
  )

  const filteredDiscoverLists = useMemo(
    () => discoverLists.filter((item) => matchesListCategory(item, activeCategory)),
    [activeCategory, discoverLists],
  )

  const featuredLists = useMemo(
    () => dedupeLists([...weeklyCandidates, ...discoverLists])
      .sort((left, right) => (right.score || 0) - (left.score || 0) || right.ratingAvg - left.ratingAvg)
      .slice(0, 5),
    [discoverLists, weeklyCandidates],
  )

  const communityPopularLists = useMemo(
    () => [...discoverLists]
      .sort((left, right) => {
        const leftScore = left.commentsCount * 2 + left.ratingsCount + left.ratingAvg * 5
        const rightScore = right.commentsCount * 2 + right.ratingsCount + right.ratingAvg * 5
        return rightScore - leftScore
      })
      .slice(0, 5),
    [discoverLists],
  )

  const communityTabLists = useMemo(
    () => discoverLists.filter((item) => item.ownerId !== currentUserId),
    [currentUserId, discoverLists],
  )
  const activeTabLists = useMemo(() => {
    if (activeTab === 'mine') return myLists
    if (activeTab === 'following') return followedLists
    if (activeTab === 'community') return communityTabLists
    if (activeTab === 'favorites') return ratedLists
    return discoverLists
  }, [activeTab, communityTabLists, discoverLists, followedLists, myLists, ratedLists])
  const activeTabLabel = txa(LIST_TABS.find((tab) => tab.id === activeTab)?.label || txa('Listeler'))
  const activeTabEmptyCopy = {
    mine: {
      title: txa('Henüz liste oluşturmadın'),
      body: txa('Yeni Liste Oluştur ile kendi okuma vitrininin ilk kartını hazırlayabilirsin.'),
    },
    following: {
      title: txa('Takip ettiğin kişilerden liste yok'),
      body: txa('Takip ettiğin kullanıcılar herkese açık liste paylaştığında burada görünür.'),
    },
    community: {
      title: txa('Topluluk listesi yok'),
      body: txa('Herkese açık listeler topluluk akışını besler.'),
    },
    favorites: {
      title: txa('Puanladığın liste yok'),
      body: txa('Puan verdiğin listeler favori akışında görünür.'),
    },
    all: {
      title: txa('Liste yok'),
      body: txa('Yeni listeler oluşturuldukça burada görünür.'),
    },
  }[activeTab]
  const activeCategoryMeta = activeCategory === 'all'
    ? null
    : LIST_CATEGORY_PRESETS.find((category) => category.id === activeCategory) || null
  const selectedCategoryTitle = activeCategoryMeta
    ? txa('{label} Listeleri', { label: txa(activeCategoryMeta.label) })
    : txa('Tüm Kategorilerden Listeler')
  const categoryStats = useMemo(() => buildCategoryStats(discoverLists), [discoverLists])
  const visibleCategoryStats = useMemo(() => {
    const nonEmpty = categoryStats.filter((category) => category.count > 0)
    const base = nonEmpty.length > 0 ? nonEmpty.slice(0, 7) : categoryStats.slice(0, 7)
    const active = categoryStats.find((category) => category.id === activeCategory)
    if (active && !base.some((category) => category.id === active.id)) {
      return [active, ...base].slice(0, 8)
    }
    return base
  }, [activeCategory, categoryStats])
  const popularTags = useMemo(() => buildPopularTags(discoverLists), [discoverLists])
  const curators = useMemo(() => buildCurators(discoverLists), [discoverLists])

  const listStats = useMemo(() => ({
    publicLists: totalCount || discoverLists.length,
    totalItems: discoverLists.reduce((sum, item) => sum + item.itemsCount, 0),
    activeCurators: curators.length,
  }), [curators.length, discoverLists, totalCount])

  const myStats = useMemo(() => [
    {
      id: 'total',
      label: txa('Toplam Listen'),
      value: myLists.length,
      icon: LIST_STATS_ICON_MAP.total,
    },
    {
      id: 'following',
      label: txa('Takip Ettiğim'),
      value: followedLists.length,
      icon: LIST_STATS_ICON_MAP.following,
    },
    {
      id: 'completed',
      label: txa('Tamamlanan'),
      value: getCompletedListCount(myLists),
      icon: LIST_STATS_ICON_MAP.completed,
    },
    {
      id: 'planned',
      label: txa('Okuyacaklarım'),
      value: getPlannedListCount(myLists),
      icon: LIST_STATS_ICON_MAP.planned,
    },
  ], [followedLists.length, myLists])

  const activeTabCount = useMemo(() => {
    if (activeTab === 'mine') return myLists.length
    if (activeTab === 'following') return followedLists.length
    if (activeTab === 'community') return discoverLists.filter((item) => item.ownerId !== currentUserId).length
    if (activeTab === 'favorites') return ratedLists.length
    return totalCount || discoverLists.length
  }, [activeTab, currentUserId, discoverLists, followedLists.length, myLists.length, ratedLists.length, totalCount])

  function setCategory(categoryId: MangaListCategoryId) {
    setActiveCategory(categoryId)
    const next = new URLSearchParams(searchParams)
    if (categoryId === 'all') next.delete('kategori')
    else next.set('kategori', categoryId)
    setSearchParams(next, { replace: true })
  }

  function setTab(tabId: MangaListTab) {
    setActiveTab(tabId)
    const next = new URLSearchParams(searchParams)
    if (tabId === 'all') next.delete('sekme')
    else next.set('sekme', tabId)
    if (tabId !== 'all') {
      next.delete('kategori')
      setActiveCategory('all')
    }
    setSearchParams(next, { replace: true })
  }

  function selectCategoryFromDrawer(categoryId: MangaListCategoryId) {
    setCategory(categoryId)
    setCategoryDrawerOpen(false)
  }

  const resetCreateForm = () => {
    setNewTitle('')
    setNewDescription('')
    setIsPublic(true)
    setNewCategoryId('action')
    setMangaSearchQuery('')
    setMangaSearchResults([])
    setSelectedMangas([])
    setSelectedNotes({})
    setCreating(false)
    setMangaSearchLoading(false)
  }

  const handleAddManga = (manga: Manga) => {
    if (selectedIds.has(manga.id)) return
    setSelectedMangas((prev) => [...prev, manga])
    setSelectedNotes((prev) => (prev[manga.id] !== undefined ? prev : { ...prev, [manga.id]: '' }))
  }

  const handleRemoveManga = (mangaId: string) => {
    setSelectedMangas((prev) => prev.filter((entry) => entry.id !== mangaId))
    setSelectedNotes((prev) => {
      if (!(mangaId in prev)) return prev
      const next = { ...prev }
      delete next[mangaId]
      return next
    })
  }

  const handleChangeMangaNote = (mangaId: string, value: string) => {
    setSelectedNotes((prev) => ({
      ...prev,
      [mangaId]: value.slice(0, MANGA_LIST_ITEM_NOTE_MAX_LENGTH),
    }))
  }

  const handleCreateList = async () => {
    if (!currentUser) {
      toast.warning(txa('Liste oluşturmak için giriş yapmalısınız.'))
      return
    }

    const normalizedTitle = newTitle.trim()
    const normalizedDescription = newDescription.trim()

    if (normalizedTitle.length < LIST_TITLE_MIN_LENGTH || normalizedTitle.length > LIST_TITLE_MAX_LENGTH) {
      toast.warning(txa('Liste başlığı {min}-{max} karakter arasında olmalıdır.', { min: LIST_TITLE_MIN_LENGTH, max: LIST_TITLE_MAX_LENGTH }))
      return
    }
    if (normalizedDescription.length > LIST_DESCRIPTION_MAX_LENGTH) {
      toast.warning(txa('Açıklama en fazla {max} karakter olabilir.', { max: LIST_DESCRIPTION_MAX_LENGTH }))
      return
    }
    if (selectedMangas.length < MANGA_LIST_MIN_ITEM_COUNT) {
      toast.warning(txa('Liste oluşturmak için en az {min} manga seçmelisiniz.', { min: MANGA_LIST_MIN_ITEM_COUNT }))
      return
    }

    setCreating(true)
    try {
      const listId = await createMangaList({
        title: normalizedTitle,
        description: normalizedDescription,
        isPublic,
        categoryId: newCategoryId,
        mangaIds: selectedMangas.map((manga) => manga.id),
        itemNotes: selectedNotes,
      })
      toast.success(txa('Manga listesi oluşturuldu.'))
      setCreateOpen(false)
      resetCreateForm()
      navigate(`/listeler/${listId}`)
    } catch (error) {
      console.error('[MangaListsPage] create list error', error)
      toast.error(txa('Liste oluşturulamadı.'))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div data-page-shell className="w-full max-w-[1640px] px-4 pb-14 pt-6 sm:px-6">
        <div data-page-grid className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <main data-page-main className="flex min-w-0 flex-col gap-6">
            <section className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-3xl font-black tracking-tight text-foreground">{txa('Listeler')}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {txa('Listelerini oluştur, düzenle ve paylaş. Diğer kullanıcıların listelerini keşfet!')}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-primary/30 bg-primary/10 px-3 py-1.5 text-primary">
                  {txa('{v1} liste', { v1: activeTabCount })}
                </Badge>
                <Badge variant="outline" className="border-border/70 px-3 py-1.5">
                  {txa('{count} vitrin seçimi', { count: discoverLists.length })}
                </Badge>
              </div>
            </section>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {LIST_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTab(tab.id)}
                  className={cn(
                    'shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition-colors',
                    activeTab === tab.id
                      ? 'border-primary bg-primary text-primary-foreground shadow-[0_14px_32px_rgba(239,68,68,.25)]'
                      : 'border-border/70 bg-card/70 text-muted-foreground hover:border-primary/35 hover:text-foreground',
                  )}
                >
                  {txa(tab.label)}
                </button>
              ))}
            </div>

            <CreateHero
              stats={myStats}
              coverImages={createPreviewCoverImages}
              createDialog={(
                <MangaListsCreateDialog
                  createOpen={createOpen}
                  onOpenChange={(open) => {
                    setCreateOpen(open)
                    if (!open) resetCreateForm()
                  }}
                  creating={creating}
                  newTitle={newTitle}
                  onNewTitleChange={setNewTitle}
                  newDescription={newDescription}
                  onNewDescriptionChange={setNewDescription}
                  isPublic={isPublic}
                  onVisibilityChange={setIsPublic}
                  categoryId={newCategoryId}
                  onCategoryChange={setNewCategoryId}
                  searchQuery={mangaSearchQuery}
                  onSearchQueryChange={setMangaSearchQuery}
                  searchLoading={mangaSearchLoading}
                  searchResults={mangaSearchResults}
                  selectedIds={selectedIds}
                  onAddManga={handleAddManga}
                  selectedMangas={selectedMangas}
                  selectedNotes={selectedNotes}
                  onChangeMangaNote={handleChangeMangaNote}
                  onRemoveManga={handleRemoveManga}
                  onCreate={() => {
                    void handleCreateList()
                  }}
                />
              )}
            />

            {activeTab !== 'all' ? (
              <section className="space-y-4">
                <SectionHeader title={activeTabLabel} />
                {activeTab === 'mine' ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                    <CreateListTile onClick={() => setCreateOpen(true)} />
                    {currentUser ? (
                      myLists.length > 0
                        ? myLists.map((item) => <MangaListShowcaseCard key={item.id} item={item} />)
                        : <EmptyListPanel title={activeTabEmptyCopy.title} body={activeTabEmptyCopy.body} />
                    ) : (
                      <SignedOutListNotice />
                    )}
                  </div>
                ) : !currentUser && (activeTab === 'following' || activeTab === 'favorites') ? (
                  <SignedOutListNotice />
                ) : activeTabLists.length === 0 ? (
                  <EmptyListPanel title={activeTabEmptyCopy.title} body={activeTabEmptyCopy.body} />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                    {activeTabLists.map((item) => (
                      <MangaListShowcaseCard key={item.id} item={item} variant={activeTab === 'community' ? 'popular' : 'featured'} />
                    ))}
                  </div>
                )}
              </section>
            ) : (
              <>
                <section className="space-y-4">
                  <SectionHeader title={txa('Öne Çıkan Listeler')} actionLabel={txa('Tümünü Gör')} to="/listeler?sekme=all" />
                  {curationLoading ? (
                    <CardSkeletonGrid count={5} />
                  ) : featuredLists.length === 0 ? (
                    <EmptyListPanel title={txa('Öne çıkan liste yok')} body={txa('Topluluk listeleri puan ve yorum aldıkça burada görünür.')} />
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                      {featuredLists.map((item) => (
                        <MangaListShowcaseCard key={item.id} item={item} />
                      ))}
                    </div>
                  )}
                </section>

                <section className="space-y-4">
                  <SectionHeader title={txa('Benim Listelerim')} actionLabel={txa('Tümünü Gör')} to="/listeler?sekme=mine" />
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                    <CreateListTile onClick={() => setCreateOpen(true)} />
                    {currentUser ? (
                      myLists.slice(0, 4).map((item) => <MangaListShowcaseCard key={item.id} item={item} />)
                    ) : (
                      <SignedOutListNotice />
                    )}
                  </div>
                </section>

                <section className="space-y-4">
                  <SectionHeader title={txa('Toplulukta Popüler Listeler')} actionLabel={txa('Tümünü Gör')} to="/listeler?sekme=community" />
                  {curationLoading ? (
                    <CardSkeletonGrid count={5} />
                  ) : communityPopularLists.length === 0 ? (
                    <EmptyListPanel title={txa('Popüler liste yok')} body={txa('Yorum ve puan hareketi arttıkça topluluk listeleri burada sıralanır.')} />
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                      {communityPopularLists.map((item) => (
                        <MangaListShowcaseCard key={item.id} item={item} variant="popular" />
                      ))}
                    </div>
                  )}
                </section>

                <section data-list-category-picker className="space-y-4">
                  <SectionHeader title={txa('Kategorilere Göre Liste Keşfet')} actionLabel={txa('Tümünü Gör')} to="/listeler?kategori=all" />
                  <Card className="gap-0 border-border/70 bg-card/80 p-3 py-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex flex-wrap gap-2">
                        <CategoryChip
                          active={activeCategory === 'all'}
                          label={txa('Tümü')}
                          count={discoverLists.length}
                          onClick={() => setCategory('all')}
                        />
                        {visibleCategoryStats.map((category) => (
                          <CategoryChip
                            key={category.id}
                            active={activeCategory === category.id}
                            label={txa(category.label)}
                            icon={category.icon}
                            count={category.count}
                            onClick={() => setCategory(category.id)}
                          />
                        ))}
                      </div>
                      <Sheet open={categoryDrawerOpen} onOpenChange={setCategoryDrawerOpen}>
                        <SheetTrigger asChild>
                          <Button variant="outline" className="shrink-0 gap-2 rounded-xl">
                            <Tags className="h-4 w-4" />
                            {txa('Tüm kategoriler')}
                          </Button>
                        </SheetTrigger>
                        <SheetContent className="w-[92vw] overflow-y-auto sm:max-w-lg">
                          <SheetHeader>
                            <SheetTitle>{txa('Liste Kategorileri')}</SheetTitle>
                            <SheetDescription>
                              {txa('Liste türü alanı ile aynı kategori seti kullanılır.')}
                            </SheetDescription>
                          </SheetHeader>
                          <div className="grid grid-cols-1 gap-2 px-4 pb-6 sm:grid-cols-2">
                            <CategoryChip
                              active={activeCategory === 'all'}
                              label={txa('Tümü')}
                              count={discoverLists.length}
                              onClick={() => selectCategoryFromDrawer('all')}
                            />
                            {categoryStats.map((category) => (
                              <CategoryChip
                                key={category.id}
                                active={activeCategory === category.id}
                                label={txa(category.label)}
                                icon={category.icon}
                                count={category.count}
                                onClick={() => selectCategoryFromDrawer(category.id)}
                              />
                            ))}
                          </div>
                        </SheetContent>
                      </Sheet>
                    </div>
                  </Card>
                </section>

                <section data-list-selected-category-section className="space-y-4">
                  <SectionHeader title={selectedCategoryTitle} actionLabel={txa('Tümünü Gör')} to={`/listeler?kategori=${activeCategory}`} />
                  {filteredDiscoverLists.length === 0 ? (
                    <EmptyListPanel title={txa('Bu kategoride liste yok')} body={txa('Liste oluştururken seçilen türler burada kategori akışını besler.')} />
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                      {filteredDiscoverLists.slice(0, 10).map((item) => (
                        <MangaListShowcaseCard key={item.id} item={item} />
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </main>

          <MangaListsSidebar
            weeklyList={weeklyList}
            popularTags={popularTags}
            curators={curators}
            stats={listStats}
          />
        </div>
      </div>
    </div>
  )
}

export default MangaListsPage
