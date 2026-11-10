import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  FANSUB_SUPPORTER_ASSET_TOKEN_PATTERN_SOURCE,
  getFansubSupporterAssetTokenRegex,
  parseFansubSupporterAssetToken,
} from '@/lib/fansubSupporterAssetTokens'
import { cn } from '@/lib/utils'
import {
  getPublicFansubSupporterAssetRenderCatalog,
  type FansubSupporterAssetCatalogItem,
  type FansubSupporterAssetRenderCatalogItem,
} from '@/services/fansubSupporterAssetService'
import { isAbortLikeError } from '@/services/apiResilience'
import FansubSupporterAssetMedia from './FansubSupporterAssetMedia'

interface CommunityExpressionTextareaPreviewProps {
  text: string
  supporterAssets?: FansubSupporterAssetCatalogItem[]
  className?: string
  caretIndex?: number | null
  /** `||...||` spoiler bolgelerini golgeli goster (varsayilan true). */
  highlightSpoilers?: boolean
}

function buildCatalogKey(assetKind: 'emoji' | 'sticker', shortcode: string) {
  return `${assetKind}:${shortcode}`
}

export function hasCommunityExpressionPreviewTokens(text: string) {
  return getFansubSupporterAssetTokenRegex().test(text)
}

export function CommunityExpressionTextareaPreview({
  text,
  supporterAssets = [],
  className,
  caretIndex = null,
  highlightSpoilers = true,
}: CommunityExpressionTextareaPreviewProps) {
  const supporterAssetByKey = useMemo(() => {
    const map = new Map<string, FansubSupporterAssetCatalogItem>()
    supporterAssets.forEach((asset) => {
      map.set(buildCatalogKey(asset.assetKind, asset.shortcode), asset)
    })
    return map
  }, [supporterAssets])

  const [resolvedRevisionAssets, setResolvedRevisionAssets] = useState<Record<string, FansubSupporterAssetRenderCatalogItem>>({})

  const unresolvedSupporterRevisionIds = useMemo(() => (
    Array.from(
      new Set(
        (text.match(getFansubSupporterAssetTokenRegex()) || [])
          .map((token) => parseFansubSupporterAssetToken(token))
          .filter((token): token is NonNullable<ReturnType<typeof parseFansubSupporterAssetToken>> => token !== null)
          .filter((token) => {
            if (!token.revisionId) return false
            if (resolvedRevisionAssets[token.revisionId]) return false
            return !supporterAssetByKey.has(buildCatalogKey(token.kind, token.shortcode))
          })
          .map((token) => token.revisionId)
          .filter((revisionId): revisionId is string => typeof revisionId === 'string' && revisionId.length > 0),
      ),
    )
  ), [resolvedRevisionAssets, supporterAssetByKey, text])

  useEffect(() => {
    if (unresolvedSupporterRevisionIds.length === 0) return

    let alive = true

    void getPublicFansubSupporterAssetRenderCatalog(unresolvedSupporterRevisionIds)
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
  }, [unresolvedSupporterRevisionIds])

  const tokenRegex = useMemo(
    () => new RegExp(
      `(${FANSUB_SUPPORTER_ASSET_TOKEN_PATTERN_SOURCE}${highlightSpoilers ? '|\\|\\|[\\s\\S]+?\\|\\|' : ''})`,
      'gi',
    ),
    [highlightSpoilers],
  )
  const tokens = useMemo(() => text.split(tokenRegex), [text, tokenRegex])
  let renderedCaret = false
  let textOffset = 0

  const renderCaret = (key: string) => (
    <span
      key={key}
      className="mx-px inline-block h-[1.1em] w-px translate-y-[2px] animate-pulse bg-foreground/85 align-middle"
    />
  )

  return (
    <div
      aria-hidden="true"
      className={cn('min-h-full whitespace-pre-wrap break-all [overflow-wrap:anywhere] text-foreground', className)}
    >
      {tokens.map((token, index) => {
        if (!token) return null
        const start = textOffset
        const end = start + token.length
        textOffset = end

        const supporterAssetToken = parseFansubSupporterAssetToken(token)
        if (!supporterAssetToken) {
          const isSpoilerRun = highlightSpoilers
            && token.length >= 4
            && token.startsWith('||')
            && token.endsWith('||')

          // If the caret is inside this piece, split while keeping the same characters.
          const caretHere = typeof caretIndex === 'number' && !renderedCaret && caretIndex >= start && caretIndex <= end
          let content: ReactNode = token
          if (caretHere) {
            const splitAt = Math.max(0, Math.min(token.length, caretIndex - start))
            renderedCaret = true
            content = (
              <>
                {token.slice(0, splitAt)}
                {renderCaret(`composer-caret-${index}`)}
                {token.slice(splitAt)}
              </>
            )
          }

          if (isSpoilerRun) {
            // Sadece arka plan/renk; genislik degismez -> caret/secim hizasi korunur.
            return (
              <span
                key={`composer-token-${index}`}
                className="rounded-[3px] bg-amber-500/25 text-amber-900 dark:bg-amber-400/20 dark:text-amber-100"
              >
                {content}
              </span>
            )
          }

          return <Fragment key={`composer-token-${index}`}>{content}</Fragment>
        }

        const nodes: ReactNode[] = []
        if (typeof caretIndex === 'number' && !renderedCaret && caretIndex <= start) {
          nodes.push(renderCaret(`composer-caret-before-${index}`))
          renderedCaret = true
        }

        const supporterAsset = supporterAssetToken.revisionId
          ? (
            resolvedRevisionAssets[supporterAssetToken.revisionId]
            || supporterAssetByKey.get(buildCatalogKey(supporterAssetToken.kind, supporterAssetToken.shortcode))
          )
          : supporterAssetByKey.get(buildCatalogKey(supporterAssetToken.kind, supporterAssetToken.shortcode))

        if (!supporterAsset) {
          if (!supporterAssetToken.revisionId) {
            nodes.push(<Fragment key={`composer-token-${index}`}>{token}</Fragment>)
            return <Fragment key={`composer-fragment-${index}`}>{nodes}</Fragment>
          }

          nodes.push(
            supporterAssetToken.kind === 'emoji' ? (
              <span
                key={`composer-token-${index}`}
                className="mx-[1px] inline-flex h-5 w-5 translate-y-[2px] items-center justify-center rounded-md bg-muted/30 align-middle"
              />
            ) : (
              <span
                key={`composer-token-${index}`}
                className="mx-1 my-0.5 inline-flex h-10 w-10 rounded-xl bg-muted/30 align-middle"
              />
            ),
          )
          if (typeof caretIndex === 'number' && !renderedCaret && caretIndex > start && caretIndex <= end) {
            nodes.push(renderCaret(`composer-caret-after-${index}`))
            renderedCaret = true
          }
          return <Fragment key={`composer-fragment-${index}`}>{nodes}</Fragment>
        }

        if (supporterAssetToken.kind === 'emoji') {
          nodes.push(
            <span
              key={`composer-token-${index}`}
              className="mx-[1px] inline-flex h-5 w-5 translate-y-[2px] items-center justify-center align-middle"
              title={supporterAsset.label}
            >
              <FansubSupporterAssetMedia
                asset={supporterAsset}
                className="h-full w-full rounded-md bg-transparent"
                imageClassName="object-cover"
              />
            </span>
          )
          if (typeof caretIndex === 'number' && !renderedCaret && caretIndex > start && caretIndex <= end) {
            nodes.push(renderCaret(`composer-caret-after-${index}`))
            renderedCaret = true
          }
          return <Fragment key={`composer-fragment-${index}`}>{nodes}</Fragment>
        }

        nodes.push(
          <span
            key={`composer-token-${index}`}
            className="mx-1 my-0.5 inline-flex h-10 w-10 align-middle"
            title={supporterAsset.label}
          >
            <FansubSupporterAssetMedia
              asset={supporterAsset}
              className="h-full w-full rounded-xl border border-border/60 bg-transparent"
              imageClassName="object-contain"
            />
          </span>
        )
        if (typeof caretIndex === 'number' && !renderedCaret && caretIndex > start && caretIndex <= end) {
          nodes.push(renderCaret(`composer-caret-after-${index}`))
          renderedCaret = true
        }
        return <Fragment key={`composer-fragment-${index}`}>{nodes}</Fragment>
      })}
      {typeof caretIndex === 'number' && !renderedCaret ? renderCaret('composer-caret-end') : null}
    </div>
  )
}

export default CommunityExpressionTextareaPreview
