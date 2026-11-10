export const POLICY_HUB_PATH = '/kurallar-ve-politikalar'
export const HELP_CENTER_PATH = '/yardim-merkezi'
export const FAQ_PATH = '/sss'
export const CONTACT_PATH = '/iletisim'
export const DMCA_PATH = '/dmca-bildirimi'

export const TERMS_PATH = '/kullanim-sartlari'
export const PRIVACY_PATH = '/gizlilik-politikasi'
export const KVKK_PATH = '/kvkk-aydinlatma-metni'
export const COMMUNITY_RULES_PATH = '/topluluk-kurallari'
export const FANSUB_RULES_PATH = '/fansub-kurallari'
export const STORE_RULES_PATH = '/magaza-ve-coin-kurallari'
export const REFUND_POLICY_PATH = '/iade-iptal-dijital-teslim'
export const ENFORCEMENT_POLICY_PATH = '/yaptirim-politikasi'
export const COPYRIGHT_POLICY_PATH = '/telif-ve-icerik-kaldirma'

export type PolicyDocumentKey =
  | 'terms'
  | 'privacy'
  | 'kvkk'
  | 'community-rules'
  | 'fansub-rules'
  | 'store-rules'
  | 'refund'
  | 'enforcement'
  | 'copyright'

export const POLICY_DOCUMENT_PATHS: Record<PolicyDocumentKey, string> = {
  terms: TERMS_PATH,
  privacy: PRIVACY_PATH,
  kvkk: KVKK_PATH,
  'community-rules': COMMUNITY_RULES_PATH,
  'fansub-rules': FANSUB_RULES_PATH,
  'store-rules': STORE_RULES_PATH,
  refund: REFUND_POLICY_PATH,
  enforcement: ENFORCEMENT_POLICY_PATH,
  copyright: COPYRIGHT_POLICY_PATH,
}
