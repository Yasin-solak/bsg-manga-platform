import type { ResolvedInventoryItem } from '@/services/inventoryResolver'
import { txa } from '@/i18n/activeLocale'

const PROFILE_FRAME_LABELS: Record<string, string> = {
  get default() { return txa('Varsayılan') },
  get christmas() { return txa('Noel') },
  halloween: 'Cadilar',
  get avatarframe1() { return txa('Animasyonlu 1') },
  get avatarframe2() { return txa('Animasyonlu 2') },
  get avatarframe3() { return txa('Animasyonlu 3') },
  get avatarframe4() { return txa('Animasyonlu 4') },
  get fire() { return txa('Alev') },
  get ice() { return txa('Buz') },
  get neon() { return txa('Neon') },
  get gold() { return txa('Altın') },
  get rainbow() { return txa('Prizma') },
}

export function resolveProfileFrameTitle(frameId: string, item?: ResolvedInventoryItem) {
  return item?.name || PROFILE_FRAME_LABELS[frameId] || frameId
}
