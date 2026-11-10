import { useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useNavigate } from '@/i18n/router'
import type { DetailTab } from './fansubManagementUtils'

const FANSUB_TAB_TO_HASH: Record<DetailTab, string> = {
  overview: 'genel',
  members: 'uyeler',
  mangas: 'mangalar',
  economy: 'ekonomi',
  moderation: 'moderasyon',
}

function fansubTabFromHash(hash: string): DetailTab {
  const normalized = hash.replace(/^#/, '').trim().toLowerCase()
  if (normalized === 'uyeler') return 'members'
  if (normalized === 'mangalar') return 'mangas'
  if (normalized === 'ekonomi') return 'economy'
  if (normalized === 'moderasyon') return 'moderation'
  return 'overview'
}

export function useFansubManagementHashSync(tab: DetailTab, setTab: (tab: DetailTab) => void) {
  const location = useLocation()
  const navigate = useNavigate()

  const tabFromHash = useMemo(() => fansubTabFromHash(location.hash), [location.hash])

  useEffect(() => {
    if (location.hash) return
    navigate(
      {
        pathname: location.pathname,
        hash: `#${FANSUB_TAB_TO_HASH.overview}`,
      },
      { replace: true },
    )
  }, [location.hash, location.pathname, navigate])

  useEffect(() => {
    if (tab === tabFromHash) return
    setTab(tabFromHash)
  }, [setTab, tab, tabFromHash])

  return (nextTab: DetailTab) => {
    if (tab !== nextTab) setTab(nextTab)
    navigate({
      pathname: location.pathname,
      hash: `#${FANSUB_TAB_TO_HASH[nextTab]}`,
    })
  }
}
