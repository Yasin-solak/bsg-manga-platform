import { runWithRetry, withServiceTimeout } from './apiResilience'

export type ImageOptimizationPreset = 'manga_cover' | 'chapter_page' | 'avatar' | 'store_asset_image'

type ImagePresetConfig = {
  maxWidth: number
  maxHeight: number
  quality: number
}

const WEBP_MIME = 'image/webp'
const SKIPPED_IMAGE_TYPES = new Set(['image/gif', 'image/svg+xml'])

const IMAGE_PRESET_CONFIGS: Record<ImageOptimizationPreset, ImagePresetConfig> = {
  manga_cover: {
    maxWidth: 1200,
    maxHeight: 1800,
    quality: 0.82,
  },
  chapter_page: {
    maxWidth: 1600,
    maxHeight: 2400,
    quality: 0.84,
  },
  avatar: {
    maxWidth: 512,
    maxHeight: 512,
    quality: 0.8,
  },
  store_asset_image: {
    maxWidth: 1600,
    maxHeight: 1600,
    quality: 0.82,
  },
}

type LoadedImage = {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

function shouldOptimizeImage(file: File): boolean {
  return file.type.startsWith('image/') && !SKIPPED_IMAGE_TYPES.has(file.type)
}

function getFileBaseName(fileName: string): string {
  const normalizedName = fileName.trim()
  if (!normalizedName) return 'upload'

  const extensionIndex = normalizedName.lastIndexOf('.')
  if (extensionIndex <= 0) return normalizedName
  return normalizedName.slice(0, extensionIndex)
}

function resolveTargetSize(
  sourceWidth: number,
  sourceHeight: number,
  config: ImagePresetConfig,
): { width: number; height: number } {
  const widthRatio = config.maxWidth / sourceWidth
  const heightRatio = config.maxHeight / sourceHeight
  const ratio = Math.min(widthRatio, heightRatio, 1)

  return {
    width: Math.max(1, Math.round(sourceWidth * ratio)),
    height: Math.max(1, Math.round(sourceHeight * ratio)),
  }
}

function loadHtmlImage(file: File): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve({
        source: image,
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
        release: () => undefined,
      })
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Gorsel okunamadi.'))
    }

    image.src = objectUrl
  })
}

async function loadCanvasImage(file: File): Promise<LoadedImage> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    }
  }

  return loadHtmlImage(file)
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Gorsel donusumu basarisiz oldu.'))
          return
        }
        resolve(blob)
      },
      WEBP_MIME,
      quality,
    )
  })
}

function getFileExtensionFromMime(mimeType: string): string {
  const mimeMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  }

  return mimeMap[mimeType] || 'png'
}

export async function optimizeImageForUpload(
  file: File,
  preset: ImageOptimizationPreset,
): Promise<File> {
  if (!shouldOptimizeImage(file)) return file

  const config = IMAGE_PRESET_CONFIGS[preset]

  try {
    const loadedImage = await loadCanvasImage(file)
    try {
      const targetSize = resolveTargetSize(loadedImage.width, loadedImage.height, config)
      const canvas = document.createElement('canvas')
      canvas.width = targetSize.width
      canvas.height = targetSize.height

      const context = canvas.getContext('2d', { alpha: true })
      if (!context) return file

      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(loadedImage.source, 0, 0, targetSize.width, targetSize.height)

      const convertedBlob = await canvasToBlob(canvas, config.quality)
      const convertedFile = new File(
        [convertedBlob],
        `${getFileBaseName(file.name)}.webp`,
        {
          type: WEBP_MIME,
          lastModified: Date.now(),
        },
      )

      const resized = targetSize.width !== loadedImage.width || targetSize.height !== loadedImage.height
      const formatChanged = file.type !== WEBP_MIME
      const sizeImproved = convertedFile.size <= file.size

      if (resized || formatChanged || sizeImproved) {
        return convertedFile
      }

      return file
    } finally {
      loadedImage.release()
    }
  } catch (error) {
    console.warn('[imageOptimizationService] optimizeImageForUpload fallback', error)
    return file
  }
}

export async function imageDataUrlToFile(
  dataUrl: string,
  baseName = 'upload',
): Promise<File> {
  const trimmedValue = dataUrl.trim()
  if (!trimmedValue.startsWith('data:image/')) {
    throw new Error('Gecersiz gorsel verisi.')
  }

  const response = await runWithRetry(
    () => withServiceTimeout(
      (signal) => fetch(trimmedValue, { signal }),
      { label: 'Gorsel veri URL okuma', timeoutMs: 4_000 },
    ),
    {
      label: 'Gorsel veri URL okuma',
      maxAttempts: 2,
    },
  )
  if (!response.ok) {
    throw new Error('Gorsel verisi okunamadi.')
  }

  const blob = await response.blob()
  const mimeType = blob.type || 'image/png'
  const extension = getFileExtensionFromMime(mimeType)
  return new File([blob], `${baseName}.${extension}`, {
    type: mimeType,
    lastModified: Date.now(),
  })
}
