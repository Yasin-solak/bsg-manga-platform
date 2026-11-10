import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from '@/i18n/router'
import type { RelatedFansub, RelatedManga, RelatedUser, CommunityPostAuthorFansub } from '@types'
import {
  FANSUB_SUPPORTER_ASSET_TOKEN_PATTERN_SOURCE,
  getFansubSupporterAssetTokenRegex,
  parseFansubSupporterAssetToken,
} from '@/lib/fansubSupporterAssetTokens'
import { buildPublicChapterPath, buildPublicFansubPath, buildPublicMangaPath } from '@/lib/routes'
import {
  getPublicFansubSupporterAssetRenderCatalog,
  type FansubSupporterAssetCatalogItem,
  type FansubSupporterAssetRenderCatalogItem,
} from '@/services/fansubSupporterAssetService'
import { isAbortLikeError } from '@/services/apiResilience'
import FansubSupporterAssetMedia from '@/components/community/FansubSupporterAssetMedia'
import { hasInlineSpoilerSyntax, splitInlineSpoilerSegments } from '@/lib/inlineSpoilers'
import { FansubHoverCard, MangaHoverCard, UserHoverCard } from './UserHoverCard'
import { txa } from '@/i18n/activeLocale'

interface CommunityRichTextProps {
  text: string
  relatedFansubs?: RelatedFansub[]
  authorFansub?: CommunityPostAuthorFansub
  relatedManga?: RelatedManga
  chapterNumber?: number
  mentionedMangas?: RelatedManga[]
  mentionedUsers?: RelatedUser[]
  supporterAssets?: FansubSupporterAssetCatalogItem[]
  /** Mention user fallback link behavior (for an unresolved @user). */
  unknownMentionUserLinkMode?: 'community' | 'profile'
  /** Mention tokenlarinda hover kart acilsin mi? */
  enableUserMentionHover?: boolean
  /** Manga mention tokenlarinda hover kart acilsin mi? */
  enableMangaMentionHover?: boolean
  /** Mention hover karti trigger araligi (px). */
  mentionHoverSideOffset?: number
  enableSpoilers?: boolean
  className?: string
}

function InlineSpoilerText({ children }: { children: ReactNode }) {
  const [isRevealed, setIsRevealed] = useState(false)

  if (!isRevealed) {
    return (
      <button
        type="button"
        className="mx-0.5 inline-flex items-center rounded-md bg-foreground px-2 py-0.5 text-[11px] font-semibold text-background transition-opacity hover:opacity-85"
        onClick={() => setIsRevealed(true)}
        aria-expanded="false"
      >
        {txa('Spoileri göster')}
      </button>
    )
  }

  return (
    <span className="mx-0.5 inline align-baseline">
      <span className="rounded-md bg-muted px-1.5 py-0.5">
        {children}
      </span>
      <button
        type="button"
        className="ml-1 inline text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => setIsRevealed(false)}
        aria-expanded="true"
      >
        {txa('Gizle')}
      </button>
    </span>
  )
}

function normalizeHandle(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
}

function normalizeTag(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
}

function findMangaHandleWithChapter(
  normalizedHandle: string,
  mangaBySlug: Map<string, RelatedManga>,
): { manga: RelatedManga; chapterNumber: number } | null {
  const match = /^(.+)-([1-9][0-9]{0,3})$/.exec(normalizedHandle)
  if (!match) return null

  const chapterNumber = Number.parseInt(match[2], 10)
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1 || chapterNumber > 5000) return null

  const mangaSlug = normalizeHandle(match[1] || '')
  if (!mangaSlug) return null

  const manga = mangaBySlug.get(mangaSlug)
  if (!manga) return null

  return { manga, chapterNumber }
}

function CommunityRichText({
  text,
  relatedFansubs = [],
  authorFansub,
  relatedManga,
  chapterNumber,
  mentionedMangas = [],
  mentionedUsers = [],
  supporterAssets = [],
  unknownMentionUserLinkMode = 'community',
  enableUserMentionHover = false,
  enableMangaMentionHover = false,
  mentionHoverSideOffset = 8,
  enableSpoilers = false,
  className,
}: CommunityRichTextProps) {
  const fansubBySlug = useMemo(() => {
    const map = new Map<string, RelatedFansub>()
    if (authorFansub?.slug) {
      map.set(normalizeHandle(authorFansub.slug), {
        id: authorFansub.id,
        name: authorFansub.name,
        slug: authorFansub.slug,
      })
    }
    relatedFansubs.forEach((fansub) => {
      if (!fansub.slug) return
      map.set(normalizeHandle(fansub.slug), fansub)
    })
    return map
  }, [authorFansub, relatedFansubs])

  const userByUsername = useMemo(() => {
    const map = new Map<string, RelatedUser>()
    mentionedUsers.forEach((mentionedUser) => {
      map.set(normalizeHandle(mentionedUser.username), mentionedUser)
    })
    return map
  }, [mentionedUsers])

  const mangaBySlug = useMemo(() => {
    const map = new Map<string, RelatedManga>()
    if (relatedManga?.slug) {
      map.set(normalizeHandle(relatedManga.slug), relatedManga)
    }
    mentionedMangas.forEach((mentionedManga) => {
      if (!mentionedManga.slug) return
      map.set(normalizeHandle(mentionedManga.slug), mentionedManga)
    })
    return map
  }, [mentionedMangas, relatedManga])

  const supporterAssetByKey = useMemo(() => {
    const map = new Map<string, FansubSupporterAssetCatalogItem>()
    supporterAssets.forEach((asset) => {
      const key = `${asset.assetKind}:${asset.shortcode}`
      map.set(key, asset)
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
            return !supporterAssetByKey.has(`${token.kind}:${token.shortcode}`)
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

  const tokenRegex = useMemo(() => new RegExp(
    `(${FANSUB_SUPPORTER_ASSET_TOKEN_PATTERN_SOURCE}|@[a-zA-Z0-9_-]{2,80}|#[a-zA-Z0-9_-]{2,30})`,
    'gi',
  ), [])

  const spoilerSegments = useMemo(() => {
    if (!enableSpoilers || !hasInlineSpoilerSyntax(text)) {
      return [{ type: 'text' as const, value: text }]
    }

    return splitInlineSpoilerSegments(text)
  }, [enableSpoilers, text])

  const renderInlineTokens = (sourceText: string, keyPrefix: string) => {
    const tokens = sourceText.split(tokenRegex)

    return tokens.map((token, index) => {
      if (!token) return null
      const key = `${keyPrefix}-${index}`

      const supporterAssetToken = parseFansubSupporterAssetToken(token)
      if (supporterAssetToken) {
        const supporterAsset = supporterAssetToken.revisionId
          ? (
            resolvedRevisionAssets[supporterAssetToken.revisionId]
            || supporterAssetByKey.get(`${supporterAssetToken.kind}:${supporterAssetToken.shortcode}`)
          )
          : supporterAssetByKey.get(`${supporterAssetToken.kind}:${supporterAssetToken.shortcode}`)

        if (!supporterAsset) {
          if (supporterAssetToken.revisionId) {
            return (
              <span
                key={key}
                className={supporterAssetToken.kind === 'emoji'
                  ? 'inline-flex h-6 w-6 translate-y-[2px] items-center justify-center rounded-md bg-muted/25 align-middle'
                  : 'my-1 inline-flex h-[96px] w-[96px] rounded-2xl bg-muted/25 align-middle'}
              />
            )
          }
          return <Fragment key={key}>{token}</Fragment>
        }

        if (supporterAssetToken.kind === 'emoji') {
          return (
            <span
              key={key}
              className="inline-flex h-6 w-6 translate-y-[2px] items-center justify-center align-middle"
              title={supporterAsset.label}
            >
              <FansubSupporterAssetMedia
                asset={supporterAsset}
                className="h-full w-full rounded-md bg-transparent"
                imageClassName="object-cover"
              />
            </span>
          )
        }

        return (
          <span
            key={key}
            className="my-1 inline-flex max-w-[144px] align-middle"
            title={supporterAsset.label}
          >
            <FansubSupporterAssetMedia
              asset={supporterAsset}
              className="h-[96px] w-[96px] rounded-2xl border border-border/70 bg-transparent"
              imageClassName="object-contain"
            />
          </span>
        )
      }

      if (token.startsWith('#')) {
        const normalizedTag = normalizeTag(token.slice(1))
        if (!normalizedTag) {
          return <Fragment key={key}>{token}</Fragment>
        }
        return (
          <Link
            key={key}
            to={`/topluluk?tag=${encodeURIComponent(normalizedTag)}`}
            className="font-semibold text-[#8e24aa] no-underline transition-colors hover:underline"
          >
            #{normalizedTag}
          </Link>
        )
      }

      if (token.startsWith('@')) {
        const normalizedHandle = normalizeHandle(token.slice(1))
        if (!normalizedHandle) {
          return <Fragment key={key}>{token}</Fragment>
        }

        const mentionedUser = userByUsername.get(normalizedHandle)
        if (mentionedUser) {
          const mentionUsername = mentionedUser.username
          const mentionAvatar = mentionedUser.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${mentionUsername}`
          const mentionLink = (
            <Link
              key={key}
              to={`/profil/${encodeURIComponent(mentionUsername)}`}
              className="font-semibold text-[#1565c0] no-underline transition-colors hover:underline"
            >
              @{mentionUsername}
            </Link>
          )

          if (!enableUserMentionHover) {
            return mentionLink
          }

          return (
            <UserHoverCard
              key={key}
              id={mentionedUser.id}
              username={mentionUsername}
              displayName={mentionedUser.displayName}
              avatar={mentionAvatar}
              bio={mentionedUser.bio}
              followerCount={mentionedUser.followerCount}
              frameType={mentionedUser.frameType}
              primaryColor={mentionedUser.primaryColor}
              secondaryColor={mentionedUser.secondaryColor}
              profileBackgroundStyle={mentionedUser.profileBackgroundStyle}
              profileBackgroundVideoUrl={mentionedUser.profileBackgroundVideoUrl}
              profilePatternStyle={mentionedUser.profilePatternStyle}
              sideOffset={mentionHoverSideOffset}
              className="inline-block"
            >
              {mentionLink}
            </UserHoverCard>
          )
        }

        const mentionedFansub = fansubBySlug.get(normalizedHandle)
        if (mentionedFansub) {
          const fansubMentionHref = buildPublicFansubPath({
            id: mentionedFansub.id,
            slug: mentionedFansub.slug,
          })
          const fansubMentionLink = (
            <Link
              key={key}
              to={fansubMentionHref}
              className="font-semibold text-[#c62828] no-underline transition-colors hover:underline"
            >
              @{mentionedFansub.slug || normalizedHandle}
            </Link>
          )

          if (!enableUserMentionHover) {
            return fansubMentionLink
          }

          return (
            <FansubHoverCard
              key={key}
              id={mentionedFansub.id}
              slug={mentionedFansub.slug}
              name={mentionedFansub.name}
              avatar={mentionedFansub.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${mentionedFansub.slug || mentionedFansub.id}`}
              description={mentionedFansub.description}
              mangaCount={mentionedFansub.mangaCount}
              followerCount={mentionedFansub.followerCount}
              frameType={mentionedFansub.frameType}
              primaryColor={mentionedFansub.primaryColor}
              secondaryColor={mentionedFansub.secondaryColor}
              profileBackgroundStyle={mentionedFansub.profileBackgroundStyle}
              profileBackgroundVideoUrl={mentionedFansub.profileBackgroundVideoUrl}
              profilePatternStyle={mentionedFansub.profilePatternStyle}
              sideOffset={mentionHoverSideOffset}
              className="inline-block"
            >
              {fansubMentionLink}
            </FansubHoverCard>
          )
        }

        const mentionedManga = mangaBySlug.get(normalizedHandle)
        if (mentionedManga) {
          const isRelatedSelectedManga = Boolean(relatedManga && mentionedManga.id === relatedManga.id)
          const chapterPath = isRelatedSelectedManga && chapterNumber != null
            ? buildPublicChapterPath({
              mangaId: mentionedManga.id,
              mangaSlug: mentionedManga.slug,
              mangaTitle: mentionedManga.title,
              chapterNumber,
            })
            : buildPublicMangaPath({ id: mentionedManga.id, slug: mentionedManga.slug, title: mentionedManga.title })

          const mangaMentionLink = (
            <Link
              key={key}
              to={chapterPath}
              className="font-semibold text-[#2e7d32] no-underline transition-colors hover:underline"
            >
              @{mentionedManga.slug || normalizedHandle}
            </Link>
          )

          if (!enableMangaMentionHover) {
            return mangaMentionLink
          }

          return (
            <MangaHoverCard
              key={key}
              id={mentionedManga.id}
              slug={mentionedManga.slug}
              title={mentionedManga.title}
              coverImage={mentionedManga.coverImage}
              sideOffset={mentionHoverSideOffset}
              className="inline-block"
            >
              {mangaMentionLink}
            </MangaHoverCard>
          )
        }

        const mangaMentionWithChapter = findMangaHandleWithChapter(normalizedHandle, mangaBySlug)
        if (mangaMentionWithChapter) {
          const mangaWithChapterLink = (
            <Link
              key={key}
              to={buildPublicChapterPath({
                mangaId: mangaMentionWithChapter.manga.id,
                mangaSlug: mangaMentionWithChapter.manga.slug,
                mangaTitle: mangaMentionWithChapter.manga.title,
                chapterNumber: mangaMentionWithChapter.chapterNumber,
              })}
              className="font-semibold text-[#2e7d32] no-underline transition-colors hover:underline"
            >
              {token}
            </Link>
          )

          if (!enableMangaMentionHover) {
            return mangaWithChapterLink
          }

          return (
            <MangaHoverCard
              key={key}
              id={mangaMentionWithChapter.manga.id}
              slug={mangaMentionWithChapter.manga.slug}
              title={mangaMentionWithChapter.manga.title}
              coverImage={mangaMentionWithChapter.manga.coverImage}
              sideOffset={mentionHoverSideOffset}
              className="inline-block"
            >
              {mangaWithChapterLink}
            </MangaHoverCard>
          )
        }

        const fallbackMentionLink = (
          <Link
            key={key}
            to={
              unknownMentionUserLinkMode === 'profile'
                ? `/profil/${encodeURIComponent(normalizedHandle)}`
                : `/topluluk?mention=${encodeURIComponent(normalizedHandle)}`
            }
            className="font-semibold text-[#1565c0] no-underline transition-colors hover:underline"
          >
            @{normalizedHandle}
          </Link>
        )

        if (!enableUserMentionHover || unknownMentionUserLinkMode !== 'profile') {
          return fallbackMentionLink
        }

        return (
          <UserHoverCard
            key={key}
            username={normalizedHandle}
            avatar={`https://api.dicebear.com/7.x/avataaars/svg?seed=${normalizedHandle}`}
            sideOffset={mentionHoverSideOffset}
            className="inline-block"
          >
            {fallbackMentionLink}
          </UserHoverCard>
        )
      }

      return <Fragment key={key}>{token}</Fragment>
    })
  }

  return (
    <span className={className}>
      {spoilerSegments.map((segment, index) => {
        const key = `segment-${index}`
        if (segment.type === 'spoiler') {
          return (
            <InlineSpoilerText key={key}>
              {renderInlineTokens(segment.value, `${key}-content`)}
            </InlineSpoilerText>
          )
        }

        return <Fragment key={key}>{renderInlineTokens(segment.value, key)}</Fragment>
      })}
    </span>
  )
}

export default CommunityRichText
