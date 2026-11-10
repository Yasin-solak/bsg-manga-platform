import { createContext, useContext } from 'react'
export interface SaveState { saved: Set<string>; pending: Set<string>; ready: boolean; toggle: (id: string) => void }
export const ExploreSaveContext = createContext<SaveState>({ saved: new Set(), pending: new Set(), ready: false, toggle: () => undefined })
export const useExploreSaves = () => useContext(ExploreSaveContext)
