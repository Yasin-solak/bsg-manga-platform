import sharp from 'sharp'

// Siyah zeminli animasyonu saydamlastirir: alfa = parlaklik (max RGB), renk on-carpimdan cozulur.
const [input, output] = process.argv.slice(2)
const source = sharp(input, { animated: true })
const meta = await source.metadata()
const { data, info } = await source.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const frameHeight = meta.pageHeight
const pages = meta.pages
const width = info.width
const out = Buffer.alloc(data.length)
for (let i = 0; i < data.length; i += 4) {
  const r = data[i], g = data[i + 1], b = data[i + 2]
  const peak = Math.max(r, g, b)
  // Hafif esik: siyaha yakin gurultu tamamen saydam olsun.
  const alpha = peak < 10 ? 0 : Math.min(255, Math.round((peak - 10) * 255 / 245 * 1.6))
  const scale = alpha ? 255 / Math.max(peak, 1) : 0
  out[i] = Math.min(255, Math.round(r * scale))
  out[i + 1] = Math.min(255, Math.round(g * scale))
  out[i + 2] = Math.min(255, Math.round(b * scale))
  out[i + 3] = Math.round(alpha * (data[i + 3] / 255))
}
await sharp(out, { raw: { width, height: frameHeight * pages, channels: 4, pageHeight: frameHeight } })
  .webp({ loop: meta.loop ?? 0, delay: meta.delay, quality: 85, alphaQuality: 90, effort: 6 })
  .toFile(output)
const check = await sharp(output, { animated: true }).metadata()
console.log('ok', check.width, check.pageHeight, check.pages, check.hasAlpha)
