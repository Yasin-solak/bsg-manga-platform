import { Fragment, useEffect, useMemo, useState } from 'react'
import FansubSupporterAssetMedia from '@/components/community/FansubSupporterAssetMedia'
import {
  FANSUB_SUPPORTER_ASSET_TOKEN_PATTERN_SOURCE,
  getFansubSupporterAssetTokenRegex,
  parseFansubSupporterAssetToken,
} from '@/lib/fansubSupporterAssetTokens'
import { cn } from '@/lib/utils'
import {
  getPublicFansubSupporterAssetRenderCatalog,
  type FansubSupporterAssetRenderCatalogItem,
} from '@/services/fansubSupporterAssetService'
import { isAbortLikeError } from '@/services/apiResilience'
import { txa } from '@/i18n/activeLocale'

interface AdminCommentBodyPreviewProps {
  text: string
  className?: string
  size?: 'compact' | 'comfortable'
}

export function AdminCommentBodyPreview({
  text,
  className,
  size = 'compact',
}: AdminCommentBodyPreviewProps) {
  const [resolvedRevisionAssets, setResolvedRevisionAssets] = useState<Record<string, FansubSupporterAssetRenderCatalogItem>>({})

  // In places like titles the text may be cut in the middle of a token (e.g. a body
  // preview "...") -> hide an unclosed/partial supporter token tail rather than showing raw
  // code; complete tokens are unaffected.
  const cleanText = useMemo(() => (
    text
      .replace(/(?::fse_|\[\[fss_)[^\s:[\]]*\.{3}\s*$/i, '')
      .replace(/\[\[fss_[^\s[\]]*$/i, '')
      .replace(/:fse_[^\s:]*$/i, '')
      .replace(/\s+$/, '')
  ), [text])

  const unresolvedRevisionIds = useMemo(() => (
    Array.from(
      new Set(
        (cleanText.match(getFansubSupporterAssetTokenRegex()) || [])
          .map((token) => parseFansubSupporterAssetToken(token))
          .filter((token): token is NonNullable<ReturnType<typeof parseFansubSupporterAssetToken>> => token !== null)
          .map((token) => token.revisionId)
          .filter((revisionId): revisionId is string => typeof revisionId === 'string' && revisionId.length > 0)
          .filter((revisionId) => !resolvedRevisionAssets[revisionId]),
      ),
    )
  ), [resolvedRevisionAssets, cleanText])

  useEffect(() => {
    if (unresolvedRevisionIds.length === 0) return

    let alive = true

    void getPublicFansubSupporterAssetRenderCatalog(unresolvedRevisionIds)
      .then((items) => {
        if (!alive || items.length === 0) return
        setResolvedRevisionAssets((previous) => {
          const next = { ...previous }
          items.forEach((item) => {
            next[item.revisionId] = item
          })
          return next
        })
      })
      .catch((error) => {
        if (isAbortLikeError(error)) return
        if (!alive) return
      })

    return () => {
      alive = false
    }
  }, [unresolvedRevisionIds])

  // The admin preview uses the same tokenization as the public comment renderer;
  // otherwise sticker-only comments vanish during the token split and the body looks empty.
  const tokenRegex = useMemo(
    () => new RegExp(`(${FANSUB_SUPPORTER_ASSET_TOKEN_PATTERN_SOURCE})`, 'gi'),
    [],
  )
  const tokens = useMemo(() => cleanText.split(tokenRegex), [cleanText, tokenRegex])
  const emojiClassName = size === 'comfortable' ? 'h-6 w-6 rounded-md' : 'h-5 w-5 rounded-md'
  const stickerClassName = size === 'comfortable' ? 'h-14 w-14 rounded-xl' : 'h-10 w-10 rounded-lg'
  const fallbackTokenClassName = size === 'comfortable'
    ? 'rounded-full px-2 py-0.5 text-[11px]'
    : 'rounded-full px-1.5 py-0.5 text-[10px]'

  return (
    <div className={cn('whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-foreground', className)}>
      {tokens.map((token, index) => {
        if (!token) return null

        const parsedToken = parseFansubSupporterAssetToken(token)
        if (!parsedToken) {
          return <Fragment key={`admin-comment-token-${index}`}>{token}</Fragment>
        }

        const asset = parsedToken.revisionId ? resolvedRevisionAssets[parsedToken.revisionId] : null
        if (!asset) {
          const fallbackLabel = parsedToken.kind === 'emoji'
            ? `:${parsedToken.shortcode}:`
            : `[${parsedToken.shortcode}]`

          if (!parsedToken.revisionId) {
            return (
              <span
                key={`admin-comment-token-${index}`}
                className={cn(
                  'mx-1 inline-flex items-center border border-border/70 bg-muted/35 font-medium text-muted-foreground align-middle',
                  fallbackTokenClassName,
                )}
              >
                {fallbackLabel}
              </span>
            )
          }

          return parsedToken.kind === 'emoji' ? (
            <span
              key={`admin-comment-token-${index}`}
              className={cn('mx-1 inline-flex items-center gap-1 align-middle text-muted-foreground', fallbackTokenClassName)}
              title={txa('{v1} revizyonu yuklenemedi', { v1: parsedToken.shortcode })}
            >
              <span className={cn('inline-flex items-center justify-center border border-dashed border-border/70 bg-muted/25', emojiClassName)} />
              <span>{fallbackLabel}</span>
            </span>
          ) : (
            <span
              key={`admin-comment-token-${index}`}
              className={cn('mx-1 inline-flex items-center gap-2 align-middle text-muted-foreground', fallbackTokenClassName)}
              title={txa('{v1} revizyonu yuklenemedi', { v1: parsedToken.shortcode })}
            >
              <span className={cn('inline-flex items-center justify-center border border-dashed border-border/70 bg-muted/25', stickerClassName)} />
              <span>{fallbackLabel}</span>
            </span>
          )
        }

        if (parsedToken.kind === 'emoji') {
          return (
            <span
              key={`admin-comment-token-${index}`}
              className={cn('mx-[1px] inline-flex translate-y-[2px] items-center justify-center align-middle', emojiClassName)}
              title={asset.label}
            >
              <FansubSupporterAssetMedia
                asset={asset}
                className="h-full w-full bg-transparent"
                imageClassName="object-cover"
              />
            </span>
          )
        }

        return (
          <span
            key={`admin-comment-token-${index}`}
            className={cn('mx-1 my-0.5 inline-flex items-center justify-center align-middle', stickerClassName)}
            title={asset.label}
          >
            <FansubSupporterAssetMedia
              asset={asset}
              className="h-full w-full border border-border/60 bg-transparent"
              imageClassName="object-contain"
            />
          </span>
        )
      })}
    </div>
  )
}

export default AdminCommentBodyPreview
