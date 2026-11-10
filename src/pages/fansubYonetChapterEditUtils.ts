export type ChapterPageItem =
  | {
    id: string
    source: 'existing'
    assetRef: string
    previewUrl: string
  }
  | {
    id: string
    source: 'new'
    previewUrl: string
    file: File
  }

export function createLocalDraftId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function revokePreviewUrl(url: string) {
  if (url.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

export function revokeDraftPagePreviews(items: ChapterPageItem[]) {
  items.forEach((item) => {
    if (item.source === 'new') {
      revokePreviewUrl(item.previewUrl)
    }
  })
}
