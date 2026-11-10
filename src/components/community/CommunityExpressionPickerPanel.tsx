import { Crown, Loader2, Search, SmilePlus, Sparkles, Star, X } from 'lucide-react'
import type { CommunityExpressionFavoriteTab } from '@/lib/communityExpressionFavorites'
import { cn } from '@/lib/utils'
import FansubSupporterAssetMedia from './FansubSupporterAssetMedia'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PopoverContent } from '@/components/ui/popover'
import {
  buildSourceHint,
  CUSTOM_ASSET_PICKER_EMPTY_STATE_CLASS,
  CUSTOM_ASSET_PICKER_VIEWPORT_CLASS,
  DEFAULT_SOURCE_KEY,
  FAVORITES_SOURCE_KEY,
  type CommunityExpressionPickerPanelProps,
  type CustomExpressionItem,
} from './communityExpressionPicker.shared'
import { txa } from '@/i18n/activeLocale'

function FavoriteButton({
  favoriteKey,
  isActive,
  onToggle,
}: {
  favoriteKey: string
  isActive: boolean
  onToggle: () => void
}) {
  return (
    <span
      role="button"
      tabIndex={0}
      className={cn(
        'absolute -right-1 -top-1 z-10 inline-flex h-5 w-5 items-center justify-center rounded-full border bg-background/92 transition-colors',
        isActive
          ? 'border-primary/30 text-primary'
          : 'border-border/60 text-muted-foreground hover:border-primary/25 hover:text-foreground',
      )}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        event.stopPropagation()
        onToggle()
      }}
      aria-label={txa('Favori durumunu degistir: {v1}', { v1: favoriteKey })}
    >
      <Star className={cn('h-3 w-3', isActive && 'fill-current')} />
    </span>
  )
}

function CustomItemBadge({
  item,
  favoriteTab,
  isFavorite,
  onPremiumUnlock,
  onToggleFavorite,
}: {
  item: CustomExpressionItem
  favoriteTab: CommunityExpressionFavoriteTab
  isFavorite: boolean
  onPremiumUnlock: () => void
  onToggleFavorite: (tab: CommunityExpressionFavoriteTab, key: string) => void
}) {
  if (item.locked) {
    return (
      <button
        type="button"
        className="absolute -right-1 -top-1 z-10 inline-flex h-5 w-5 items-center justify-center rounded-full border border-primary/35 bg-background/96 text-primary transition-colors hover:border-primary/45 hover:bg-primary/8"
        onClick={(event) => {
          event.stopPropagation()
          onPremiumUnlock()
        }}
        aria-label={txa('Premium\'a git')}
      >
        <Crown className="h-3 w-3" />
      </button>
    )
  }

  return (
    <FavoriteButton
      favoriteKey={item.favoriteKey}
      isActive={isFavorite}
      onToggle={() => onToggleFavorite(favoriteTab, item.favoriteKey)}
    />
  )
}

function SourceRail({
  customSources,
  emojiSources,
  premiumActive,
  selectedEmojiSource,
  selectedStickerSource,
  stickerSources,
  tab,
  onSelectSource,
}: {
  customSources: CommunityExpressionPickerPanelProps['customSources']
  emojiSources: CommunityExpressionPickerPanelProps['emojiSources']
  premiumActive: boolean
  selectedEmojiSource: CommunityExpressionPickerPanelProps['selectedEmojiSource']
  selectedStickerSource: CommunityExpressionPickerPanelProps['selectedStickerSource']
  stickerSources: CommunityExpressionPickerPanelProps['stickerSources']
  tab: 'emoji' | 'sticker'
  onSelectSource: CommunityExpressionPickerPanelProps['onSelectSource']
}) {
  const entries = tab === 'emoji' ? emojiSources : stickerSources
  const selectedSource = tab === 'emoji' ? selectedEmojiSource : selectedStickerSource

  return (
    <div
      className={cn(
        'flex w-[76px] shrink-0 flex-col items-center gap-2 overflow-x-hidden overflow-y-auto overscroll-contain border-r border-border/60 px-1.5 pr-2 [scrollbar-gutter:stable]',
        CUSTOM_ASSET_PICKER_VIEWPORT_CLASS,
      )}
    >
      {entries.map((sourceKey) => {
        const isActive = sourceKey === selectedSource
        if (sourceKey === FAVORITES_SOURCE_KEY) {
          return (
            <button
              key={sourceKey}
              type="button"
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition-colors',
                isActive
                  ? 'border-primary/35 bg-primary/12 text-primary'
                  : 'border-border/60 bg-background/80 text-muted-foreground hover:border-primary/25 hover:text-foreground',
              )}
              title={txa('Favoriler')}
              data-testid={`community-expression-source-${tab}-favorites`}
              onClick={() => onSelectSource(tab, FAVORITES_SOURCE_KEY)}
            >
              <Star className={cn('h-4 w-4', isActive && 'fill-current')} />
            </button>
          )
        }

        if (sourceKey === DEFAULT_SOURCE_KEY) {
          return (
            <button
              key={sourceKey}
              type="button"
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition-colors',
                isActive
                  ? 'border-primary/35 bg-primary/12 text-primary'
                  : 'border-border/60 bg-background/80 text-muted-foreground hover:border-primary/25 hover:text-foreground',
              )}
              title={txa('Varsayılan emoji')}
              data-testid="community-expression-source-emoji-default"
              onClick={() => onSelectSource('emoji', DEFAULT_SOURCE_KEY)}
            >
              <SmilePlus className="h-4 w-4" />
            </button>
          )
        }

        const source = customSources.find((entry) => entry.key === sourceKey)?.source
        if (!source) return null
        return (
          <button
            key={sourceKey}
            type="button"
            className={cn(
              'group relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border transition-colors',
              isActive
                ? 'border-primary/35 bg-primary/10'
                : 'border-border/60 bg-background/80 hover:border-primary/20',
            )}
            title={`${source.name} - ${buildSourceHint(source)}`}
            data-testid={`community-expression-source-${source.id}`}
            onClick={() => onSelectSource(tab, sourceKey)}
          >
            {source.avatarUrl ? (
              <img
                loading="lazy"
                decoding="async"
                src={source.avatarUrl}
                alt={source.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-xs font-semibold text-foreground">{source.name.slice(0, 2).toUpperCase()}</span>
            )}
            {!premiumActive ? (
              <span className="absolute bottom-1 right-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-background/92 text-[9px] font-semibold text-muted-foreground shadow-sm">
                <Crown className="h-2.5 w-2.5" />
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export function CommunityExpressionPickerPanel({
  launcherVariant,
  activeTab,
  customSources,
  currentAssetLoading,
  disabled,
  emojiSources,
  expressionTabs,
  favorites,
  gifLoading,
  gifProviderConfigured,
  hasLockedCustomContent,
  onClearGif,
  onClose,
  onInsertEmoji,
  onInsertSticker,
  onPremiumUnlock,
  onSearchQueryChange,
  onSelectGif,
  onSelectSource,
  onTabChange,
  onToggleFavorite,
  premiumActive,
  searchQuery,
  selectedEmojiSource,
  selectedGif,
  selectedStickerSource,
  sourceHint,
  sourceTitle,
  sourcesLoading,
  stickerSources,
  visibleEmojiItems,
  visibleGifItems,
  visibleStickerItems,
}: CommunityExpressionPickerPanelProps) {
  const renderEmojiGrid = () => (
    <div className={cn('min-h-0 flex-1', CUSTOM_ASSET_PICKER_VIEWPORT_CLASS)}>
      {currentAssetLoading ? (
        <div className={cn('flex items-center justify-center rounded-[24px] border border-dashed border-border/60 bg-muted/20 text-sm text-muted-foreground', CUSTOM_ASSET_PICKER_EMPTY_STATE_CLASS)}>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {txa('Emoji seti yükleniyor...')}
        </div>
      ) : visibleEmojiItems.length > 0 ? (
        <div className="flex max-h-full flex-wrap content-start gap-1.5 overflow-x-hidden overflow-y-auto pr-1">
          {visibleEmojiItems.map((item) => {
            const isFavorite = favorites.emoji.includes(item.favoriteKey)
            return (
              <div key={item.id} className="relative h-11 w-11 shrink-0">
                <button
                  type="button"
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-2xl transition-colors',
                    item.kind === 'emoji' && item.locked
                      ? 'cursor-pointer opacity-90 hover:bg-primary/8'
                      : 'hover:bg-accent/55',
                  )}
                  data-testid={item.kind === 'unicode' ? undefined : `community-expression-item-emoji-${item.asset.shortcode}`}
                  disabled={disabled}
                  onClick={() => {
                    if (item.kind === 'emoji' && item.locked) {
                      onPremiumUnlock()
                      return
                    }
                    onInsertEmoji(item)
                  }}
                  title={item.label}
                >
                  {item.kind === 'unicode' ? (
                    <span className="text-[1.55rem] leading-none">{item.value}</span>
                  ) : (
                    <FansubSupporterAssetMedia
                      asset={item.asset}
                      className="h-9 w-9 rounded-xl bg-transparent"
                      imageClassName="object-cover"
                    />
                  )}
                </button>
                {item.kind === 'unicode' ? (
                  <FavoriteButton
                    favoriteKey={item.favoriteKey}
                    isActive={isFavorite}
                    onToggle={() => onToggleFavorite('emoji', item.favoriteKey)}
                  />
                ) : (
                  <CustomItemBadge
                    item={item}
                    favoriteTab="emoji"
                    isFavorite={isFavorite}
                    onPremiumUnlock={onPremiumUnlock}
                    onToggleFavorite={onToggleFavorite}
                  />
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className={cn('flex items-center justify-center rounded-[24px] border border-dashed border-border/60 bg-muted/20 px-6 text-center text-sm text-muted-foreground', CUSTOM_ASSET_PICKER_EMPTY_STATE_CLASS)}>
          {txa('Bu kaynakta gösterilecek emoji yok.')}
        </div>
      )}
    </div>
  )

  const renderStickerGrid = () => (
    <div className={cn('min-h-0 flex-1', CUSTOM_ASSET_PICKER_VIEWPORT_CLASS)}>
      {currentAssetLoading ? (
        <div className={cn('flex items-center justify-center rounded-[24px] border border-dashed border-border/60 bg-muted/20 text-sm text-muted-foreground', CUSTOM_ASSET_PICKER_EMPTY_STATE_CLASS)}>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {txa('Çıkartma seti yükleniyor...')}
        </div>
      ) : visibleStickerItems.length > 0 ? (
        <div className="grid max-h-full grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2 overflow-x-hidden overflow-y-auto pr-1">
          {visibleStickerItems.map((item) => {
            const isFavorite = favorites.sticker.includes(item.favoriteKey)
            return (
              <div key={item.id} className="relative h-[88px]">
                <button
                  type="button"
                  className={cn(
                    'flex h-[88px] w-full items-center justify-center overflow-hidden rounded-[22px] p-1 text-left transition-colors',
                    item.locked
                      ? 'cursor-pointer opacity-90 hover:bg-primary/8'
                      : 'hover:bg-accent/45',
                  )}
                  data-testid={`community-expression-item-sticker-${item.asset.shortcode}`}
                  disabled={disabled}
                  onClick={() => {
                    if (item.locked) {
                      onPremiumUnlock()
                      return
                    }
                    onInsertSticker(item)
                  }}
                  title={item.label}
                >
                  <FansubSupporterAssetMedia
                    asset={item.asset}
                    className="h-full w-full rounded-[18px] bg-transparent"
                    imageClassName="object-contain"
                  />
                </button>
                <CustomItemBadge
                  item={item}
                  favoriteTab="sticker"
                  isFavorite={isFavorite}
                  onPremiumUnlock={onPremiumUnlock}
                  onToggleFavorite={onToggleFavorite}
                />
              </div>
            )
          })}
        </div>
      ) : (
        <div className={cn('flex items-center justify-center rounded-[24px] border border-dashed border-border/60 bg-muted/20 px-6 text-center text-sm text-muted-foreground', CUSTOM_ASSET_PICKER_EMPTY_STATE_CLASS)}>
          {txa('Bu kaynakta gösterilecek çıkartma yok.')}
        </div>
      )}
    </div>
  )

  const renderGifGrid = () => {
    const showFavorites = searchQuery.trim().length < 2
    return (
      <div className={cn('flex min-h-0 flex-1 flex-col gap-3', CUSTOM_ASSET_PICKER_VIEWPORT_CLASS)}>
        {selectedGif ? (
          <div className="flex items-center justify-between rounded-[20px] border border-primary/20 bg-primary/8 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{txa('Seçili GIF')}</p>
              <p className="truncate text-xs text-muted-foreground">{selectedGif.providerAssetId}</p>
            </div>
            {onClearGif ? (
              <Button type="button" size="icon-sm" variant="ghost" onClick={onClearGif}>
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        ) : null}
        {!gifProviderConfigured ? (
          <div className={cn('flex items-center justify-center rounded-[24px] border border-dashed border-border/60 bg-muted/20 px-6 text-center text-sm text-muted-foreground', CUSTOM_ASSET_PICKER_EMPTY_STATE_CLASS)}>
            {txa('GIF sağlayıcısı hazır değil.')}
          </div>
        ) : gifLoading ? (
          <div className={cn('flex items-center justify-center rounded-[24px] border border-dashed border-border/60 bg-muted/20 text-sm text-muted-foreground', CUSTOM_ASSET_PICKER_EMPTY_STATE_CLASS)}>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {txa('GIF önerileri getiriliyor...')}
          </div>
        ) : visibleGifItems.length > 0 ? (
          <div className="grid max-h-full grid-cols-3 gap-3 overflow-x-hidden overflow-y-auto pr-1">
            {visibleGifItems.map((item) => {
              const isFavorite = favorites.gif.includes(item.favoriteKey)
              const isSelected = selectedGif?.providerAssetId === item.gif.providerAssetId
              return (
                <div key={item.id} className="relative">
                  <button
                    type="button"
                    className={cn(
                      'overflow-hidden rounded-[22px] transition-colors',
                      isSelected
                        ? 'ring-2 ring-primary/30'
                        : 'hover:opacity-95',
                    )}
                    onClick={() => onSelectGif(item.gif)}
                    title={item.label}
                  >
                    <img
                      loading="lazy"
                      decoding="async"
                      src={item.gif.previewUrl}
                      alt={item.label}
                      className="h-24 w-full object-cover"
                    />
                  </button>
                  <FavoriteButton
                    favoriteKey={item.favoriteKey}
                    isActive={isFavorite}
                    onToggle={() => onToggleFavorite('gif', item.favoriteKey)}
                  />
                </div>
              )
            })}
          </div>
        ) : (
          <div className={cn('flex items-center justify-center rounded-[24px] border border-dashed border-border/60 bg-muted/20 px-6 text-center text-sm text-muted-foreground', CUSTOM_ASSET_PICKER_EMPTY_STATE_CLASS)}>
            {showFavorites ? txa('Favori GIF yok. Arama ile yeni GIF bulabilirsin.') : txa('GIF sonucu bulunamadı.')}
          </div>
        )}
      </div>
    )
  }

  return (
    <PopoverContent
      align={launcherVariant === 'inline-icons' ? 'end' : 'start'}
      sideOffset={10}
      collisionPadding={12}
      className="z-[11120] w-[min(640px,calc(100vw-1rem))] rounded-[28px] border-border/70 p-0 shadow-2xl"
      data-testid="community-expression-picker-panel"
    >
      <div className="flex flex-col">
        <div className="flex items-center justify-between border-b border-border/60 px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            {expressionTabs
              .filter((tab) => tab.visible)
              .map((tab) => {
                const Icon = tab.icon
                const isActive = activeTab === tab.key
                return (
                  <button
                    key={tab.key}
                    type="button"
                    data-testid={`community-expression-tab-${tab.key}`}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                    )}
                    onClick={() => onTabChange(tab.key)}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                )
              })}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="rounded-full"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2.5 p-3.5">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
                placeholder={activeTab === 'gif'
                  ? (gifProviderConfigured ? txa('Tenor\'da ara') : txa('GIF ara'))
                  : txa('Kısa kod veya ad ara')}
                className="h-11 rounded-full border-border/60 bg-background/90 pl-10"
              />
            </div>
            {sourcesLoading && activeTab !== 'gif' ? (
              <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {txa('Kaynaklar')}
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex items-start gap-2.5">
            {activeTab === 'gif' ? null : (
              <SourceRail
                customSources={customSources}
                emojiSources={emojiSources}
                premiumActive={premiumActive}
                selectedEmojiSource={selectedEmojiSource}
                selectedStickerSource={selectedStickerSource}
                stickerSources={stickerSources}
                tab={activeTab}
                onSelectSource={onSelectSource}
              />
            )}

            <div className="min-h-0 flex-1">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{sourceTitle}</p>
                  <p className="text-xs text-muted-foreground">{sourceHint}</p>
                </div>
                {!premiumActive && hasLockedCustomContent && activeTab !== 'gif' ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/8 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/12"
                    onClick={onPremiumUnlock}
                  >
                    <Sparkles className="h-3 w-3" />
                    {txa('Premium\'a git')}
                  </button>
                ) : null}
              </div>

              {activeTab === 'gif'
                ? renderGifGrid()
                : activeTab === 'emoji'
                  ? renderEmojiGrid()
                  : renderStickerGrid()}
            </div>
          </div>
        </div>
      </div>
    </PopoverContent>
  )
}
