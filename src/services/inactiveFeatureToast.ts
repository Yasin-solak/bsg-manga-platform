import { toast } from './toastService'
import { txa } from '@/i18n/activeLocale'

interface InactiveFeatureToastOptions {
  suffix?: string
}

export function buildInactiveFeatureMessage(featureName: string, options: InactiveFeatureToastOptions = {}) {
  const normalizedFeatureName = featureName.trim()
  const baseMessage = normalizedFeatureName
    ? txa('{name} şu anda aktif değil.', { name: txa(normalizedFeatureName) })
    : txa('Bu özellik şu anda aktif değil.')
  const normalizedSuffix = options.suffix?.trim()
  return normalizedSuffix ? `${baseMessage} ${normalizedSuffix}` : baseMessage
}

export function showInactiveFeatureToast(featureName: string, options?: InactiveFeatureToastOptions) {
  toast.info(buildInactiveFeatureMessage(featureName, options))
}
