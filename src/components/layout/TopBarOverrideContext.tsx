import { createContext, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'

type TopBarOverrideState = {
  ownerId: string
  content: ReactNode
} | null

const TopBarOverrideStateContext = createContext<TopBarOverrideState>(null)
const TopBarOverrideDispatchContext = createContext<Dispatch<SetStateAction<TopBarOverrideState>> | null>(null)

export function TopBarOverrideProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<TopBarOverrideState>(null)

  return (
    <TopBarOverrideDispatchContext.Provider value={setOverride}>
      <TopBarOverrideStateContext.Provider value={override}>
        {children}
      </TopBarOverrideStateContext.Provider>
    </TopBarOverrideDispatchContext.Provider>
  )
}

export function useTopBarOverride() {
  return useContext(TopBarOverrideStateContext)
}

export function useRegisterTopBarOverride(ownerId: string, content: ReactNode | null) {
  const setOverride = useContext(TopBarOverrideDispatchContext)

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
