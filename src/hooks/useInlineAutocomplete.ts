/**
 * useInlineAutocomplete: @mention and #tag autocomplete hook for textareas.
 *
 * Extracted from the inline suggestion logic in CommunityCreateModal.
 * Used in both the post creation modal and comment/reply textareas.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
    extractInlineCommunityMeta,
    searchCommunityMentionFansubs,
    searchCommunityMentionMangas,
    searchCommunityMentionUsers,
} from '@/services/communityMentionService'
import { txa } from '@/i18n/activeLocale'

// ── Tipler ────────────────────────────────────────────────────────────────────

export type InlineSuggestionType = 'tag' | 'user' | 'fansub' | 'manga'

export interface InlineSuggestion {
    key: string
    type: InlineSuggestionType
    label: string
    secondaryText?: string
    insertText: string
    avatar?: string
}

export interface InlineSuggestionPosition {
    top: number
    left: number
}

interface InlineQueryState {
    trigger: '@' | '#'
    query: string
    start: number
    end: number
}

interface UseInlineAutocompleteOptions {
    /** Controlled text value */
    text: string
    /** Text update function */
    setText: (value: string) => void
    /** Tags in use (for # suggestions) */
    usedTags?: string[]
    /** Is the hook active? (to disable it when the modal is closed, etc.) */
    enabled?: boolean
}

export interface UseInlineAutocompleteReturn {
    /** Textarea ref, so the hook can read the caret position */
    textareaRef: React.RefObject<HTMLTextAreaElement>
    /** Current suggestions */
    suggestions: InlineSuggestion[]
    /** Active (highlighted) suggestion index */
    activeSuggestionIndex: number
    /** Popup position (relative to the textarea) */
    suggestionPosition: InlineSuggestionPosition | null
    /** Inline query aktif mi? */
    isQueryActive: boolean
    /** onChange handler, bound to the textarea's onChange */
    handleChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
    /** onClick handler, updates the query when the textarea is clicked */
    handleClick: (e: React.MouseEvent<HTMLTextAreaElement>) => void
    /** onKeyUp handler, updates the caret position after arrow keys */
    handleKeyUp: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
    /** onScroll handler, updates the popup position while scrolling */
    handleScroll: (e: React.UIEvent<HTMLTextAreaElement>) => void
    /** onKeyDown handler — ArrowUp/Down/Enter/Tab/Escape yakalama */
    handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
    /** Apply a specific suggestion */
    applySuggestion: (suggestion: InlineSuggestion) => void
}

// ── Sabitler ──────────────────────────────────────────────────────────────────

const TAG_SUGGESTIONS = ['spoiler', 'teori', 'inceleme', 'karakter', 'cizim', 'kurgu']

// ── Helpers ─────────────────────────────────────────────────────

function dedupeStrings(items: string[]): string[] {
    return Array.from(new Set(items.filter(Boolean)))
}

function normalizeInlineMentionHandle(raw: string): string {
    return raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
}

function parseInlineMangaChapterQuery(raw: string): { mangaSlug: string; chapterNumber: number } | null {
    const normalized = normalizeInlineMentionHandle(raw)
    const match = /^(.+)-([1-9][0-9]{0,3})$/.exec(normalized)
    if (!match) return null

    const chapterNumber = Number.parseInt(match[2], 10)
    if (!Number.isInteger(chapterNumber) || chapterNumber < 1 || chapterNumber > 5000) return null

    const mangaSlug = normalizeInlineMentionHandle(match[1] || '')
    if (!mangaSlug) return null

    return { mangaSlug, chapterNumber }
}

/** Detects the @/# query at the caret position */
function findInlineQuery(text: string, caretPosition: number): InlineQueryState | null {
    const safeCaret = Math.max(0, Math.min(caretPosition, text.length))
    const beforeCaret = text.slice(0, safeCaret)
    const match = /(^|[\s([{\n])([@#])([^\s@#]{0,80})$/.exec(beforeCaret)
    if (!match) return null

    const trigger = match[2] as '@' | '#'
    const query = (match[3] || '').trim()
    const start = safeCaret - query.length - 1
    if (start < 0) return null

    return { trigger, query, start, end: safeCaret }
}

/** Calculates the pixel coordinates of the caret in the textarea */
function getTextareaCaretCoordinates(textarea: HTMLTextAreaElement, position: number) {
    const div = document.createElement('div')
    const style = window.getComputedStyle(textarea)
    const properties = [
        'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
        'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
        'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch',
        'fontSize', 'lineHeight', 'fontFamily', 'textAlign',
        'textTransform', 'textIndent', 'textDecoration',
        'letterSpacing', 'wordSpacing', 'tabSize', 'MozTabSize',
        'whiteSpace', 'wordBreak',
    ] as const

    div.style.position = 'absolute'
    div.style.visibility = 'hidden'
    div.style.whiteSpace = 'pre-wrap'
    div.style.wordWrap = 'break-word'
    div.style.overflow = 'hidden'

    properties.forEach((prop) => {
        const value = style.getPropertyValue(prop)
        if (value) div.style.setProperty(prop, value)
    })

    div.textContent = textarea.value.substring(0, position)
    const span = document.createElement('span')
    span.textContent = textarea.value.substring(position) || '.'
    div.appendChild(span)
    document.body.appendChild(div)

    const top = span.offsetTop - textarea.scrollTop
    const left = span.offsetLeft - textarea.scrollLeft
    const lineHeight = Number.parseFloat(style.lineHeight) || 20

    document.body.removeChild(div)
    return { top, left, lineHeight }
}

/** Calculates the popup's position inside the textarea */
function getInlineSuggestionPosition(
    textarea: HTMLTextAreaElement,
    caretPosition: number,
): InlineSuggestionPosition {
    const coords = getTextareaCaretCoordinates(textarea, caretPosition)
    const estimatedMenuHeight = 240
    const menuWidth = 320
    const minLeft = 8
    const maxLeft = Math.max(minLeft, textarea.clientWidth - menuWidth)
    const left = Math.min(Math.max(coords.left + 6, minLeft), maxLeft)
    const topBelow = coords.top + coords.lineHeight + 6
    const maxBottom = textarea.clientHeight - 8
    const top = topBelow + estimatedMenuHeight <= maxBottom
        ? Math.max(8, topBelow)
        : Math.max(8, coords.top - estimatedMenuHeight - 6)

    return { top, left }
}

/** Builds # tag suggestions */
function buildTagSuggestions(query: string, usedTags: string[]): InlineSuggestion[] {
    const normalizedQuery = query.trim().toLocaleLowerCase('tr-TR')
    const source = dedupeStrings([...TAG_SUGGESTIONS, ...usedTags]).slice(0, 30)

    return source
        .filter((tag) => !normalizedQuery || tag.toLocaleLowerCase('tr-TR').includes(normalizedQuery))
        .slice(0, 8)
        .map((tag) => ({
            key: `tag-${tag}`,
            type: 'tag' as const,
            label: `#${tag}`,
            secondaryText: txa('Etiket'),
            insertText: `#${tag}`,
        }))
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useInlineAutocomplete({
    text,
    setText,
    usedTags = [],
    enabled = true,
}: UseInlineAutocompleteOptions): UseInlineAutocompleteReturn {
    const textareaRef = useRef<HTMLTextAreaElement>(null!)
    const mentionSearchRequestRef = useRef(0)

    const [inlineQuery, setInlineQuery] = useState<InlineQueryState | null>(null)
    const [suggestions, setSuggestions] = useState<InlineSuggestion[]>([])
    const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0)
    const [suggestionPosition, setSuggestionPosition] = useState<InlineSuggestionPosition | null>(null)

    // @ mention arama — debounced
    useEffect(() => {
        if (!enabled || !inlineQuery || inlineQuery.trigger !== '@') return

        const currentRequest = ++mentionSearchRequestRef.current
        const query = inlineQuery.query

        const timer = window.setTimeout(async () => {
            try {
                const [users, fansubs, mangas] = await Promise.all([
                    searchCommunityMentionUsers(query, 6),
                    searchCommunityMentionFansubs(query, 6),
                    searchCommunityMentionMangas(query, 6),
                ])

                if (mentionSearchRequestRef.current !== currentRequest) return

                const userSuggestions: InlineSuggestion[] = users.map((user) => ({
                    key: `user-${user.id}`,
                    type: 'user',
                    label: user.displayName?.trim() || user.username,
                    secondaryText: txa('Kullanıcı · @{v1}', { v1: user.username }),
                    insertText: `@${user.username}`,
                    avatar: user.avatar,
                }))

                const fansubSuggestions: InlineSuggestion[] = fansubs.map((fansub) => ({
                    key: `fansub-${fansub.id}`,
                    type: 'fansub',
                    label: fansub.name,
                    secondaryText: txa('Fansub — @{v1}', { v1: fansub.slug }),
                    insertText: `@${fansub.slug}`,
                    avatar: fansub.avatar,
                }))

                const mangaSuggestions: InlineSuggestion[] = mangas.map((manga) => ({
                    key: `manga-${manga.id}`,
                    type: 'manga',
                    label: manga.title,
                    secondaryText: txa('Manga — @{v1}', { v1: manga.slug }),
                    insertText: `@${manga.slug}`,
                    avatar: manga.coverImage,
                }))

                const chapterQuery = parseInlineMangaChapterQuery(query)
                const mangaChapterSuggestions: InlineSuggestion[] = chapterQuery
                    ? mangas
                        .filter((manga) => {
                            const slug = normalizeInlineMentionHandle(manga.slug)
                            return slug === chapterQuery.mangaSlug || slug.startsWith(chapterQuery.mangaSlug)
                        })
                        .slice(0, 3)
                        .map((manga) => ({
                            key: `manga-chapter-${manga.id}-${chapterQuery.chapterNumber}`,
                            type: 'manga' as const,
                            label: `${manga.title} — ${txa('{v1}. Bolum', { v1: chapterQuery.chapterNumber })}`,
                            secondaryText: `@${manga.slug}-${chapterQuery.chapterNumber}`,
                            insertText: `@${manga.slug}-${chapterQuery.chapterNumber}`,
                            avatar: manga.coverImage,
                        }))
                    : []

                setSuggestions(
                    [...mangaChapterSuggestions, ...userSuggestions, ...fansubSuggestions, ...mangaSuggestions].slice(0, 12),
                )
                setActiveSuggestionIndex(0)
            } catch (error) {
                console.error('[useInlineAutocomplete] mention search error', error)
                if (mentionSearchRequestRef.current === currentRequest) {
                    setSuggestions([])
                }
            }
        }, 180)

        return () => { window.clearTimeout(timer) }
    }, [enabled, inlineQuery])

    // Clear state if there is no query
    const resetState = useCallback(() => {
        setInlineQuery(null)
        setSuggestions([])
        setActiveSuggestionIndex(0)
        setSuggestionPosition(null)
    }, [])

    /** Updates the inline query at the caret position */
    const refreshInlineQuery = useCallback((
        nextText: string,
        caretPosition: number,
        textarea?: HTMLTextAreaElement | null,
    ) => {
        const detected = findInlineQuery(nextText, caretPosition)
        setInlineQuery(detected)
        setActiveSuggestionIndex(0)

        if (!detected) {
            setSuggestions([])
            setSuggestionPosition(null)
            return
        }

        const sourceTextarea = textarea || textareaRef.current
        if (sourceTextarea) {
            setSuggestionPosition(getInlineSuggestionPosition(sourceTextarea, caretPosition))
        } else {
            setSuggestionPosition(null)
        }

        // # tag suggestions are synchronous
        if (detected.trigger === '#') {
            const meta = extractInlineCommunityMeta(nextText)
            setSuggestions(buildTagSuggestions(detected.query, [...(usedTags || []), ...meta.tags]))
            return
        }

        // @ mention suggestions are async, managed by useEffect
        setSuggestions([])
    }, [usedTags])

    /** Applies the selected suggestion to the text */
    const applySuggestion = useCallback((suggestion: InlineSuggestion) => {
        if (!inlineQuery) return

        const before = text.slice(0, inlineQuery.start)
        const after = text.slice(inlineQuery.end)
        const replacement = `${suggestion.insertText} `
        const nextText = `${before}${replacement}${after}`
        const nextCaret = before.length + replacement.length

        setText(nextText)
        resetState()

        // Move the caret to the right position
        window.setTimeout(() => {
            if (!textareaRef.current) return
            textareaRef.current.focus()
            textareaRef.current.setSelectionRange(nextCaret, nextCaret)
        }, 0)
    }, [inlineQuery, text, setText, resetState])

    // ── Event Handlers ────────────────────────────────────────────────────────

    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const nextValue = e.target.value
        setText(nextValue)
        refreshInlineQuery(nextValue, e.target.selectionStart || 0, e.target)
    }, [setText, refreshInlineQuery])

    const handleClick = useCallback((e: React.MouseEvent<HTMLTextAreaElement>) => {
        refreshInlineQuery(
            e.currentTarget.value,
            e.currentTarget.selectionStart || 0,
            e.currentTarget,
        )
    }, [refreshInlineQuery])

    const handleKeyUp = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        refreshInlineQuery(
            e.currentTarget.value,
            e.currentTarget.selectionStart || 0,
            e.currentTarget,
        )
    }, [refreshInlineQuery])

    const handleScroll = useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
        if (!inlineQuery) return
        refreshInlineQuery(
            e.currentTarget.value,
            (e.currentTarget as HTMLTextAreaElement).selectionStart || 0,
            e.currentTarget as HTMLTextAreaElement,
        )
    }, [inlineQuery, refreshInlineQuery])

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (!inlineQuery || suggestions.length === 0) return

        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActiveSuggestionIndex((prev) => (prev + 1) % suggestions.length)
            return
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActiveSuggestionIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length)
            return
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault()
            const selected = suggestions[activeSuggestionIndex] || suggestions[0]
            if (selected) applySuggestion(selected)
            return
        }
        if (e.key === 'Escape') {
            e.preventDefault()
            resetState()
        }
    }, [inlineQuery, suggestions, activeSuggestionIndex, applySuggestion, resetState])

    return {
        textareaRef,
        suggestions,
        activeSuggestionIndex,
        suggestionPosition,
        isQueryActive: Boolean(inlineQuery && suggestions.length > 0 && suggestionPosition),
        handleChange,
        handleClick,
        handleKeyUp,
        handleScroll,
        handleKeyDown,
        applySuggestion,
    }
}
