/**
 * Bottom sheet family: shared shell (BottomSheet), ⋯ action sheet and report sheet.
 *
 * Protected intent:
 * 1. ⋯ and report menus open a BOTTOM SHEET, not a DROPDOWN / CENTER BOX.
 * 2. The shell is in ONE place: if handle, title, Cancel and opening motion are written
 * separately for two surfaces, a tweak to one is forgotten on the other.
 * 3. Opening is FAST. The shared sheet used 500ms for the panel and 150ms for the
 * backdrop; the backdrop landed, the panel took 350ms more, and this read as
 * "dropping frames".
 * 4. An action CLOSES the sheet first, then opens its own surface.
 * 5. Report reasons do not go to the OS's `<select>` surface.
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const shell = read('src/components/common/BottomSheet.tsx')
const sheet = read('src/components/common/ActionSheet.tsx')
const reportSheet = read('src/components/common/ReportModal/ReportSheet.tsx')
const reportModal = read('src/components/common/ReportModal/ReportModal.tsx')
const topBar = read('src/pages/mangaDetail/MangaDetailTopBar.tsx')

// ---------- A) Kabuk: alt kenar, tutamak, cikis kapisi ----------
{
  assert.match(shell, /side="bottom"/, 'the sheet must come from the BOTTOM edge of the screen')
  assert.match(shell, /rounded-t-\[24px\]/)
  assert.match(shell, /data-testid="bottom-sheet-cancel"/, 'there must be an explicit exit')
  assert.match(
    shell,
    /showCloseButton=\{false\}/,
    'a full-width Cancel instead of a corner X; two close paths are confusing',
  )
  assert.match(
    shell,
    /mx-auto max-w-\[520px\]/,
    'a full-width strip looks out of place on wide screens; it must center and narrow',
  )
}

// ---------- B) Opening speed: panel and backdrop land TOGETHER ----------
{
  const openPanel = shell.match(/data-\[state=open\]:duration-\[(\d+)ms\]/)
  assert.ok(openPanel, 'the panel open duration must be explicit')
  const panelMs = Number(openPanel[1])
  assert.ok(
    panelMs > 0 && panelMs <= 300,
    `panel acilisi 300ms'i asmamali (su an ${panelMs}ms); paylasilan sheet 500ms kullaniyordu`,
  )

  const overlayMs = Number(shell.match(/OVERLAY_MOTION[\s\S]{0,120}?data-\[state=open\]:duration-\[(\d+)ms\]/)[1])
  assert.ok(
    Math.abs(panelMs - overlayMs) <= 80,
    `overlay (${overlayMs}ms) and panel (${panelMs}ms) must descend together; a 500/150 split read like dropped frames`,
  )

  assert.match(
    shell,
    /data-\[state=open\]:ease-\[cubic-bezier\(0\.32,0\.72,0,1\)\]/,
    'a curve starting fast and settling soft; ease-in-out starts slow on entry',
  )
  assert.match(shell, /overlayClassName=\{OVERLAY_MOTION\}/, 'perde ayari gercekten baglanmali')

  /*
   * The shared sheet's OWN default was not changed: tuning other surfaces such as the mobile menu and shop
   * filters was their own decision.
   */
  const uiSheet = read('src/components/ui/sheet.tsx')
  assert.match(
    uiSheet,
    /data-\[state=open\]:duration-500/,
    'the shared sheet default must not change in this work',
  )
}

// ---------- C) Kabuk TEK yerde ----------
{
  assert.match(sheet, /import BottomSheet from '\.\/BottomSheet'/)
  assert.match(reportSheet, /import BottomSheet from '@\/components\/common\/BottomSheet'/)
  for (const [name, source] of [['ActionSheet', sheet], ['ReportSheet', reportSheet]]) {
    assert.doesNotMatch(
      source,
      /side="bottom"/,
      `${name} kendi sheet kabugunu kurmamali; BottomSheet'i kullanmali`,
    )
  }
}

// ---------- D) Close first, then run ----------
{
  const runBody = sheet.slice(sheet.indexOf('const runItem'), sheet.indexOf('return ('))
  const closeIndex = runBody.indexOf('setOpen(false)')
  const selectIndex = runBody.indexOf('item.onSelect()')
  assert.ok(closeIndex >= 0 && selectIndex >= 0, 'runItem must both close and run the action')
  assert.ok(
    closeIndex < selectIndex,
    'closing must come FIRST: if this sheet stays open while the report sheet opens, two layers stack',
  )
}

// ---------- E) Yikici eylem ayrisir, satirlar parmak boyunda ----------
{
  assert.match(
    sheet,
    /item\.destructive \? 'text-destructive' : 'text-primary'/,
    'the destructive action must be visually distinct from the others',
  )
  assert.match(
    sheet,
    /h-\[52px\] items-center gap-3 px-5/,
    'action rows must be tall enough for an easy thumb press',
  )
}

// ---------- F) Yuzeyler tekrar kullanilabilir ----------
{
  assert.match(sheet, /export interface ActionSheetItem/)
  assert.doesNotMatch(
    sheet,
    /from '@\/pages\//,
    'a shared surface must not import from a page module',
  )
  assert.doesNotMatch(
    sheet,
    /'(Seri|Bolum|Profil) islemleri'/,
    'the title must come from the caller; not embedded in the surface',
  )
  /*
   * NOTE: a version searching a boundary with `\b` was written here and a python heredoc escape
   * left a single backslash, putting a LITERAL BACKSPACE in the regex: the rule
   * matched nothing. A plain string is searched.
   */
  for (const prop of ['  title:', '  items:', '  trigger:']) {
    assert.ok(sheet.includes(prop), `${prop.trim()} must be passed from outside`)
  }
  const commonFiles = readdirSync(path.join(rootDir, 'src/components/common'))
  assert.ok(commonFiles.includes('ActionSheet.tsx'))
  assert.ok(commonFiles.includes('BottomSheet.tsx'))
}

// ---------- G) Report flow: sheet on mobile, reasons as ROWS ----------
{
  assert.match(reportModal, /if \(isMobile\) \{/, 'mobile must have a bottom sheet path')
  assert.match(reportModal, /<ReportSheet/)
  assert.match(
    reportModal,
    /const isMobile = useIsMobileViewport\(\)/,
    'surface choice must depend on viewport width',
  )
  assert.match(
    reportModal,
    /<Dialog/,
    'a dialog must be kept on wide screens; a bottom sheet looks out of place on desktop',
  )

  assert.match(
    reportSheet,
    /data-testid=\{`report-sheet-reason-\$\{option\.value\}`\}/,
    'reasons must be pressable cards',
  )
  assert.match(
    reportSheet,
    /\{option\.description\}/,
    'each reason must state what it MEANS; "Spoiler" alone was vague',
  )
  /*
   * NOTE: a multi-line regex was written here; a python heredoc escape put a REAL LINE BREAK
   * in place of an escape and the file stopped running.
   * The same family of bug appeared a third time in that session.
   * Do not write regex escapes inside a heredoc, search a plain string.
   */
  assert.ok(
    reportSheet.includes("'border-destructive bg-destructive/10'"),
    'the selected reason stands out in red as in the prototype',
  )
  assert.match(
    reportSheet,
    /const needsFreeText = reason === FREE_TEXT_REASON/,
    'free text must open ONLY when "Diger" is selected',
  )
  assert.match(
    reportSheet,
    /needsFreeText \? \(/,
    'serbest metin kosullu cizilmeli',
  )
  /*
   * The prototype says "The review team looks within 24 hours". We have NO such
   * commitment and do not make a promise we cannot keep.
   */
  assert.doesNotMatch(
    reportSheet,
    /\d+\s*saat icinde/,
    'no promise about review duration',
  )
  assert.doesNotMatch(
    reportSheet,
    /<select/,
    'on phones `<select>` opened a third operating system surface',
  )
  assert.match(reportSheet, /aria-pressed=\{selected\}/, 'secili sebep erisilebilir sekilde isaretlenmeli')
  assert.match(
    reportSheet,
    /if \(loading && !next\) return/,
    'the sheet must not close during submit; the user cannot know whether the report went through',
  )
}

// ---------- H) Series detail ⋯ uses this surface ----------
{
  assert.match(topBar, /<ActionSheet/, 'series detail ... must open a bottom sheet')
  assert.doesNotMatch(
    topBar,
    /DropdownMenu/,
    'the dropdown must not come back: on phones it opened in the top corner, out of finger reach',
  )
  assert.match(topBar, /title=\{txa\('Seri işlemleri'\)\}/)
  assert.match(topBar, /destructive: true/, 'the report row must be marked destructive')

  for (const id of ['copy', 'follow', 'rate', 'report']) {
    assert.match(topBar, new RegExp(`id: '${id}'`), `${id} satiri bulunmali`)
  }
  assert.match(
    topBar,
    /isFollowing \? txa\('Takibi bırak'\) : txa\('Takip et'\)/,
    'the follow row must be written from the current state; a fixed label gives wrong info',
  )
  assert.match(
    topBar,
    /userRating > 0 \? txa\('Puanını değiştir/,
    'if a rating was already given the row must say so',
  )
  assert.match(
    topBar,
    /if \(onReport\) \{/,
    'with the report flag off the row must not render at all (absent rather than a dead row)',
  )
}

// ---------- I) Yorum eylemleri DOKUNMATIKTE de ulasilabilir ----------
{
  const thread = read('src/components/common/CommentThread/CommentThread.tsx')
  /*
   * Buttons were `opacity-0 group-hover:opacity-100`. Touch devices have NO hover,
   * so reporting a comment was NEVER reachable on phones, looking deleted.
   * The `pointer-coarse` variant leaves the button visible on devices with no hover.
   */
  const hoverOnly = thread.match(/opacity-0[^'"]*group-hover\/comment:opacity-100(?![^'"]*pointer-coarse)/g) || []
  assert.equal(
    hoverOnly.length,
    0,
    `hover'a bagli ${hoverOnly.length} kontrol kaldi; dokunmatikte ulasilamaz olurlar`,
  )
  assert.match(
    thread,
    /data-testid=\{`comment-thread-report-\$\{c\.id\}`\}/,
    'the comment report button must still be there (not removed)',
  )
}

console.log('action-sheet-contract: OK')
