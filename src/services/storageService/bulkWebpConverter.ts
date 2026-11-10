/**
 * bulkWebpConverter: bulk-converts existing images in Supabase Storage to WebP.
 *
 * Workflow:
 * 1. List files in the storage bucket
 * 2. Download PNG/JPEG ones
 * 3. Convert to WebP with the Canvas API
 * 4. Upload the WebP version
 * 5. Update the reference in the DB
 * 6. (Optional) Delete the old file
 *
 * Run from the admin panel, in the browser.
 */

import { supabase } from '@/services/supabase'
import { convertToWebP } from '@/utils/webpConverter'
import { txa } from '@/i18n/activeLocale'

export interface ConversionProgress {
    total: number
    completed: number
    current: string
    errors: string[]
    savedKB: number
}

export type ConversionCallback = (progress: ConversionProgress) => void

/**
 * Converts all PNG/JPEG covers in the manga-covers bucket to WebP.
 * A progress callback fires at each step, shown in the UI.
 */
export async function convertExistingCoversToWebP(
    onProgress: ConversionCallback,
): Promise<ConversionProgress> {
    const bucket = 'manga-covers'
    const progress: ConversionProgress = {
        total: 0,
        completed: 0,
        current: txa('Dosyalar listeleniyor...'),
        errors: [],
        savedKB: 0,
    }
    onProgress(progress)

    // 1. List all files
    const { data: files, error: listError } = await supabase.storage
        .from(bucket)
        .list('covers', { limit: 1000, sortBy: { column: 'name', order: 'asc' } })

    if (listError) {
        progress.errors.push(txa('Listeleme hatası: {v1}', { v1: listError.message }))
        onProgress(progress)
        return progress
    }

    if (!files || files.length === 0) {
        progress.current = txa('Hiç dosya bulunamadı')
        onProgress(progress)
        return progress
    }

    // Filter PNG and JPEG only (skip files already WebP)
    const toConvert = files.filter((f) => {
        const name = f.name.toLowerCase()
        return name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg')
    })

    if (toConvert.length === 0) {
        progress.current = txa('Dönüştürülecek PNG/JPEG dosyası bulunamadı — tümü zaten WebP!')
        onProgress(progress)
        return progress
    }

    progress.total = toConvert.length
    progress.current = txa('{v1} dosya dönüştürülecek...', { v1: toConvert.length })
    onProgress(progress)

    // 2. Convert each file in turn
    for (const file of toConvert) {
        const filePath = `covers/${file.name}`
        progress.current = txa('Dönüştürülüyor: {v1}', { v1: file.name })
        onProgress(progress)

        try {
            // Download
            const { data: blob, error: dlError } = await supabase.storage
                .from(bucket)
                .download(filePath)

            if (dlError || !blob) {
                progress.errors.push(txa('İndirme hatası ({v1}): {v2}', { v1: file.name, v2: dlError?.message ?? '' }))
                progress.completed += 1
                onProgress(progress)
                continue
            }

            const originalSize = blob.size

            // Convert to a File object
            const originalFile = new File([blob], file.name, { type: blob.type || 'image/png' })

            // Convert to WebP
            const webpFile = await convertToWebP(originalFile)
            const savedKB = Math.round((originalSize - webpFile.size) / 1024)

            // WebP file name
            const webpName = file.name.replace(/\.(png|jpe?g)$/i, '.webp')
            const webpPath = `covers/${webpName}`

            // Upload
            const { error: uploadError } = await supabase.storage
                .from(bucket)
                .upload(webpPath, webpFile, {
                    upsert: true,
                    cacheControl: '31536000', // 1 yıl cache
                    contentType: 'image/webp',
                })

            if (uploadError) {
                progress.errors.push(txa('Yükleme hatası ({v1}): {v2}', { v1: file.name, v2: uploadError.message }))
                progress.completed += 1
                onProgress(progress)
                continue
            }

            // Update the DB reference: point cover_image_url to the WebP version
            const { data: publicUrlData } = supabase.storage
                .from(bucket)
                .getPublicUrl(webpPath)

            // Find the old URL and update it in the DB
            const { data: oldUrlData } = supabase.storage
                .from(bucket)
                .getPublicUrl(filePath)

            if (oldUrlData.publicUrl && publicUrlData.publicUrl) {
                await supabase
                    .from('mangas')
                    .update({ cover_image_url: publicUrlData.publicUrl })
                    .eq('cover_image_url', oldUrlData.publicUrl)
            }

            // Delete the old file
            await supabase.storage.from(bucket).remove([filePath])

            progress.savedKB += Math.max(0, savedKB)
            progress.completed += 1
            progress.current = `✓ ${file.name} → ${webpName} (${savedKB > 0 ? '-' + savedKB + 'KB' : txa('aynı')})`
            onProgress(progress)
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            progress.errors.push(`${file.name}: ${msg}`)
            progress.completed += 1
            onProgress(progress)
        }
    }

    progress.current = txa('Tamamlandı! {v1}/{v2} dosya dönüştürüldü. Toplam tasarruf: {v3} KB', { v1: progress.completed, v2: progress.total, v3: progress.savedKB })
    onProgress(progress)
    return progress
}
