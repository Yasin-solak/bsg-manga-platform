/**
 * Series detail: mobile top bar takeover + touch targets.
 *
 * Protected intent:
 * 1. The page takes over the bar's CONTENT, it DOES NOT REMOVE the bar. Removing it broke
 * Layout's `100svh - 3.5rem` calculation and the footer went under the bottom bar on short pages
 * (measured before).
 * 2. The takeover has an OWNER: leaving the page returns the app bar.
 * 3. The report button's touch target on a chapter row is 44px. It used to be
 * 16x16: the finger either missed or hit the row's link and opened the
 * reader, which the user described as "the modal does not open".
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const context = read('src/components/layout/MobileTopBarOverrideContext.tsx')
const sidebar = read('src/components/layout/AppSidebar.tsx')
const layout = read('src/components/layout/Layout.tsx')
const topBar = read('src/pages/mangaDetail/MangaDetailTopBar.tsx')
const page = read('src/pages/MangaDetailPage.tsx')
const list = read('src/pages/mangaDetail/MangaDetailChapterList.tsx')
const hero = read('src/pages/mangaDetail/MangaDetailHeroCard.tsx')

// ---------- A) The bar stays IN FLOW, only its content changes ----------
{
  assert.match(
    sidebar,
    /className=\{cn\(\s*\n?\s*"sticky top-0 z-50 flex h-14/,
    'the mobile bar must stay sticky and h-14; the Layout height calc depends on it',
  )
  assert.match(
    sidebar,
    /mobileTopBarOverride \? mobileTopBarOverride\.content : \(/,
    'on a takeover the bar CONTENT must change',
  )
  assert.doesNotMatch(
    sidebar,
    /mobileTopBarOverride \? null/,
    'hiding the bar entirely is forbidden: the footer went under the bottom bar',
  )
  assert.match(layout, /<MobileTopBarOverrideProvider>/, 'the provider must be inside Layout')
}

// ---------- B) Devir SAHIPLI: cikista uygulama cubugu geri gelir ----------
{
  assert.match(
    context,
    /setOverride\(\(previous\) => \(previous\?\.ownerId === ownerId \? null : previous\)\)/,
    'cleanup must delete only ITS OWN record; otherwise it would delete the next page bar',
  )
  const cleanupCount = (context.match(/previous\?\.ownerId === ownerId/g) || []).length
  assert.equal(
    cleanupCount,
    2,
    'both the "no content" and "left" paths must have an owner check',
  )
}

// ---------- C) Cubuk prototipin dort ogesini tasir ----------
{
  assert.match(topBar, /data-testid="manga-detail-back"/)
  assert.match(topBar, /data-testid="manga-detail-share"/)
  assert.match(topBar, /data-testid="manga-detail-more"/)
  assert.match(topBar, /data-testid="manga-detail-topbar-title"/)
  assert.match(topBar, /size-11/, 'buttons must be 44x44 as in the prototype')

  assert.match(
    topBar,
    /window\.scrollY > TITLE_REVEAL_OFFSET/,
    'the title must show on scroll (no printing the same info twice while the header is on screen)',
  )
  assert.match(
    topBar,
    /aria-hidden=\{!titleVisible\}/,
    'an invisible title must not be read by a screen reader either',
  )
  /*
   * INTENT UPDATED (PR #154). The earlier rule said "actions should not repeat on the bar";
   * the user wanted ⋯ to open a bottom action sheet with real actions in it.
   * Follow/Rate are now IN the sheet: the bar stays on screen throughout while details stay above.
   *
   * The protected new rule: ON the bar itself only three controls stay
   * (back, share, ⋯). Actions go inside the sheet; adding buttons to the bar would turn it
   * into a toolbar and break the prototype's simplicity.
   */
  /*
   * DO NOT USE `indexOf('  return (')`: it lands on the useEffect cleanup line
   * `return () => window.removeEventListener(...)` and the sheetItems block enters the slice;
   * the assertion then mistakes its own sheet items for "bar buttons" and always fails.
   */
  const jsxStart = topBar.indexOf('  return (\n    <div')
  assert.ok(jsxStart > 0, 'bilesenin JSX donusu bulunmali')
  const jsx = topBar.slice(jsxStart)
  const barButtons = (jsx.match(/data-testid="manga-detail-(back|share|more)"/g) || [])
  assert.equal(barButtons.length, 3, 'the bar must have exactly back + share + ...')
  assert.doesNotMatch(
    jsx,
    /Takip|Puanla|Kaldigin/,
    'actions must not be added to the bar as BUTTONS; they belong in the bottom action sheet',
  )
}

// ---------- D) Sayfa cubugu erken return'lerden ONCE kaydeder ----------
{
  const registerIndex = page.indexOf("useRegisterMobileTopBarOverride('manga-detail'")
  const earlyReturnIndex = page.indexOf('/* ======== EARLY RETURNS ======== */')
  assert.ok(registerIndex > 0, 'the page must take over the bar')
  assert.ok(
    registerIndex < earlyReturnIndex,
    'registration must come BEFORE early returns: a hook cannot be called conditionally',
  )
}

// ---------- E) Raporla dugmesinin DOKUNMA HEDEFI 44px ----------
{
  assert.match(
    list,
    /after:absolute after:-inset-1\.5 after:content-\[''\]/,
    'a 32px visual button must extend to a 44px touch target (32 + 2*6)',
  )
  assert.match(list, /size-8 items-center justify-center rounded-\[9px\]/, 'gorsel olcu prototipten')
  assert.doesNotMatch(
    list,
    /className="p-0\.5 text-muted-foreground/,
    '16x16 dokunma hedefi geri gelmemeli',
  )
  assert.doesNotMatch(
    list,
    /<Flag className="h-3 w-3" \/>/,
    'the flag icon must be 15px, not 12px',
  )
}

// ---------- F) Paylas TEK yerde: mobilde cubuk, genis ekranda kunye ----------
{
  assert.match(
    hero,
    /data-testid="manga-hero-share"[\s\S]{0,400}?lg:inline-flex/,
    'share in the header only on wide screens (on mobile it is on the top bar)',
  )
  assert.match(
    hero,
    /className="hidden h-11 items-center/,
    'must be hidden on mobile; two share buttons must not show at once',
  )
}

console.log('manga-detail-topbar-contract: OK')
