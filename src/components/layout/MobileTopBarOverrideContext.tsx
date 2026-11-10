import { createContext, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'

/**
 * Channel that hands the mobile top bar's CONTENT to a page.
 *
 * WHY WE DO NOT HIDE THE BAR: the bar in AppSidebar is `sticky` and takes 56px IN FLOW;
 * Layout's height calculation (`100svh - 3.5rem`) depends on it.
 * Removing the bar pushed the footer under the bottom bar on short pages,
 * as measured before. So the bar stays in place and only its CONTENT
 * changes: the page's own controls instead of hamburger/logo/search.
 *
 * SEPARATE from `TopBarOverrideContext`: that adds a second strip BELOW the bar
 * (shop navigation). This takes over the bar itself.
 */

type MobileTopBarOverrideState = {
  ownerId: string
  content: ReactNode
} | null

const MobileTopBarOverrideStateContext = createContext<MobileTopBarOverrideState>(null)
const MobileTopBarOverrideDispatchContext = createContext<Dispatch<SetStateAction<MobileTopBarOverrideState>> | null>(null)

export function MobileTopBarOverrideProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<MobileTopBarOverrideState>(null)

  return (
    <MobileTopBarOverrideDispatchContext.Provider value={setOverride}>
      <MobileTopBarOverrideStateContext.Provider value={override}>
        {children}
      </MobileTopBarOverrideStateContext.Provider>
    </MobileTopBarOverrideDispatchContext.Provider>
  )
}

export function useMobileTopBarOverride() {
  return useContext(MobileTopBarOverrideStateContext)
}

/**
 * The page takes over the bar; on leaving it clears ITS OWN record.
 *
 * The `ownerId` comparison is required: when moving between two pages, if the new page's
 * record arrives first and the old page's cleanup runs later, an ownerless
 * cleanup would delete the NEW record.
 */
export function useRegisterMobileTopBarOverride(ownerId: string, content: ReactNode | null) {
  const setOverride = useContext(MobileTopBarOverrideDispatchContext)

  useEffect(() => {
    if (!setOverride) return undefined

    if (!content) {
      setOverride((previous) => (previous?.ownerId === ownerId ? null : previous))
      return undefined
    }

    setOverride({ ownerId, content })

    return () => {
      setOverride((previous) => (previous?.ownerId === ownerId ? null : previous))
    }
  }, [content, ownerId, setOverride])
}
