import { motion } from 'framer-motion'
import { Flame, Sparkles } from 'lucide-react'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { txa } from '@/i18n/activeLocale'
import { BOOK_A_COLORS, BOOK_A_FRAMES, BOOK_B_COLORS, BOOK_B_FRAMES, BOOK_C_COLORS, BOOK_C_FRAMES } from './exploreBurningBooks'

const BURNING_BOOKS = [
  { frames: BOOK_A_FRAMES, colors: BOOK_A_COLORS, className: 'left-[78%] top-[2.9rem]', delay: 0, duration: 0.5 },
  { frames: BOOK_B_FRAMES, colors: BOOK_B_COLORS, className: 'left-[87%] top-[6.3rem]', delay: 0.18, duration: 0.62 },
  { frames: BOOK_C_FRAMES, colors: BOOK_C_COLORS, className: 'left-[68%] top-[7.4rem]', delay: 0.34, duration: 0.56 },
]

const EMBERS = [
  { className: 'left-[57%] top-[37%] size-2 bg-yellow-300', delay: 0 },
  { className: 'left-[64%] top-[31%] size-2.5 bg-amber-400', delay: 0.16 },
  { className: 'left-[72%] top-[43%] size-3 bg-primary', delay: 0.32 },
  { className: 'left-[80%] top-[35%] size-2 bg-orange-300', delay: 0.48 },
  { className: 'left-[68%] top-[55%] size-2 bg-red-600', delay: 0.56 },
]

const FILTER_CHIPS = ['Tür', 'Durum', 'Sıralama']

const DRAGON_COLORS: Record<string, string> = {
  o: '#2a0810',
  r: '#be1e2d',
  s: '#821222',
  h: '#e84848',
  b: '#fabe5a',
  B: '#d68c38',
  m: '#781834',
  M: '#54102a',
  k: '#be1e2d',
  c: '#f8e8c8',
  C: '#bea078',
  y: '#ffe150',
  p: '#1e080a',
  q: '#781218',
  S: '#fa963c',
}

const FIRE_COLORS: Record<string, string> = {
  a: '#fff7c2',
  b: '#fde047',
  f: '#f97316',
  g: '#ef4444',
  h: '#7f1d1d',
}

/* Original pixel dragon: two frames with wings up and down. */
const DRAGON_WINGS_UP = [
  '...............................oo...............................................',
  '..............................occo..............................................',
  '............................ookko...............................................',
  '.........................oooMMmko...............oo..............................',
  '.......................ooMMMMMmkko.............occooo.....oo....................',
  '.....................ooMMMMMMmmmkko.............occccoo..oMMo...................',
  '....................oMMMMMMMMmmmkko..............occcccooMMMo...................',
  '...................oMMMMMMMMmmmmmkko.........ooooooocccccMMMo...................',
  '..................oMMMMMMMMMmmmmmkko........oCCCCCoooccccccMMo..................',
  '.................oMMMMMMMMMmmmmmmmkko........ooCCCCCCoocccrrrhooo...............',
  '................oMMMMMMMkkkkkmmmmmkkko.........oCCCCCCCCCrrrrrhhhooo...oo.......',
  '...............oMMMMMkkkMMmmmkkmmmmkko..........oooCCCCCrrrroooooohhooohho......',
  '..............oMMMkkkMMMMMmmmmkkmmmkkko.........oooooorrrrrrryypyrrrhhhrro......',
  '.............oMkkMMMMMMMMmmmmmMmkkmmkko........ossssoorrrrrrryypprrrrrrppho.....',
  '.............oMMMMMMMMMMMmmmmkkkmkkkkkko......ossssssssrrrrrrrrrrrrrrrrrrrho....',
  '..............oooMMMMMMMmmmkkMMMkkkkkkkko......ossSssssrrrrrrrrrrrrrrrrrsrso....',
  '.................oMMMMMMmmkkmMMMmmmkkkkko.......oooosSrrrrrrrrrrrrrrrrrsssso....',
  '.................oMMMMMmkkmmMMMMmmmmkkkkko.........orrrrrrrrrrrrqqqqqqcqoco.....',
  '..................oMMMmkmmmmMMMMmmkkkmkkko......o.ohrrrrrrrrrqqqcqqcqqqo.o......',
  '..................oMMkkoommMMMMMmkmmmmmkkko....oSoorrrrrrrrrrqqqqqqqcco.........',
  '...................okoo.ommMMMMkkmmmmmmkkko.....o.oSrrrrrbbrrqqqqccooo..........',
  '....................o....omMMMkkmmmmmmmmkkko.....ohrrrrrbbbssrrrrrrssso.........',
  '.........................omMMkMMMmmmmmmmkkkko....orrrrrrbbbssssssssssso.........',
  '..........................oMkMooommmmmmmkkkko..oohrrrrrbbbboossssssooo..........',
  '...........................ooo...ommmmmmmkkkkoohhrrrrrrbBBo..oooooo.............',
  '...o..............................ommmmmmkkkkhhrrrrrrrbbbbo.....................',
  '..oho...........................o..ommmmmmkkkkrrrrrrrbbbbbo.....................',
  '..orho.........................oSo.ommmmmmkkkkrrrrrrrbbBBo......................',
  '.ohrrho.........................oSo.ommmmmmkkkkrrrrrbbbbbo......................',
  'osrrrrho........................oSSooorrrSrkkkkrrrrbbbbbo.......................',
  'ossrrrrho......................oorSShhrrrrrrkkrrrrbbbBBbo.......................',
  '.osrrrrsso................o...ohhrrrSrrrrrrrrrrrrbbbbbbo........................',
  '..orrssso................oSo..orrrrrrrrrrrrrrrrrrbbbbbo.........................',
  '.ossrsso..................oSoohrrrrrrrrrrrrrrrrrrrbBBo..........................',
  '.ossroo...................oSShrrrrrrrrrrrrrrrrrrrrbbbo..........................',
  '..oorSo..............o....orSrrrrrrrrrrrrrrrrrrrrrbbo...........................',
  '...osrho..o....o....oSoooohrrrrrrrrrrrrrrrrbrrrrrrro............................',
  '...ossrhooSo..oSo....oShhhrrrrrrrrrrrrrrrbbbbrsrrrro............................',
  '....ossrhhoSo.ooSoooohrSrrrrrrrrrrrrrrbbbbbbBBssrrro............................',
  '.....ossrrhoSohhrShhhrrrrrrrrrrrrrrrrrrbBBbbbbosrrrso...........................',
  '......ossrrhrhrrrrrrrrrrrrrrrrrsrrrrrrrbbbbbssoorrro............................',
  '.......osssrrrrrrrrrrrrrrrrrbbbsrrrrrrsoooossssorrro............................',
  '........osssssssssrrrsssrrrrbbsorrrrrsso..ossssorrro............................',
  '.........oossssssssssssssrrrsooosrrrrso...osssoosrro............................',
  '...........ooooooosssooosssso..ossrrro....osssoossrho...........................',
  '..................ooo...osssso..osrrro....ossso.osrrho..........................',
  '.........................ossso...osrrooo..osso...orrroo.........................',
  '..........................osso.o.occcccco..ooo.o.occccco........................',
  '...........................oococo.occcccco..ococoocccccco.......................',
  '.............................o.o...oooooo....o.o..oooooo........................',
]

const DRAGON_WINGS_DOWN = [
  '................................................................................',
  '................................................................................',
  '................................................................................',
  '................................................oo..............................',
  '...............................................occooo...........................',
  '................................................occccoo.........................',
  '.................................................occcccoo.......................',
  '.............................................ooooooocccccoo.....................',
  '............................................oCCCCCoooccccccooo..................',
  '.............................................ooCCCCCCoocccrhhhooo...............',
  '...............................................oCCCCCCCCCrrrrrhhhooo...oo.......',
  '................................................oooCCCCCrrrroooooohhooohho......',
  '................................................oooooorrrrrrryypyrrrhhhrro......',
  '...............................................ossssoorrrrrrryypprrrrrrppho.....',
  '..............................................ossssssssrrrrrrrrrrrrrrrrrrrho....',
  '...............................................ossSssssrrrrrrrrrrrrrrrrrsrso....',
  '................................................oooosSrrrrrrrrrrrrrrrrrsssso....',
  '...................................................orrrrrrrrrrrrqqqqqqcqoco.....',
  '................................................o.ohrrrrrrrrrqqqcqqcqqqo.o......',
  '...............................................oSoorrrrrrrrrrqqqqqqqcco.........',
  '................................................o.oSrrrrrbbrrqqqqccooo..........',
  '.................................................ohrrrrrbbbssrrrrrrssso.........',
  '......................oooooooooooo...............orrrrrrbbbssssssssssso.........',
  '...................oookkkkkkkkkkkkooooo....o...oohrrrrrbbbboossssssooo..........',
  '...............ooookkkkkkkkkkkkkkkkkkkkooooSooohhrrrrrrbBBo..oooooo.............',
  '...o..........okkkkkkMMMMmmmkkkkkkkkkkkkkkooShhrrrrrrrbbbbo.....................',
  '..oho........ockMMMMMMMMMMmmmmmmkkkkkkkkkkkkkSrrrrrrrbbbbbo.....................',
  '..orho.......ocoMMMMMMMMMMMmmmkkkmkkmmkkkkkkkkkrrrrrrbbBBo......................',
  '.ohrrho.......ooMMMMMMMMMMMMkkkmmmkmmmmkkkkkkkkkrrrrbbbbbo......................',
  'osrrrrho........oMMMMMMMMMMkmmmmmmkmmmmkmmkkkkkkrrrbbbbbooo.....................',
  'ossrrrrho.......oMMMMMMMMMMkmmmmmkmmmmmkmmmmkkkrrrbbbBBbMMMoo...................',
  '.osrrrrsso.......oMMoMMMMMkmmmMMmkmmmmmkmmmmrrrrrbbbbbbMMMMMMo..................',
  '..orrssso.........oooMMMMkmmmMMMkmmmmmmkmmmmrrrrrbbbbbMMMMMMMo..................',
  '.ossrsso.............oMMMkmmmMMMkMmmmmmmkmmrrrrrrrbBBMMMMMMMMo..................',
  '.ossroo..............oMMkmmmMMMMkMmmmmmmkmmrrrrrrrbbbMMMMMMMMo..................',
  '..oorSo..............oMkmmmrMMMMkMMmmmmmkmrrrrrrrrbbMMMMMMMMMMo.................',
  '...osrho..o....o....oSokmmrrrMMMMMMMmmmmkmrbrrrrrrrooMMMMMMMMMo.................',
  '...ossrhooSo..oSo....oSmrrrrrMMkMMMMrrmmmbbbbrsrrrrooMMMMMoMMMo.................',
  '....ossrhhoSo.ooSoooohrSrrrrrMMkMMMrrrbbbbbbBBssrrro.oMMMo.ooMo.................',
  '.....ossrrhoSohhrShhhrrrrrrrrrMkMMrrrrrbBBbbbbosrrrso.oMo....o..................',
  '......ossrrhrhrrrrrrrrrrrrrrrrMkMrrrrrrbbbbbssoorrro...o........................',
  '.......osssrrrrrrrrrrrrrrrrrbbbMrrrrrrsoooossssorrro............................',
  '........osssssssssrrrsssrrrrbbsorrrrrsso..ossssorrro............................',
  '.........oossssssssssssssrrrsooosrrrrso...osssoosrro............................',
  '...........ooooooosssooosssso..ossrrro....osssoossrho...........................',
  '..................ooo...osssso..osrrro....ossso.osrrho..........................',
  '.........................ossso...osrrooo..osso...orrroo.........................',
  '..........................osso.o.occcccco..ooo.o.occccco........................',
  '...........................oococo.occcccco..ococoocccccco.......................',
  '.............................o.o...oooooo....o.o..oooooo........................',
]

const FIRE_SMALL = [
  '.......................hhhh...................',
  '....................hghhh.....................',
  '..................ggggh.....hhhh..............',
  '...............gggggh....hhgghh...............',
  '.............gggggh..hhggggggh................',
  '..........gggfggghhgggffgggghh.hhhh...........',
  '........ggfgfggggfffffffgggghggghhh....f......',
  '......fffffffffffbfffffggggfffgggh............',
  '...gffffffffbbbbbbbfffffffffffgghhhhh.........',
  'ffbfbbbbbbbbbbbbbbbbffbbfbffffggghhhhh.h......',
  'aaaaaaaaaaaaaaabbbbbbbbbbbfffffffggghh........',
  'aaaaaaaaaaaaaaaaaaaabbabbbbbbffffggghhhhh.....',
  'gfbbaaaaaaababaabbbbbbbbbbbbbbbfffggggggh.....',
  '..gffbbbbbbbbbbbbbbbbfffbbbbbfbbbfffffggg.....',
  '.....gfffffbbbffffffffbffffffffffffffffff.....',
  '.......fffffffgggffffffffgffffffffffffggg.....',
  '........ggggggggffffffgggggffffffggggghhh.....',
  '.............ggfffgghhhggffffggghggghghhh.....',
  '............ggggh....gggffggghhhhghgghh.......',
  '...................hggggghhhhhhgghghh.........',
  '..................ggggh....hhggghhh...........',
  '.........................hhhghhh..............',
]

const FIRE_BIG = [
  '..............................hh..............',
  '...........................hhh................',
  '........................ghghh.................',
  '.....................gggghh.....hhhh..........',
  '..................ggggggh....hhghgh...........',
  '..............hggfffggh..hhggggghh........g...',
  '...........gfffffffggghggggfgghhhhhhhhhhh.....',
  '.......ggfffffbffffgfffffffgghhhgggggghh.f....',
  '....fffffbbbbbbffffffffffffggggggggghhh...hhh.',
  'fffbbbbbababbbbbbbbbbbfbffffffffffgghhhhghhhh.',
  'aaaaaaaaaaaaaaaaaabbbbbfffffffffgggggggggghhh.',
  'aaaaaaaaaaaaaaaaaaaaaaabbbbbbffffffffffggggggh',
  'ffbbbbbbbaaaabbabbbbabaabbbbbbbbbffbffffffffff',
  '...fffffbbbbbbfbbbbbbbbbbbbbbbbbbbbfffbfffffgg',
  '.....gffffffffffbbbbbbbbbfbbbbbbbbbffffffffghh',
  '..........ggfffffffffgfffbffbfffffffffffgghh..',
  '...........gffffggggggfffffffffffffffffghhh...',
  '............gg....ggfffffgggggfffffggghhhhhh..',
  '.................gggfgggghggggfffggghhhhhhh...',
  '................gggh....hggggfggghhhhhhhhh....',
  '.......................gggggghhhhhhgghhh......',
  '.....................hhgghh...hhgghhhh........',
]

type PixelSpriteProps = {
  frame: string[]
  colors: Record<string, string>
  pixelSize: number
  className?: string
}

export function ExploreEmptyStateIllustration() {
  const prefersReducedMotion = usePrefersReducedMotion()

  return (
    <div
      data-explore-empty-illustration
      className="relative mx-auto mb-8 h-72 w-full max-w-[34rem] overflow-hidden rounded-2xl border border-border/70 bg-background/75 shadow-[0_24px_80px_-60px_rgba(239,68,68,0.55)]"
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_38%_42%,rgba(239,68,68,0.18),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent)]" />
      <div className="absolute inset-x-12 bottom-10 h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent" />

      <div className="absolute left-1/2 top-6 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-primary/30 bg-background/90 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-primary shadow-[0_0_22px_rgba(239,68,68,0.22)]">
        <Flame className="size-3.5" />
        {txa('Filtreler kavruldu')}
      </div>

      {BURNING_BOOKS.map((book) => (
        <BurningBook key={book.className} {...book} prefersReducedMotion={prefersReducedMotion} />
      ))}

      <PixelDragon prefersReducedMotion={prefersReducedMotion} />
      <Embers prefersReducedMotion={prefersReducedMotion} />
      <FilterChips prefersReducedMotion={prefersReducedMotion} />
    </div>
  )
}

function BurningBook({
  frames,
  colors,
  className,
  delay,
  duration,
  prefersReducedMotion,
}: {
  frames: [string[], string[]]
  colors: Record<string, string>
  className: string
  delay: number
  duration: number
  prefersReducedMotion: boolean
}) {
  return (
    <motion.div
      data-explore-burning-book
      className={`absolute z-20 ${className}`}
      animate={prefersReducedMotion ? undefined : { y: [0, -3] }}
      transition={prefersReducedMotion ? undefined : { duration: 1.3, delay, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
    >
      <FrameSwap
        frames={frames}
        colors={colors}
        pixelSize={3}
        duration={duration}
        className="drop-shadow-[0_0_12px_rgba(251,146,60,0.5)]"
        prefersReducedMotion={prefersReducedMotion}
      />
    </motion.div>
  )
}

function FrameSwap({
  frames,
  colors,
  pixelSize,
  duration,
  className,
  prefersReducedMotion,
}: {
  frames: [string[], string[]]
  colors: Record<string, string>
  pixelSize: number
  duration: number
  className?: string
  prefersReducedMotion: boolean
}) {
  if (prefersReducedMotion) return <PixelSprite frame={frames[0]} colors={colors} pixelSize={pixelSize} className={className} />

  return (
    <div className="relative" style={{ width: frames[0][0].length * pixelSize, height: frames[0].length * pixelSize }}>
      {frames.map((frame, index) => (
        <motion.div
          key={index}
          className="absolute inset-0"
          animate={{ opacity: index === 0 ? [1, 1, 0, 0, 1] : [0, 0, 1, 1, 0] }}
          transition={{ duration, repeat: Infinity, ease: 'linear', times: [0, 0.49, 0.5, 0.99, 1] }}
        >
          <PixelSprite frame={frame} colors={colors} pixelSize={pixelSize} className={className} />
        </motion.div>
      ))}
    </div>
  )
}

function PixelDragon({ prefersReducedMotion }: { prefersReducedMotion: boolean }) {
  return (
    <motion.div
      data-explore-dragon
      className="absolute left-[3%] top-[3.5rem] z-30 drop-shadow-[0_18px_24px_rgba(0,0,0,0.55)]"
      animate={prefersReducedMotion ? undefined : { y: [-4, 5] }}
      transition={prefersReducedMotion ? undefined : {
        duration: 1.7,
        repeat: Infinity,
        repeatType: 'mirror',
        ease: 'easeInOut',
      }}
    >
      <div className="absolute left-[206px] top-[12px] -z-10">
        <FrameSwap
          frames={[FIRE_SMALL, FIRE_BIG]}
          colors={FIRE_COLORS}
          pixelSize={4}
          duration={0.42}
          className="drop-shadow-[0_0_18px_rgba(251,146,60,0.65)]"
          prefersReducedMotion={prefersReducedMotion}
        />
      </div>
      <FrameSwap
        frames={[DRAGON_WINGS_UP, DRAGON_WINGS_DOWN]}
        colors={DRAGON_COLORS}
        pixelSize={3}
        duration={0.72}
        prefersReducedMotion={prefersReducedMotion}
      />
    </motion.div>
  )
}

/* Splits rows into same-color runs and draws them in one SVG; no DOM node per pixel. */
function PixelSprite({ frame, colors, pixelSize, className }: PixelSpriteProps) {
  const columns = Math.max(...frame.map((row) => row.length))
  const rects: Array<{ x: number; y: number; width: number; fill: string }> = []
  frame.forEach((row, y) => {
    let start = 0
    for (let x = 1; x <= row.length; x += 1) {
      if (row[x] === row[start]) continue
      const fill = colors[row[start]]
      if (fill) rects.push({ x: start, y, width: x - start, fill })
      start = x
    }
  })

  return (
    <svg
      className={className}
      width={columns * pixelSize}
      height={frame.length * pixelSize}
      viewBox={`0 0 ${columns} ${frame.length}`}
      shapeRendering="crispEdges"
    >
      {rects.map((rect) => (
        <rect key={`${rect.x}-${rect.y}`} x={rect.x} y={rect.y} width={rect.width} height={1} fill={rect.fill} />
      ))}
    </svg>
  )
}

function Embers({ prefersReducedMotion }: { prefersReducedMotion: boolean }) {
  return (
    <>
      {EMBERS.map((ember) => (
        <motion.span
          key={ember.className}
          className={`absolute z-30 rounded-[2px] shadow-[0_0_12px_rgba(251,191,36,0.75)] ${ember.className}`}
          animate={prefersReducedMotion ? undefined : { x: [0, 18], y: [0, -12, 8], opacity: [0, 1, 0] }}
          transition={prefersReducedMotion ? undefined : {
            duration: 1.1,
            delay: ember.delay,
            repeat: Infinity,
            ease: 'easeOut',
          }}
        />
      ))}
    </>
  )
}

function FilterChips({ prefersReducedMotion }: { prefersReducedMotion: boolean }) {
  return (
    <div className="absolute bottom-6 left-1/2 z-30 flex -translate-x-1/2 flex-wrap justify-center gap-2">
      {FILTER_CHIPS.map((label, index) => (
        <motion.span
          key={txa(label)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/85 px-3 py-1 text-[11px] font-semibold text-muted-foreground shadow-sm"
          animate={prefersReducedMotion ? undefined : { y: [0, -2], opacity: [0.7, 1] }}
          transition={prefersReducedMotion ? undefined : {
            duration: 1.5,
            delay: index * 0.18,
            repeat: Infinity,
            repeatType: 'mirror',
            ease: 'easeInOut',
          }}
        >
          <Sparkles className="size-3 text-primary" />
          {txa(label)}
        </motion.span>
      ))}
    </div>
  )
}
