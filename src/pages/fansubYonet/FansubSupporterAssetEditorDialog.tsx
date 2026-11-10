import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ImagePlus, RotateCcw, RotateCw, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  buildFansubSupporterAssetTransformStyle,
  FANSUB_SUPPORTER_ASSET_LABEL_MAX_LENGTH,
  FANSUB_SUPPORTER_ASSET_MAX_SCALE,
  FANSUB_SUPPORTER_ASSET_MIN_SCALE,
  FANSUB_SUPPORTER_ASSET_ROTATION_STEP,
  normalizeFansubSupporterAssetPresentation,
  type FansubSupporterAssetPresentation,
} from '@/lib/fansubSupporterAssetPresentation'
import {
  FANSUB_SUPPORTER_ASSET_SHORTCODE_MAX_LENGTH,
  normalizeFansubSupporterAssetShortcode,
  type FansubSupporterAssetKind,
} from '@/lib/fansubSupporterAssetTokens'
import type { FansubSupporterAssetCatalogItem } from '@/services/fansubSupporterAssetService'
import { resolveStoreAssetUrl } from '@/services/assetUrlService'
import { cn } from '@/lib/utils'
import { suppressAuthFocusSyncForNativeFileDialog } from '@/lib/nativeFileDialogFocus'
import { txa } from '@/i18n/activeLocale'

type FansubSupporterAssetEditorDialogProps = {
  open: boolean
  kind: FansubSupporterAssetKind
  mode?: 'create' | 'edit'
  asset?: FansubSupporterAssetCatalogItem | null
  submitting?: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (value: {
    shortcode: string
    label: string
    file?: File
    presentation: FansubSupporterAssetPresentation
  }) => void
}

const DEFAULT_LABELS: Record<FansubSupporterAssetKind, string> = {
  get emoji() { return txa('Yeni emoji') },
  get sticker() { return txa('Yeni cikartma') },
}

export default function FansubSupporterAssetEditorDialog({
  open,
  kind,
  mode = 'create',
  asset = null,
  submitting = false,
  onOpenChange,
  onSubmit,
}: FansubSupporterAssetEditorDialogProps) {
  const isEditMode = mode === 'edit'
  const [file, setFile] = useState<File | null>(null)
  const [shortcode, setShortcode] = useState('')
  const [label, setLabel] = useState('')
  const [presentation, setPresentation] = useState<FansubSupporterAssetPresentation>(
    normalizeFansubSupporterAssetPresentation(null, kind),
  )
  const [isDragging, setIsDragging] = useState(false)
  const dragStateRef = useRef<{ startX: number; startY: number; offsetX: number; offsetY: number } | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) {
      setFile(null)
      setShortcode('')
      setLabel('')
      setPresentation(normalizeFansubSupporterAssetPresentation(null, kind))
      setIsDragging(false)
      dragStateRef.current = null
      if (inputRef.current) {
        inputRef.current.value = ''
      }
      return
    }

    if (isEditMode && asset) {
      setFile(null)
      setShortcode(asset.shortcode)
      setLabel(asset.label)
      setPresentation(normalizeFansubSupporterAssetPresentation(asset.presentation, kind))
      return
    }

    setFile(null)
    setShortcode('')
    setLabel(DEFAULT_LABELS[kind])
    setPresentation(normalizeFansubSupporterAssetPresentation(null, kind))
  }, [asset, isEditMode, kind, open])

  const filePreviewUrl = useMemo(() => {
    if (!file) return null
    return URL.createObjectURL(file)
  }, [file])

  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl)
    }
  }, [filePreviewUrl])

  const previewUrl = filePreviewUrl || (asset?.assetRef ? resolveStoreAssetUrl(asset.assetRef) : null)
  const normalizedShortcode = normalizeFansubSupporterAssetShortcode(shortcode)
  const normalizedLabel = label.trim().slice(0, FANSUB_SUPPORTER_ASSET_LABEL_MAX_LENGTH)
  const canSubmit = isEditMode
    ? Boolean(asset && normalizedShortcode && normalizedLabel)
    : Boolean(file && normalizedShortcode && normalizedLabel)
  const viewportStyle = buildFansubSupporterAssetTransformStyle(presentation)
  const isEmoji = kind === 'emoji'

  const openFilePicker = () => {
    suppressAuthFocusSyncForNativeFileDialog()
    inputRef.current?.click()
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!previewUrl || !viewportRef.current) return
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      offsetX: presentation.offsetX,
      offsetY: presentation.offsetY,
    }
    setIsDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStateRef.current || !viewportRef.current) return
    const rect = viewportRef.current.getBoundingClientRect()
    const deltaX = ((event.clientX - dragStateRef.current.startX) / rect.width) * 100
    const deltaY = ((event.clientY - dragStateRef.current.startY) / rect.height) * 100
    setPresentation((prev) => normalizeFansubSupporterAssetPresentation({
      ...prev,
      offsetX: dragStateRef.current!.offsetX + deltaX,
      offsetY: dragStateRef.current!.offsetY + deltaY,
    }, kind))
  }

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragStateRef.current = null
    setIsDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[min(96vw,1080px)] max-w-[1080px] overflow-hidden border-border/70 bg-background p-0 sm:max-w-[1080px]"
        data-testid="fansub-supporter-asset-editor-dialog"
      >
        <div className="grid min-h-[620px] lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-h-0 flex-col border-b border-border/60 lg:border-r lg:border-b-0">
            <DialogHeader className="border-b border-border/60 px-5 py-4">
              <DialogTitle>{isEditMode ? (isEmoji ? txa('Emoji duzenle') : txa('Cikartma duzenle')) : (isEmoji ? txa('Emoji ekle') : txa('Cikartma ekle'))}</DialogTitle>
              <DialogDescription>
                {isEditMode
                  ? txa('Bu akista yalniz sunum duzenlenir. Kullanilmis eski yorumlar eski gorunumu korur.')
                  : txa('Ayni standart gorunum icin dosyayi konumlandir, yakinlastir ve dondur.')}
              </DialogDescription>
            </DialogHeader>

            <div className="flex min-h-0 flex-1 items-center justify-center bg-[linear-gradient(45deg,hsl(var(--muted)/0.55)_25%,transparent_25%,transparent_75%,hsl(var(--muted)/0.55)_75%),linear-gradient(45deg,hsl(var(--muted)/0.55)_25%,transparent_25%,transparent_75%,hsl(var(--muted)/0.55)_75%)] bg-[length:24px_24px] bg-[position:0_0,12px_12px] p-6">
              <div
                ref={viewportRef}
                className={cn(
                  'relative overflow-hidden border border-white/70 bg-background shadow-[0_28px_80px_-48px_rgba(15,23,42,0.55)]',
                  isEmoji ? 'h-[264px] w-[264px] rounded-[32px]' : 'h-[300px] w-[300px] rounded-[36px]',
                  previewUrl ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
                )}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                onPointerCancel={handlePointerEnd}
              >
                {previewUrl ? (
                  <>
                    <img
                      src={previewUrl}
                      alt={normalizedLabel || DEFAULT_LABELS[kind]}
                      className="absolute inset-0 h-full w-full select-none"
                      style={viewportStyle}
                      draggable={false}
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/70 to-transparent px-3 py-2 text-center text-[11px] text-muted-foreground">
                      {txa('Yeniden konumlandirmak icin surukle')}
                    </div>
                  </>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                    <ImagePlus className="h-7 w-7 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">{txa('Dosya sec')}</p>
                    <p className="text-xs text-muted-foreground">{txa('PNG, JPG, WEBP veya GIF')}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-border/60 px-5 py-4">
              <div className="flex flex-wrap items-center gap-3 rounded-full border border-border/70 bg-card/96 px-3 py-2.5">
                {!isEditMode ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="rounded-full"
                    onClick={openFilePicker}
                    title={txa('Dosya sec')}
                  >
                    <ImagePlus className="size-4" />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="rounded-full"
                  disabled={!previewUrl}
                  onClick={() => setPresentation((prev) => normalizeFansubSupporterAssetPresentation({
                    ...prev,
                    rotation: prev.rotation - FANSUB_SUPPORTER_ASSET_ROTATION_STEP,
                  }, kind))}
                  title={txa('Sola dondur')}
                >
                  <RotateCcw className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="rounded-full"
                  disabled={!previewUrl}
                  onClick={() => setPresentation((prev) => normalizeFansubSupporterAssetPresentation({
                    ...prev,
                    rotation: prev.rotation + FANSUB_SUPPORTER_ASSET_ROTATION_STEP,
                  }, kind))}
                  title={txa('Saga dondur')}
                >
                  <RotateCw className="size-4" />
                </Button>
                <ZoomOut className="size-4 text-muted-foreground" />
                <input
                  type="range"
                  min={FANSUB_SUPPORTER_ASSET_MIN_SCALE}
                  max={FANSUB_SUPPORTER_ASSET_MAX_SCALE}
                  step={0.05}
                  value={presentation.scale}
                  disabled={!previewUrl}
                  className="h-2 min-w-[200px] flex-1 accent-primary"
                  onChange={(event) => setPresentation((prev) => normalizeFansubSupporterAssetPresentation({
                    ...prev,
                    scale: Number(event.target.value),
                  }, kind))}
                />
                <ZoomIn className="size-4 text-muted-foreground" />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-full px-3 text-xs"
                  disabled={!previewUrl}
                  onClick={() => setPresentation(normalizeFansubSupporterAssetPresentation(
                    isEditMode && asset ? asset.presentation : null,
                    kind,
                  ))}
                >
                  {txa('Sifirla')}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-col bg-card/60">
            <div className="space-y-5 px-5 py-5">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{txa('On izleme')}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-border/70 bg-background/80 p-3">
                    <div className="flex h-20 items-center justify-center">
                      <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-border/60 bg-muted/15">
                        {previewUrl ? (
                          <img
                            src={previewUrl}
                            alt={normalizedLabel || DEFAULT_LABELS[kind]}
                            className="absolute inset-0 h-full w-full"
                            style={viewportStyle}
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/80 p-3">
                    <div className="flex h-20 items-center justify-center">
                      <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-border/60 bg-muted/15">
                        {previewUrl ? (
                          <img
                            src={previewUrl}
                            alt={normalizedLabel || DEFAULT_LABELS[kind]}
                            className="absolute inset-0 h-full w-full"
                            style={viewportStyle}
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="fansub-supporter-asset-label">{txa('Ad')}</Label>
                  <Input
                    id="fansub-supporter-asset-label"
                    value={label}
                    maxLength={FANSUB_SUPPORTER_ASSET_LABEL_MAX_LENGTH}
                    placeholder={DEFAULT_LABELS[kind]}
                    disabled={isEditMode}
                    onChange={(event) => setLabel(event.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {isEditMode
                      ? txa('Ad sabit kalir. Eski kullanimi bozmayacak sekilde yalniz sunum guncellenir.')
                      : txa('En fazla {v1} karakter.', { v1: FANSUB_SUPPORTER_ASSET_LABEL_MAX_LENGTH })}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="fansub-supporter-asset-shortcode">{txa('Kisa kod')}</Label>
                  <Input
                    id="fansub-supporter-asset-shortcode"
                    value={shortcode}
                    maxLength={FANSUB_SUPPORTER_ASSET_SHORTCODE_MAX_LENGTH}
                    placeholder={isEmoji ? txa('guc') : txa('destek')}
                    disabled={isEditMode}
                    onChange={(event) => setShortcode(normalizeFansubSupporterAssetShortcode(event.target.value))}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {isEditMode
                      ? txa('Kisa kod korunur. Yeni kullanimlar yeni revision tokeni ile ilerler.')
                      : txa('En fazla {v1} karakter.', { v1: FANSUB_SUPPORTER_ASSET_SHORTCODE_MAX_LENGTH })}
                  </p>
                </div>

                {!isEditMode ? (
                  <div className="space-y-2">
                    <Label>{txa('Dosya')}</Label>
                    <input
                      ref={inputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={(event) => {
                        const nextFile = event.target.files?.[0] || null
                        setFile(nextFile)
                        event.target.value = ''
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start rounded-2xl"
                      onClick={openFilePicker}
                      data-testid="fansub-supporter-asset-file-button"
                    >
                      <ImagePlus className="mr-2 size-4" />
                      {file?.name || txa('{v1} dosyasi sec', { v1: isEmoji ? txa('Emoji') : txa('Cikartma') })}
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-2.5 text-[11px] text-muted-foreground">
                    {txa('Bu modda gorsel dosyasi degismez. Dosya sabit kalir, yalniz kirpma ve yerlesim guncellenir.')}
                  </div>
                )}

                <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-background/80 px-3 py-2.5 text-xs text-muted-foreground">
                  <span>{txa('Yerlesim')}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 rounded-full px-3 text-xs"
                    onClick={() => setPresentation((prev) => normalizeFansubSupporterAssetPresentation({
                      ...prev,
                      fitMode: prev.fitMode === 'cover' ? 'contain' : 'cover',
                    }, kind))}
                  >
                    {presentation.fitMode === 'cover' ? txa('Doldur') : txa('Sigdir')}
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter className="border-t border-border/60 px-5 py-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                {txa('Vazgec')}
              </Button>
              <Button
                type="button"
                disabled={!canSubmit || submitting}
                onClick={() => {
                  onSubmit({
                    shortcode: normalizedShortcode,
                    label: normalizedLabel,
                    file: file || undefined,
                    presentation: normalizeFansubSupporterAssetPresentation(presentation, kind),
                  })
                }}
              >
                {submitting ? txa('Kaydediliyor...') : isEditMode ? txa('Duzenlemeyi kaydet') : txa('Tamamla')}
              </Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
