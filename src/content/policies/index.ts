import { LEGAL_DOCUMENTS } from './legalDocuments'
import { RULE_DOCUMENTS } from './ruleDocuments'
import type { PolicyDocumentDefinition } from './documentTypes'
import { txa } from '@/i18n/activeLocale'

export * from './documentTypes'
export * from './supportContent'
export type { PolicyDocumentKey } from '@/lib/policyRoutes'

export const POLICY_DOCUMENTS: PolicyDocumentDefinition[] = [
  ...LEGAL_DOCUMENTS,
  ...RULE_DOCUMENTS,
]

/** Icerik verisini etkin dile cevirir; kimlik ve baglanti alanlarina dokunmaz. */
export function localizePolicyContent<T>(value: T): T {
  if (typeof value === 'string') return txa(value) as T
  if (Array.isArray(value)) return value.map((item) => localizePolicyContent(item)) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      key === 'id' || key === 'key' || key === 'to' || key === 'href' ? item : localizePolicyContent(item),
    ])) as T
  }
  return value
}

export function getPolicyDocumentByKey(key: PolicyDocumentDefinition['key']) {
  const document = POLICY_DOCUMENTS.find((item) => item.key === key)
  return document ? localizePolicyContent(document) : null
}
