/* global window, document */
// Name effect frames: W x H canvas, the name in the middle band (horizontal 13%-87%, vertical 36%-64%).
// Each effect draws for t in [0,1); being periodic, the loop is seamless.
window.renderEffect = function renderEffect(name, frames, W, H) {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  const TAU = Math.PI * 2
  const band = { x0: W * 0.13, x1: W * 0.87, y0: H * 0.36, y1: H * 0.64 }
  const cx = W / 2
  const cy = H / 2

  let seed = 1
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
  const setSeed = (value) => { seed = Math.floor(value) % 2147483646 + 1 }

  // Fixed random properties (once per effect).
  setSeed(name.length * 977 + 13)
  const pool = Array.from({ length: 64 }, () => ({ a: rnd(), b: rnd(), c: rnd(), d: rnd(), e: rnd() }))

  function glow(x, y, rx, ry, color, alpha) {
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(rx, ry)
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
    g.addColorStop(0, color.replace('A', String(alpha)))
    g.addColorStop(1, color.replace('A', '0'))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(0, 0, 1, 0, TAU)
    ctx.fill()
    ctx.restore()
  }

  function star4(x, y, r, color, alpha) {
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = color
    ctx.shadowColor = color
    ctx.shadowBlur = r * 2.5
    ctx.beginPath()
    for (let i = 0; i < 8; i += 1) {
      const radius = i % 2 === 0 ? r : r * 0.22
      const a = (Math.PI / 4) * i - Math.PI / 2
      ctx.lineTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius)
    }
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  function bolt(x0, y0, x1, y1, jitter, frameSeed) {
    setSeed(frameSeed)
    const pts = [[x0, y0]]
    const steps = 9
    for (let i = 1; i < steps; i += 1) {
      const k = i / steps
      pts.push([x0 + (x1 - x0) * k + (rnd() - 0.5) * jitter * 0.6, y0 + (y1 - y0) * k + (rnd() - 0.5) * jitter])
    }
    pts.push([x1, y1])
    const path = () => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))) }
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = 'rgba(56,189,248,0.9)'
    ctx.shadowColor = '#38bdf8'
    ctx.shadowBlur = 14
    ctx.lineWidth = 3.2
    path(); ctx.stroke()
    ctx.strokeStyle = '#e0f2fe'
    ctx.shadowBlur = 4
    ctx.lineWidth = 1.2
    path(); ctx.stroke()
    ctx.restore()
    return pts
  }

  const draw = {
    simsek(t, f) {
      const pulse = 0.55 + 0.45 * Math.sin(TAU * t * 2)
      glow(cx, cy, W * 0.46, H * 0.34, 'rgba(14,165,233,A)', 0.22 + 0.12 * pulse)
      // Crackling arcs around the band at top and bottom edges; redrawn each frame (flicker).
      for (let k = 0; k < 2; k += 1) {
        const y = k === 0 ? band.y0 - H * 0.04 : band.y1 + H * 0.04
        const start = band.x0 + (W * 0.08) * ((f * 7 + k * 3) % 5) / 5
        bolt(start, y, start + W * (0.32 + 0.1 * ((f + k) % 3)), y + (k === 0 ? -1 : 1) * H * 0.02, H * 0.22, f * 31 + k * 17 + 5)
      }
      // A large lightning bolt that occasionally cuts the whole band.
      if (f % 6 === 0 || f % 6 === 1) {
        const x = band.x0 + (band.x1 - band.x0) * (((f / 6) * 0.37) % 1)
        bolt(x, H * 0.05, x + W * 0.05, H * 0.95, H * 0.3, f * 13 + 101)
      }
      // Yan uclarda kivilcim.
      setSeed(f * 7 + 3)
      for (let i = 0; i < 14; i += 1) {
        const side = i % 2 === 0 ? band.x0 : band.x1
        const x = side + (rnd() - 0.5) * W * 0.12
        const y = cy + (rnd() - 0.5) * H * 0.7
        ctx.save()
        ctx.fillStyle = '#bae6fd'
        ctx.shadowColor = '#38bdf8'
        ctx.shadowBlur = 8
        ctx.globalAlpha = 0.6 + rnd() * 0.4
        ctx.beginPath()
        ctx.arc(x, y, 0.8 + rnd() * 1.4, 0, TAU)
        ctx.fill()
        ctx.restore()
      }
    },

    buz(t) {
      glow(cx, cy, W * 0.45, H * 0.3, 'rgba(186,230,253,A)', 0.2)
      // Crystal shards: fixed at bottom and top edges; a bright strip passes left to right.
      const sweep = band.x0 - W * 0.2 + (band.x1 - band.x0 + W * 0.4) * t
      pool.slice(0, 34).forEach((p, i) => {
        const top = i % 3 === 0
        const x = band.x0 - W * 0.04 + (band.x1 - band.x0 + W * 0.08) * p.a
        const base = top ? band.y0 - H * 0.02 : band.y1 + H * 0.02
        const len = H * (0.05 + p.b * 0.12) * (top ? -0.7 : 1)
        const wid = W * (0.008 + p.c * 0.014)
        const lean = (p.d - 0.5) * wid * 2
        const near = Math.max(0, 1 - Math.abs(x - sweep) / (W * 0.12))
        const g = ctx.createLinearGradient(x, base, x + lean, base + len)
        g.addColorStop(0, `rgba(224,242,254,${0.75 + near * 0.25})`)
        g.addColorStop(1, `rgba(125,211,252,${0.15 + near * 0.4})`)
        ctx.save()
        ctx.fillStyle = g
        ctx.shadowColor = '#bae6fd'
        ctx.shadowBlur = 6 + near * 10
        ctx.beginPath()
        ctx.moveTo(x - wid, base)
        ctx.lineTo(x + lean, base + len)
        ctx.lineTo(x + wid, base)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      })
      // Soguk sis: periyodik kayan yumusak bulutlar.
      pool.slice(34, 44).forEach((p) => {
        const x = ((p.a + t) % 1) * (W * 1.2) - W * 0.1
        const y = cy + (p.b - 0.5) * H * 0.55
        glow(x, y, W * (0.05 + p.c * 0.05), H * (0.08 + p.d * 0.06), 'rgba(224,242,254,A)', 0.1 + 0.08 * Math.sin(TAU * (t + p.e)))
      })
      // Parlamalar.
      pool.slice(44, 54).forEach((p) => {
        const a = Math.max(0, Math.sin(TAU * (t + p.a)))
        star4(band.x0 + (band.x1 - band.x0) * p.b, cy + (p.c - 0.5) * H * 0.8, 3 + p.d * 4, '#f0f9ff', a)
      })
    },

    sakura(t) {
      glow(cx, cy, W * 0.44, H * 0.3, 'rgba(244,114,182,A)', 0.16)
      pool.slice(0, 30).forEach((p, i) => {
        const angle = TAU * (t + p.a) * (i % 2 === 0 ? 1 : -1)
        const rx = (band.x1 - band.x0) * (0.38 + p.b * 0.16)
        const ry = H * (0.2 + p.c * 0.12)
        const x = cx + Math.cos(angle) * rx
        const y = cy + Math.sin(angle) * ry + Math.sin(TAU * (t * 2 + p.d)) * H * 0.04
        const depth = (Math.sin(angle) + 1) / 2
        const r = H * (0.04 + p.e * 0.025) * (0.75 + depth * 0.4)
        const spin = TAU * (t * 2 + p.d)
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(spin)
        ctx.scale(1, 0.45 + Math.abs(Math.sin(spin)) * 0.55)
        const g = ctx.createLinearGradient(0, -r, 0, r)
        g.addColorStop(0, '#fff1f6')
        g.addColorStop(0.55, '#f9a8d4')
        g.addColorStop(1, '#db2777')
        ctx.fillStyle = g
        ctx.globalAlpha = 0.55 + depth * 0.45
        ctx.shadowColor = '#f472b6'
        ctx.shadowBlur = 6
        ctx.beginPath()
        ctx.moveTo(0, -r)
        ctx.bezierCurveTo(r * 0.95, -r * 0.55, r * 0.7, r * 0.75, 0, r)
        ctx.bezierCurveTo(-r * 0.7, r * 0.75, -r * 0.95, -r * 0.55, 0, -r)
        ctx.fill()
        ctx.restore()
      })
    },

    yildiz(t) {
      // Nebula: periyodik suzulen uc renk bulutu.
      ;[['rgba(139,92,246,A)', 0], ['rgba(59,130,246,A)', 0.33], ['rgba(236,72,153,A)', 0.66]].forEach(([color, phase]) => {
        const x = cx + Math.cos(TAU * (t + phase)) * W * 0.18
        const y = cy + Math.sin(TAU * (t + phase)) * H * 0.12
        glow(x, y, W * 0.24, H * 0.32, color, 0.34)
      })
      pool.slice(0, 56).forEach((p) => {
        const a = 0.35 + 0.65 * Math.max(0, Math.sin(TAU * (t * (1 + Math.floor(p.e * 2)) + p.a)))
        const x = W * 0.06 + W * 0.88 * p.b
        const y = H * 0.1 + H * 0.8 * p.c
        ctx.save()
        ctx.globalAlpha = a
        ctx.fillStyle = '#ffffff'
        ctx.shadowColor = '#c4b5fd'
        ctx.shadowBlur = 4
        ctx.beginPath()
        ctx.arc(x, y, 0.8 + p.d * 1.5, 0, TAU)
        ctx.fill()
        ctx.restore()
      })
      pool.slice(56, 64).forEach((p) => {
        const a = Math.max(0, Math.sin(TAU * (t + p.a)))
        star4(W * 0.1 + W * 0.8 * p.b, H * 0.15 + H * 0.7 * p.c, 5 + p.d * 6, '#f5f3ff', a)
      })
    },

    duman(t) {
      glow(cx, cy, W * 0.44, H * 0.32, 'rgba(124,58,237,A)', 0.2)
      // Asagidan yukari kivrilarak yukselen koyu duman topaklari.
      pool.slice(0, 34).forEach((p) => {
        const life = (t + p.a) % 1
        const x = band.x0 + (band.x1 - band.x0) * p.b + Math.sin(TAU * (life + p.c)) * W * 0.03
        const y = H * 0.92 - life * H * 0.88
        const r = H * (0.07 + life * 0.16) * (0.7 + p.d * 0.6)
        const alpha = Math.sin(Math.PI * life) * 0.5
        ctx.save()
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, `rgba(30,10,60,${alpha * 0.9})`)
        g.addColorStop(0.55, `rgba(91,33,182,${alpha * 0.7})`)
        g.addColorStop(1, 'rgba(76,29,149,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, r, 0, TAU)
        ctx.fill()
        ctx.restore()
      })
      // Ince mor kivilcimlar.
      pool.slice(34, 46).forEach((p) => {
        const life = (t * 1.5 + p.a) % 1
        const x = band.x0 + (band.x1 - band.x0) * p.b
        const y = band.y1 - life * H * 0.6
        ctx.save()
        ctx.globalAlpha = Math.sin(Math.PI * life)
        ctx.fillStyle = '#c4b5fd'
        ctx.shadowColor = '#a78bfa'
        ctx.shadowBlur = 6
        ctx.beginPath()
        ctx.arc(x, y, 1 + p.c * 1.2, 0, TAU)
        ctx.fill()
        ctx.restore()
      })
    },
  }

  const out = []
  for (let f = 0; f < frames; f += 1) {
    ctx.clearRect(0, 0, W, H)
    draw[name](f / frames, f)
    out.push(canvas.toDataURL('image/png'))
  }
  return out
}
