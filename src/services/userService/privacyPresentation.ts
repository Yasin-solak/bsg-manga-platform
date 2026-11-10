import type { UserPrivacySettings } from './types'
import { txa } from '@/i18n/activeLocale'

export type UserPrivacyFieldKey = keyof UserPrivacySettings

export const USER_PRIVACY_SURFACES: Array<{
  key: UserPrivacyFieldKey
  label: string
  detail: string
}> = [
  {
    key: 'profileVisibility',
    get label() { return txa('Hesap') },
    detail: 'Gizli hesapta profilini yalnizca onayladigin takipciler gorur.',
  },
  {
    key: 'statsVisibility',
    get label() { return txa('Istatistik izi') },
    detail: 'Takip sayilari, okuma ozeti ve sayisal profil alani.',
  },
  {
    key: 'socialLinksVisibility',
    get label() { return txa('Baglanti izi') },
    detail: 'Discord, Instagram ve X baglantilari.',
  },
  {
    key: 'activityVisibility',
    label: 'Listeler ve takip raflari',
    detail: 'Listelerim, takip edilen manga/fansub ve son hareket ozetleri.',
  },
]
