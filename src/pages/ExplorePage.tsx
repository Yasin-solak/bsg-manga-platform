import { useIsMobileViewport } from '@/hooks/useIsMobileViewport'
import { useExploreData } from './explore/useExploreData'
import { ExploreDesktopView } from './explore/ExploreDesktopView'
import { ExploreMobileView } from './explore/ExploreMobileView'

export default function ExplorePage() {
  const data = useExploreData()
  const isMobile = useIsMobileViewport()
  return isMobile ? <ExploreMobileView data={data} /> : <ExploreDesktopView {...data} />
}
