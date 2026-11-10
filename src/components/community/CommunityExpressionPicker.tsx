import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { SmilePlus } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  readCommunityExpressionFavorites,
  toggleCommunityExpressionFavorite,
  type CommunityExpressionFavoriteTab,
} from '@/lib/communityExpressionFavorites'
import { isPremiumActive } from '@/services/premiumPackagePublicService'
import { usePremiumPerk } from '@/lib/premiumPerks'
import {
  listCommunityExpressionFansubSources,
} from '@/services/communityExpressionPickerService'
import { searchCommunityGifProvider, isCommunityGifProviderConfigured } from '@/services/communityGifProviderService'
import {
  listPublicFansubSupporterAssets,
  type FansubSupporterAssetCatalogItem,
} from '@/services/fansubSupporterAssetService'
import type { CommunityGifSelection } from '@types'
import { COMMUNITY_COMPOSER_EMOJI_OPTIONS } from './communityUiShared'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverTrigger } from '@/components/ui/popover'
import CommunityPremiumUnlockDialog from './CommunityPremiumUnlockDialog'
import { useCommunityPremiumUnlock } from './useCommunityPremiumUnlock'
import { CommunityExpressionPickerPanel } from './CommunityExpressionPickerPanel'
import {
  buildAssetToken,
  buildCustomFavoriteKey,
  buildExpressionTabs,
  buildFansubSourceKey,
  buildGifFavoriteKey,
  buildSourceHint,
  buildUnicodeFavoriteKey,
  DEFAULT_SOURCE_KEY,
  FAVORITES_SOURCE_KEY,
  matchesSearch,
  normalizeSearchText,
  parseFavoriteCustomKey,
  type CommunityExpressionPickerProps,
  type CommunityExpressionPickerTab,
  type CommunityExpressionSourceKey,
  type CustomExpressionItem,
  type EmojiExpressionItem,
  type GifExpressionItem,
  type UnicodeExpressionItem,
} from './communityExpressionPicker.shared'
import { txa } from '@/i18n/activeLocale'

export function CommunityExpressionPicker({
  disabled = false,
  contextFansubId,
  isGifEnabled = false,
  selectedGif,
  launcherVariant = 'single',
  onInsertText,
  onSelectGif,
  onClearGif,
}: CommunityExpressionPickerProps) {
  const { currentUser, updateCurrentUser } = useAuth()
  const premiumActive = isPremiumActive(currentUser?.premiumExpiresAt ?? null)
  // Magaza Kontrol > Premium: fansub ifadeleri kapaliysa fansub kaynaklari listelenmez.
  const fansubExpressionsEnabled = usePremiumPerk('fansub_expressions')
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<CommunityExpressionPickerTab>('emoji')
  const [searchQuery, setSearchQuery] = useState('')
  const [favorites, setFavorites] = useState(() => readCommunityExpressionFavorites())
  const [fansubSources, setFansubSources] = useState<Awaited<ReturnType<typeof listCommunityExpressionFansubSources>>>([])
  const [sourcesLoading, setSourcesLoading] = useState(false)
  const [assetCache, setAssetCache] = useState<Record<string, Partial<Record<'emoji' | 'sticker', FansubSupporterAssetCatalogItem[]>>>>({})
  const [loadingAssetKeys, setLoadingAssetKeys] = useState<string[]>([])
  const [selectedSourceByTab, setSelectedSourceByTab] = useState<Record<'emoji' | 'sticker', CommunityExpressionSourceKey>>({
    emoji: DEFAULT_SOURCE_KEY,
    sticker: FAVORITES_SOURCE_KEY,
  })
  const [gifResults, setGifResults] = useState<CommunityGifSelection[]>([])
  const [gifLoading, setGifLoading] = useState(false)
  const {
    premiumUnlockOpen,
    premiumOffer,
    premiumOfferLoading,
    premiumPurchasePending,
    setPremiumUnlockOpen,
    openPremiumUnlockDialog,
    handlePremiumPurchase,
  } = useCommunityPremiumUnlock({
    currentUser,
    premiumActive,
    updateCurrentUser,
  })

  const normalizedQuery = useMemo(() => normalizeSearchText(searchQuery), [searchQuery])
  const expressionTabs = useMemo(() => buildExpressionTabs(isGifEnabled), [isGifEnabled])
  const gifProviderConfigured = isCommunityGifProviderConfigured()

  const customSources = useMemo(() => (
    (fansubExpressionsEnabled ? fansubSources : []).map((source) => ({
      key: buildFansubSourceKey(source.id) as CommunityExpressionSourceKey,
      source,
    }))
  ), [fansubExpressionsEnabled, fansubSources])

  const emojiSources = useMemo(() => ([
    FAVORITES_SOURCE_KEY as CommunityExpressionSourceKey,
    DEFAULT_SOURCE_KEY as CommunityExpressionSourceKey,
    ...customSources.map((entry) => entry.key),
  ]), [customSources])

  const stickerSources = useMemo(() => ([
    FAVORITES_SOURCE_KEY as CommunityExpressionSourceKey,
    ...customSources.map((entry) => entry.key),
  ]), [customSources])

  const contextSourceKey = useMemo(() => {
    const contextSource = fansubSources.find((source) => source.reasons.includes('context'))
    return contextSource ? buildFansubSourceKey(contextSource.id) : null
  }, [fansubSources])

  const toggleFavorite = useCallback((tab: CommunityExpressionFavoriteTab, key: string) => {
    setFavorites(toggleCommunityExpressionFavorite(tab, key))
  }, [])

  const ensureAssetsLoaded = useCallback(async (
    fansubId: string,
    kind: 'emoji' | 'sticker',
  ) => {
    const cacheEntry = assetCache[fansubId]?.[kind]
    if (cacheEntry) return

    const loadingKey = `${fansubId}:${kind}`
    if (loadingAssetKeys.includes(loadingKey)) return

    setLoadingAssetKeys((previous) => [...previous, loadingKey])
    try {
      const items = await listPublicFansubSupporterAssets(fansubId, kind)
      setAssetCache((previous) => ({
        ...previous,
        [fansubId]: {
          ...previous[fansubId],
          [kind]: items.filter((asset) => asset.isUsable && asset.assetKind === kind),
        },
      }))
    } finally {
      setLoadingAssetKeys((previous) => previous.filter((entry) => entry !== loadingKey))
    }
  }, [assetCache, loadingAssetKeys])

  useEffect(() => {
    if (!open) return

    let alive = true
    setSourcesLoading(true)

    void listCommunityExpressionFansubSources({
      userId: currentUser?.id,
      contextFansubId,
    }).then((sources) => {
      if (!alive) return
      setFansubSources(sources)
    }).finally(() => {
      if (!alive) return
      setSourcesLoading(false)
    })

    return () => {
      alive = false
    }
  }, [contextFansubId, currentUser?.id, open])

  useEffect(() => {
    const nextEmojiSource = (() => {
      if (contextSourceKey && emojiSources.includes(contextSourceKey)) return contextSourceKey
      const firstCustomSource = customSources[0]?.key
      if (firstCustomSource && emojiSources.includes(firstCustomSource)) return firstCustomSource
      return DEFAULT_SOURCE_KEY
    })()

    const nextStickerSource = (() => {
      if (contextSourceKey && stickerSources.includes(contextSourceKey)) return contextSourceKey
      return customSources[0]?.key || FAVORITES_SOURCE_KEY
    })()

    setSelectedSourceByTab((previous) => ({
      emoji: emojiSources.includes(previous.emoji) ? previous.emoji : nextEmojiSource,
      sticker: stickerSources.includes(previous.sticker) ? previous.sticker : nextStickerSource,
    }))
  }, [contextSourceKey, customSources, emojiSources, stickerSources])

  useEffect(() => {
    if (!open || activeTab === 'gif') return

    const sourceKey = selectedSourceByTab[activeTab]
    if (sourceKey.startsWith('fansub:')) {
      void ensureAssetsLoaded(sourceKey.slice('fansub:'.length), activeTab)
      return
    }

    if (sourceKey !== FAVORITES_SOURCE_KEY) return

    const requiredFansubIds = favorites[activeTab]
      .map((key) => parseFavoriteCustomKey(key))
      .filter((entry): entry is NonNullable<ReturnType<typeof parseFavoriteCustomKey>> => entry !== null)
      .filter((entry) => entry.kind === activeTab)
      .map((entry) => entry.fansubId)

    Array.from(new Set(requiredFansubIds)).forEach((fansubId) => {
      void ensureAssetsLoaded(fansubId, activeTab)
    })
  }, [activeTab, ensureAssetsLoaded, favorites, open, selectedSourceByTab])

  useEffect(() => {
    if (!open || activeTab !== 'gif' || !isGifEnabled || !gifProviderConfigured) {
      setGifLoading(false)
      setGifResults([])
      return
    }

    if (searchQuery.trim().length < 2) {
      setGifLoading(false)
      setGifResults([])
      return
    }

    let cancelled = false
    const timer = window.setTimeout(async () => {
      setGifLoading(true)
      try {
        const results = await searchCommunityGifProvider(searchQuery.trim(), 16)
        if (!cancelled) setGifResults(results)
      } finally {
        if (!cancelled) setGifLoading(false)
      }
    }, 260)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [activeTab, gifProviderConfigured, isGifEnabled, open, searchQuery])

  const unicodeEmojiItems = useMemo<UnicodeExpressionItem[]>(() => (
    COMMUNITY_COMPOSER_EMOJI_OPTIONS.map((emoji) => ({
      id: `unicode:${emoji}`,
      kind: 'unicode',
      label: emoji,
      searchText: emoji,
      favoriteKey: buildUnicodeFavoriteKey(emoji),
      value: emoji,
    }))
  ), [])

  const customEmojiItemsBySource = useMemo<Record<string, CustomExpressionItem[]>>(() => {
    const nextEntries: Record<string, CustomExpressionItem[]> = {}

    Object.entries(assetCache).forEach(([fansubId, bundles]) => {
      nextEntries[`${fansubId}:emoji`] = (bundles.emoji || []).map((asset) => ({
        id: `emoji:${asset.id}`,
        kind: 'emoji' as const,
        label: asset.label,
        searchText: `${asset.label} ${asset.shortcode}`,
        favoriteKey: buildCustomFavoriteKey(asset),
        asset,
        locked: !premiumActive,
        token: buildAssetToken(asset),
      }))

      nextEntries[`${fansubId}:sticker`] = (bundles.sticker || []).map((asset) => ({
        id: `sticker:${asset.id}`,
        kind: 'sticker' as const,
        label: asset.label,
        searchText: `${asset.label} ${asset.shortcode}`,
        favoriteKey: buildCustomFavoriteKey(asset),
        asset,
        locked: !premiumActive,
        token: buildAssetToken(asset),
      }))
    })

    return nextEntries
  }, [assetCache, premiumActive])

  const favoriteEmojiItems = useMemo<EmojiExpressionItem[]>(() => {
    const items: EmojiExpressionItem[] = []

    for (const favoriteKey of favorites.emoji) {
      if (favoriteKey.startsWith('unicode:')) {
        const value = favoriteKey.slice('unicode:'.length)
        items.push({
          id: favoriteKey,
          kind: 'unicode',
          label: value,
          searchText: value,
          favoriteKey,
          value,
        })
        continue
      }

      const parsed = parseFavoriteCustomKey(favoriteKey)
      if (!parsed || parsed.kind !== 'emoji') continue
      const asset = (customEmojiItemsBySource[`${parsed.fansubId}:emoji`] || [])
        .find((entry) => entry.asset.shortcode === parsed.shortcode)
      if (asset) items.push(asset)
    }

    return items
  }, [customEmojiItemsBySource, favorites.emoji])

  const favoriteStickerItems = useMemo<CustomExpressionItem[]>(() => {
    const items: CustomExpressionItem[] = []

    for (const favoriteKey of favorites.sticker) {
      const parsed = parseFavoriteCustomKey(favoriteKey)
      if (!parsed || parsed.kind !== 'sticker') continue
      const asset = (customEmojiItemsBySource[`${parsed.fansubId}:sticker`] || [])
        .find((entry) => entry.asset.shortcode === parsed.shortcode)
      if (asset) items.push(asset)
    }

    return items
  }, [customEmojiItemsBySource, favorites.sticker])

  const favoriteGifItems = useMemo<GifExpressionItem[]>(() => {
    const currentGif = selectedGif
      ? {
          id: selectedGif.providerAssetId,
          kind: 'gif' as const,
          label: selectedGif.altText || selectedGif.providerAssetId,
          searchText: `${selectedGif.altText || ''} ${selectedGif.providerAssetId}`,
          favoriteKey: buildGifFavoriteKey(selectedGif),
          gif: selectedGif,
        }
      : null
    if (!currentGif || !favorites.gif.includes(currentGif.favoriteKey)) return []
    return [currentGif]
  }, [favorites.gif, selectedGif])

  const selectedEmojiSource = selectedSourceByTab.emoji
  const selectedStickerSource = selectedSourceByTab.sticker

  const visibleEmojiItems = useMemo<EmojiExpressionItem[]>(() => {
    const items = selectedEmojiSource === FAVORITES_SOURCE_KEY
      ? favoriteEmojiItems
      : selectedEmojiSource === DEFAULT_SOURCE_KEY
        ? unicodeEmojiItems
        : (customEmojiItemsBySource[`${selectedEmojiSource.slice('fansub:'.length)}:emoji`] || [])

    return items.filter((item) => matchesSearch(item.searchText, normalizedQuery))
  }, [customEmojiItemsBySource, favoriteEmojiItems, normalizedQuery, selectedEmojiSource, unicodeEmojiItems])

  const visibleStickerItems = useMemo<CustomExpressionItem[]>(() => {
    const items = selectedStickerSource === FAVORITES_SOURCE_KEY
      ? favoriteStickerItems
      : (customEmojiItemsBySource[`${selectedStickerSource.slice('fansub:'.length)}:sticker`] || [])

    return items.filter((item) => matchesSearch(item.searchText, normalizedQuery))
  }, [customEmojiItemsBySource, favoriteStickerItems, normalizedQuery, selectedStickerSource])

  const visibleGifItems = useMemo<GifExpressionItem[]>(() => {
    if (searchQuery.trim().length >= 2) {
      return gifResults
        .map((gif) => ({
          id: gif.providerAssetId,
          kind: 'gif' as const,
          label: gif.altText || gif.providerAssetId,
          searchText: `${gif.altText || ''} ${gif.providerAssetId}`,
          favoriteKey: buildGifFavoriteKey(gif),
          gif,
        }))
        .filter((item) => matchesSearch(item.searchText, normalizedQuery))
    }

    return favoriteGifItems
  }, [favoriteGifItems, gifResults, normalizedQuery, searchQuery])

  const currentAssetSource = useMemo(() => {
    const sourceKey = activeTab === 'emoji' ? selectedEmojiSource : selectedStickerSource
    if (!sourceKey.startsWith('fansub:')) return null
    return fansubSources.find((source) => buildFansubSourceKey(source.id) === sourceKey) || null
  }, [activeTab, fansubSources, selectedEmojiSource, selectedStickerSource])

  const currentAssetLoading = useMemo(() => {
    if (activeTab === 'gif') return false
    const sourceKey = activeTab === 'emoji' ? selectedEmojiSource : selectedStickerSource
    if (!sourceKey.startsWith('fansub:')) return false
    return loadingAssetKeys.includes(`${sourceKey.slice('fansub:'.length)}:${activeTab}`)
  }, [activeTab, loadingAssetKeys, selectedEmojiSource, selectedStickerSource])

  const hasLockedCustomContent = useMemo(() => {
    if (premiumActive) return false
    if (activeTab === 'emoji') return visibleEmojiItems.some((item) => item.kind === 'emoji' && item.locked)
    if (activeTab === 'sticker') return visibleStickerItems.some((item) => item.locked)
    return false
  }, [activeTab, premiumActive, visibleEmojiItems, visibleStickerItems])

  const handleInsertEmoji = useCallback((item: EmojiExpressionItem) => {
    if (item.kind === 'emoji' && item.locked) return
    onInsertText(item.kind === 'unicode' ? item.value : item.token)
    setOpen(false)
  }, [onInsertText])

  const handleInsertSticker = useCallback((item: CustomExpressionItem) => {
    if (item.locked) return
    onInsertText(item.token)
    setOpen(false)
  }, [onInsertText])

  const handleSelectGif = useCallback((gif: CommunityGifSelection) => {
    onSelectGif?.(gif)
    setOpen(false)
  }, [onSelectGif])

  const handleInlineLauncherMouseDown = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    // Keeping focus on the textarea preserves the typing flow and makes the picker opening steadier.
    event.preventDefault()
  }, [])

  const handleInlineLauncherClick = useCallback((tab: CommunityExpressionPickerTab) => {
    setActiveTab(tab)
    setSearchQuery('')
    setOpen(true)
  }, [])

  const handleTabChange = useCallback((tab: CommunityExpressionPickerTab) => {
    setActiveTab(tab)
    setSearchQuery('')
  }, [])

  const handleSelectSource = useCallback((tab: 'emoji' | 'sticker', sourceKey: CommunityExpressionSourceKey) => {
    setSelectedSourceByTab((previous) => ({ ...previous, [tab]: sourceKey }))
  }, [])

  const sourceTitle = (() => {
    if (activeTab === 'gif') return 'GIF'
    if (activeTab === 'emoji') {
      if (selectedEmojiSource === FAVORITES_SOURCE_KEY) return txa('Favori emoji')
      if (selectedEmojiSource === DEFAULT_SOURCE_KEY) return txa('Varsayılan emoji')
      return currentAssetSource?.name || txa('Fansub emojileri')
    }
    if (selectedStickerSource === FAVORITES_SOURCE_KEY) return txa('Favori çıkartma')
    return currentAssetSource?.name || txa('Fansub çıkartmaları')
  })()

  const sourceHint = activeTab === 'gif'
    ? txa('GIF, çıkartma ve emoji tek panelde.')
    : currentAssetSource
      ? buildSourceHint(currentAssetSource)
      : activeTab === 'emoji' && selectedEmojiSource === DEFAULT_SOURCE_KEY
        ? txa('Hızlı Unicode emoji seti.')
        : txa('Favori ifadelerin burada toplanır.')

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {launcherVariant === 'inline-icons' ? (
        <PopoverAnchor asChild>
          <div className="flex items-center gap-1 rounded-full border border-border/60 bg-background/92 p-1">
            {expressionTabs
              .filter((tab) => tab.visible)
              .map((tab) => {
                const Icon = tab.icon
                const triggerTestId = tab.key === 'emoji'
                  ? 'community-expression-picker-trigger'
                  : `community-expression-picker-trigger-${tab.key}`
                const triggerAriaLabel = tab.key === 'gif'
                  ? txa('GIF panelini ac')
                  : txa('{v1} panelini aç', { v1: tab.label })
                return (
                  <Button
                    key={tab.key}
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={disabled}
                    className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                    aria-label={triggerAriaLabel}
                    aria-expanded={open}
                    data-testid={triggerTestId}
                    onMouseDown={handleInlineLauncherMouseDown}
                    onClick={() => handleInlineLauncherClick(tab.key)}
                  >
                    <Icon className="h-4 w-4" />
                  </Button>
                )
              })}
          </div>
        </PopoverAnchor>
      ) : (
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            className="h-9 w-9 rounded-full border border-border/60 bg-background/90 text-muted-foreground hover:border-primary/25 hover:text-foreground"
            aria-label={txa('İfade seç')}
            data-testid="community-expression-picker-trigger"
          >
            <SmilePlus className="h-4.5 w-4.5" />
          </Button>
        </PopoverTrigger>
      )}
      <CommunityExpressionPickerPanel
        launcherVariant={launcherVariant}
        activeTab={activeTab}
        customSources={customSources}
        currentAssetLoading={currentAssetLoading}
        disabled={disabled}
        emojiSources={emojiSources}
        expressionTabs={expressionTabs}
        favorites={favorites}
        gifLoading={gifLoading}
        gifProviderConfigured={gifProviderConfigured}
        hasLockedCustomContent={hasLockedCustomContent}
        onClearGif={onClearGif}
        onClose={() => setOpen(false)}
        onInsertEmoji={handleInsertEmoji}
        onInsertSticker={handleInsertSticker}
        onPremiumUnlock={() => void openPremiumUnlockDialog()}
        onSearchQueryChange={setSearchQuery}
        onSelectGif={(gif) => handleSelectGif(gif)}
        onSelectSource={handleSelectSource}
        onTabChange={handleTabChange}
        onToggleFavorite={toggleFavorite}
        premiumActive={premiumActive}
        searchQuery={searchQuery}
        selectedEmojiSource={selectedEmojiSource}
        selectedGif={selectedGif}
        selectedStickerSource={selectedStickerSource}
        sourceHint={sourceHint}
        sourceTitle={sourceTitle}
        sourcesLoading={sourcesLoading}
        stickerSources={stickerSources}
        visibleEmojiItems={visibleEmojiItems}
        visibleGifItems={visibleGifItems}
        visibleStickerItems={visibleStickerItems}
      />
      <CommunityPremiumUnlockDialog
        open={premiumUnlockOpen}
        currentUser={currentUser}
        offer={premiumOffer}
        loading={premiumOfferLoading}
        purchasing={premiumPurchasePending}
        onOpenChange={setPremiumUnlockOpen}
        onPurchase={() => void handlePremiumPurchase()}
      />
    </Popover>
  )
}

export default CommunityExpressionPicker
