import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

function load(path) {
  const exports = {}
  const code = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'exports', code)((name) => { throw new Error(`beklenmeyen import: ${name}`) }, exports)
  return exports
}

const arrange = load('src/pages/translationStudio/editor/arrange.ts')
const boxes = [
  { id: 'a', x: 10, y: 10, w: 40, h: 20 },
  { id: 'b', x: 100, y: 50, w: 20, h: 40 },
  { id: 'c', x: 200, y: 30, w: 60, h: 10 },
]

// --- Hizalama ---------------------------------------------------------------------
assert.deepEqual(arrange.boundsOf(boxes), { x: 10, y: 10, w: 250, h: 80 })
const left = arrange.alignBoxes(boxes, 'sol')
assert.equal(left.has('a'), false, 'an already aligned box stays in place (no needless save)')
assert.deepEqual(left.get('b'), { x: 10, y: 50 })
assert.deepEqual(left.get('c'), { x: 10, y: 30 })
assert.deepEqual(arrange.alignBoxes(boxes, 'sag').get('a'), { x: 220, y: 10 })
assert.deepEqual(arrange.alignBoxes(boxes, 'yatayOrta').get('b'), { x: 125, y: 50 })
assert.deepEqual(arrange.alignBoxes(boxes, 'alt').get('c'), { x: 200, y: 80 })
assert.deepEqual(arrange.alignBoxes(boxes, 'dikeyOrta').get('a'), { x: 10, y: 40 })
assert.equal(arrange.alignBoxes([boxes[0]], 'sol').size, 0, 'a single box is not aligned')

// --- Esit dagitma: uctakiler sabit, bosluklar esit ---------------------------------------
const spread = arrange.alignBoxes(boxes, 'yatayDagit')
assert.equal(spread.has('a'), false)
assert.equal(spread.has('c'), false)
// toplam 250 genislik, kutular 120 -> 2 bosluk x 65; b = 10+40+65 = 115
assert.deepEqual(spread.get('b'), { x: 115, y: 50 })
assert.equal(arrange.alignBoxes(boxes.slice(0, 2), 'yatayDagit').size, 0, 'dagitma en az 3 kutu ister')

// --- Akilli kilavuz ------------------------------------------------------------------
const page = { width: 400, height: 300 }
const snapped = arrange.snapBox({ x: 197, y: 120, w: 20, h: 20 }, [], page, 6)
// left edge 197, center 207, right 217; page center 200 -> left edge nearest at 3 px
assert.equal(snapped.dx, 3)
assert.deepEqual(snapped.guides, [{ axis: 'x', at: 200 }])
const toOther = arrange.snapBox({ x: 52, y: 200, w: 30, h: 30 }, [{ x: 10, y: 10, w: 40, h: 20 }], page, 6)
assert.equal(toOther.dx, -2, 'snaps to the right edge of the other item')
assert.deepEqual(arrange.snapBox({ x: 120, y: 120, w: 20, h: 20 }, [], page, 6), { dx: 0, dy: 0, guides: [] }, 'no snap outside the threshold')

// --- The group stays inside the page ------------------------------------------------------
assert.deepEqual(arrange.clampGroupDelta({ x: 10, y: 10, w: 100, h: 50 }, -30, 400, page), { dx: -10, dy: 240 })
assert.equal(arrange.intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 5, h: 5 }), true)
assert.equal(arrange.intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 5, h: 5 }), false)

// --- Source: canvas and screen wiring -------------------------------------------------------
const canvas = read('src/pages/translationStudio/editor/EditorCanvas.tsx')
assert.match(canvas, /if \(event\.shiftKey\) \{ onSelect\(item\.id, 'toggle'\); return \}/, 'Shift+tik secime ekler/cikarir')
assert.match(canvas, /const ids = selectedIds\.length > 1 && selectedIds\.includes\(item\.id\) \? selectedIds : \[item\.id\]/, 'grup birlikte tasinir')
assert.match(canvas, /snapBox\(\{ \.\.\.group, x: group\.x \+ dx, y: group\.y \+ dy \}, others, \{ width, height \}, 6 \/ zoom\)/, 'tasima akilli kilavuza yakalanir')
assert.match(canvas, /event\.altKey \? \{ dx: 0, dy: 0, guides: \[\] \}/, 'Alt yakalamayi kapatir')
assert.match(canvas, /kind: 'marquee', start: point, additive: event\.shiftKey/, 'a selection rectangle on empty space')
assert.match(canvas, /data-testid='tl-guides'/)

const screen = read('src/pages/translationStudio/editor/EditorScreen.tsx')
assert.match(screen, /void editor\.removeItems\(selectedIds[.)]/, 'multi delete is one undo step (one removeItems call)')
assert.match(screen, /if \(mod && key === 'c'\) \{ if \(!window\.getSelection\(\)\?\.toString\(\) && copySelected\(\)\) event\.preventDefault\(\); return \}/, 'metin seciliyken tarayici kopyalamasi bozulmaz')
assert.match(screen, /if \(mod && key === 'j'\)/, 'Ctrl+J cogaltir')
assert.match(screen, /const offset = clip\.pageId === page\.id \? 16 \* clip\.pastes : 0/, 'a paste on the same page shifts, on another page goes to the same place')
assert.match(screen, /<AlignBar count=\{selectedItems\.length\} onAlign=\{alignSelected\} onMatchStyle=\{matchStyle\} \/>/, 'coklu secimde hizalama cubugu')
assert.match(read('src/pages/translationStudio/editor/EditorBars.tsx'), /data-testid='tl-align-bar'/)
assert.match(read('src/pages/translationStudio/editor/useEditorPage.ts'), /const removeItem = useCallback\(\(itemId: string\) => removeItems\(\[itemId\]\), \[removeItems\]\)/)

console.log('PASS translation studio v3 multi select (align, distribute, smart guide, copy/paste)')
