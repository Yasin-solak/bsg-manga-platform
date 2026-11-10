/**
 * Order and gates of the chapter end sequence (pure function).
 *
 * In v1 the chapter end screen was a fixed bottom panel + scattered conditions;
 * which block shows when was embedded in JSX and untestable.
 * Here the decision is in one place: which blocks, in what order, which support
 * actions.
 *
 * Reasons for the order:
 * 1. `notes`   : the fansub's note written FOR THIS chapter; the reader should see it
 * before leaving.
 * 2. `next`/`finale` : the primary action should be right on top (a binge reader continues
 * in one click), or a closing card if the series ended.
 * 3. `credit`  : where the effort is visible; right after the action so a reader
 * who does not continue sees it too.
 * 4. `notify`  : follow + notification invite. The free ask comes BEFORE the paid ask:
 * first "follow", then "support".
 * 5. `support` : boost/donation, while the context is fresh.
 * 6. `comments`: at the bottom, full width (v1's fixed panel was removed).
 */

export type ReaderV2EndBlock = 'notes' | 'next' | 'finale' | 'credit' | 'notify' | 'support' | 'comments'

/** Platform seviyesi destek eylemleri (fansubun kendi CTA'sindan ayridir). */
export type ReaderV2SupportAction = 'takviye' | 'bagis'

export interface ReaderV2EndSequenceInput {
  hasNextChapter: boolean
  chapterNotes: string | null | undefined
  hasFansub: boolean
  /** Credit configuration resolved and capability on. */
  creditReady: boolean
  boostEnabled: boolean
  donationsEnabled: boolean
  commentsEnabled: boolean
  /** Takip/bildirim daveti karar motoru gorunur dedi mi. */
  showNotifyInvite: boolean
}

export interface ReaderV2EndSequencePlan {
  blocks: ReaderV2EndBlock[]
  supportActions: ReaderV2SupportAction[]
  /**
   * Do support actions sit INSIDE the closing credit?
   *
   * With a credit, a separate "support" card meant two stacked cards for the same team;
   * the user wanted them merged into one strip.
   * WITHOUT a credit (the fansub's credit permission off) its own card stays, so the support path
   * does not disappear.
   */
  supportInsideCredit: boolean
}

export function resolveReaderV2EndSequence(input: ReaderV2EndSequenceInput): ReaderV2EndSequencePlan {
  const {
    hasNextChapter,
    chapterNotes,
    hasFansub,
    creditReady,
    boostEnabled,
    donationsEnabled,
    commentsEnabled,
    showNotifyInvite,
  } = input

  // Support actions are tied to a fansub: on a chapter with no fansub it is unclear who to
  // support, so they are not shown.
  const supportActions: ReaderV2SupportAction[] = []
  if (hasFansub && boostEnabled) supportActions.push('takviye')
  if (hasFansub && donationsEnabled) supportActions.push('bagis')

  const supportInsideCredit = creditReady && supportActions.length > 0

  const blocks: ReaderV2EndBlock[] = []
  if (typeof chapterNotes === 'string' && chapterNotes.trim().length > 0) blocks.push('notes')
  blocks.push(hasNextChapter ? 'next' : 'finale')
  if (creditReady) blocks.push('credit')
  if (showNotifyInvite) blocks.push('notify')
  if (supportActions.length > 0 && !supportInsideCredit) blocks.push('support')
  if (commentsEnabled) blocks.push('comments')

  return { blocks, supportActions, supportInsideCredit }
}
