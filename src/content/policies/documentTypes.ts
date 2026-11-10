import type { PolicyDocumentKey } from '@/lib/policyRoutes'

export interface PolicySection {
  id: string
  title: string
  summary?: string
  paragraphs?: string[]
  bullets?: string[]
}

export interface PolicyLinkItem {
  label: string
  to: string
}

export interface PolicyDocumentDefinition {
  key: PolicyDocumentKey
  title: string
  eyebrow: string
  summary: string
  effectiveDate: string
  updatedDate: string
  audience: string
  sections: PolicySection[]
  relatedLinks: PolicyLinkItem[]
}

export interface PolicyHubCategory {
  title: string
  description: string
  links: PolicyLinkItem[]
}

export interface HelpCenterTopic {
  title: string
  description: string
  points: string[]
  relatedLinks: PolicyLinkItem[]
}

export interface FaqItem {
  question: string
  answer: string
}
