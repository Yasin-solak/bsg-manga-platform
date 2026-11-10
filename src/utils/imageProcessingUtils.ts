/**
 * imageProcessingUtils: client-side image processing tools.
 *
 * WebP compression, width limiting, long-strip merging and slicing.
 * Uses the Canvas API, with no external dependencies.
 *
 * WHY: manga pages are usually uploaded as large PNG files.
 * Converting to WebP saves 25-35% in size. Long-strip merging
 * stacks pages vertically for webtoon/manhwa format.
 */

/** Compression options */
export interface CompressOptions {
    /** Maximum width (px). Scaled down proportionally if exceeded. default: 800 */
    maxWidth?: number
    /** WebP quality between 0 and 1. default: 0.88 */
    quality?: number
    /** Output format. default: 'webp' */
    format?: 'image/webp' | 'image/jpeg'
}

/** Long strip options */
export interface LongStripOptions extends CompressOptions {
    /** Slice height (px). default: 1200 */
    sliceHeight?: number
}

/* ─── Helper: File → ImageBitmap ─── */
async function fileToImageBitmap(file: File): Promise<ImageBitmap> {
    // createImageBitmap is the fastest decode method
    return createImageBitmap(file)
}

export async function validateImageFiles(files: File[]): Promise<{ validFiles: File[]; invalidFiles: File[] }> {
    const results = await Promise.all(files.map(async (file) => {
        try {
            const bitmap = await fileToImageBitmap(file)
            bitmap.close()
            return { file, valid: true }
        } catch {
            return { file, valid: false }
        }
    }))

    return {
        validFiles: results.filter((result) => result.valid).map((result) => result.file),
        invalidFiles: results.filter((result) => !result.valid).map((result) => result.file),
    }
}

/* ─── Helper: Canvas → File ─── */
function canvasToFile(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    index: number,
    format: string,
    quality: number,
): Promise<File> {
    return new Promise((resolve, reject) => {
        if (canvas instanceof OffscreenCanvas) {
            canvas
                .convertToBlob({ type: format, quality })
                .then((blob) => {
                    const ext = format === 'image/webp' ? 'webp' : 'jpg'
                    resolve(new File([blob], `page-${String(index + 1).padStart(3, '0')}.${ext}`, { type: format }))
                })
                .catch(reject)
            return
        }
        canvas.toBlob(
            (blob) => {
                if (!blob) { reject(new Error('Canvas toBlob basarisiz.')); return }
                const ext = format === 'image/webp' ? 'webp' : 'jpg'
                resolve(new File([blob], `page-${String(index + 1).padStart(3, '0')}.${ext}`, { type: format }))
            },
            format,
            quality,
        )
    })
}

/**
 * Compresses one image.
 * - Scales down proportionally if max width is exceeded
 * - Converts to WebP
 * - Quality is adjustable
 */
export async function compressImage(
    file: File,
    options: CompressOptions = {},
): Promise<File> {
    const maxWidth = options.maxWidth ?? 800
    const quality = options.quality ?? 0.88
    const format = options.format ?? 'image/webp'

    const bitmap = await fileToImageBitmap(file)
    let targetW = bitmap.width
    let targetH = bitmap.height

    // Max width check: proportional scale down
    if (targetW > maxWidth) {
        const ratio = maxWidth / targetW
        targetW = maxWidth
        targetH = Math.round(targetH * ratio)
    }

    const canvas = document.createElement('canvas')
    canvas.width = targetW
    canvas.height = targetH
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0, targetW, targetH)
    bitmap.close()

    const result = await canvasToFile(canvas, 0, format, quality)

    // If the compressed file is larger than the original, return the original
    // (WebP can add overhead on very small files)
    if (result.size >= file.size) return file

    return result
}

/**
 * Stacks several images vertically (long strip).
 * All images are normalized to the same width.
 */
export async function mergeVertical(
    files: File[],
    maxWidth = 720,
): Promise<HTMLCanvasElement> {
    if (files.length === 0) throw new Error('Birlestirilecek dosya yok.')

    // Decode all images
    const bitmaps = await Promise.all(files.map(fileToImageBitmap))

    // Calculate a common width (the widest image or maxWidth)
    const naturalMaxW = Math.max(...bitmaps.map((b) => b.width))
    const targetW = Math.min(naturalMaxW, maxWidth)

    // Calculate each image's target height
    const heights = bitmaps.map((b) => Math.round((b.height / b.width) * targetW))
    const totalH = heights.reduce((sum, h) => sum + h, 0)

    const canvas = document.createElement('canvas')
    canvas.width = targetW
    canvas.height = totalH
    const ctx = canvas.getContext('2d')!

    let y = 0
    for (let i = 0; i < bitmaps.length; i++) {
        ctx.drawImage(bitmaps[i], 0, y, targetW, heights[i])
        y += heights[i]
        bitmaps[i].close()
    }

    return canvas
}

/**
 * Splits a long canvas into slices of the given height.
 * Each slice is returned as a separate File.
 */
export async function sliceCanvas(
    source: HTMLCanvasElement,
    sliceHeight: number,
    format = 'image/webp',
    quality = 0.88,
): Promise<File[]> {
    const { width, height } = source
    const sliceCount = Math.ceil(height / sliceHeight)
    const files: File[] = []

    for (let i = 0; i < sliceCount; i++) {
        const sy = i * sliceHeight
        const sh = Math.min(sliceHeight, height - sy)

        const sliceCanvas = document.createElement('canvas')
        sliceCanvas.width = width
        sliceCanvas.height = sh
        const ctx = sliceCanvas.getContext('2d')!
        ctx.drawImage(source, 0, sy, width, sh, 0, 0, width, sh)

        const file = await canvasToFile(sliceCanvas, i, format, quality)
        files.push(file)
    }

    return files
}

/**
 * Full long strip flow: merge → slice → compress.
 * Input: raw page files
 * Output: ready, compressed page files
 */
export async function createLongStrip(
    files: File[],
    options: LongStripOptions = {},
): Promise<File[]> {
    const sliceHeight = options.sliceHeight ?? 1200
    const maxWidth = options.maxWidth ?? 720
    const quality = options.quality ?? 0.88
    const format = options.format ?? 'image/webp'

    // 1. Merge
    const merged = await mergeVertical(files, maxWidth)

    // 2. Slice + compress
    const sliced = await sliceCanvas(merged, sliceHeight, format, quality)

    return sliced
}

/**
 * Compresses several files in bulk.
 * Each file is compressed independently.
 */
export async function compressImages(
    files: File[],
    options: CompressOptions = {},
): Promise<File[]> {
    return Promise.all(files.map((f) => compressImage(f, options)))
}

/**
 * Converts a file size to a human-readable format.
 */
export function humanFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Toplam dosya boyutunu hesaplar.
 */
export function totalFileSize(files: File[]): number {
    return files.reduce((sum, f) => sum + f.size, 0)
}
