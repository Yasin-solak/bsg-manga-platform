/**
 * convertToWebP: converts an image file to WebP in the browser with the Canvas API.
 *
 * Why WebP?
 * - 60-80% smaller than PNG (at the same quality)
 * - 25-35% smaller than JPEG
 * - Supported by all modern browsers
 *
 * Usage:
 * const webpFile = await convertToWebP(pngFile) // 1.5MB PNG → ~200KB WebP
 * const webpFile = await convertToWebP(jpegFile, 0.85) // quality setting
 */

/**
 * Converts an image file to WebP.
 * @param file - Source image file (PNG, JPEG, etc.)
 * @param quality - WebP quality (0-1, default: 0.82, a good quality/size balance)
 * @returns New File object in WebP format
 */
export async function convertToWebP(file: File, quality = 0.82): Promise<File> {
    // Skip conversion if it is already WebP
    if (file.type === 'image/webp') return file

    // Do not convert GIF and video files (animation would be lost)
    if (file.type === 'image/gif' || file.type.startsWith('video/')) return file

    // Conversion with Canvas
    const bitmap = await createImageBitmap(file)
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()

    const blob = await canvas.convertToBlob({ type: 'image/webp', quality })

    // Build the file name with a .webp extension
    const baseName = file.name.replace(/\.[^.]+$/, '')
    return new File([blob], `${baseName}.webp`, { type: 'image/webp' })
}

/**
 * Converts several images to WebP in parallel.
 * Applies batch processing for large file lists.
 * @param files - Files to convert
 * @param quality - WebP quality
 * @param concurrency - Number of concurrent conversions (to protect RAM)
 */
export async function convertMultipleToWebP(
    files: File[],
    quality = 0.82,
    concurrency = 4,
): Promise<File[]> {
    const results: File[] = []

    for (let i = 0; i < files.length; i += concurrency) {
        const batch = files.slice(i, i + concurrency)
        const converted = await Promise.all(
            batch.map((f) => convertToWebP(f, quality)),
        )
        results.push(...converted)
    }

    return results
}
