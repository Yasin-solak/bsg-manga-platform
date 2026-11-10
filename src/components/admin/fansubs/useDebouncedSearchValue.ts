import { useEffect, useState } from 'react'

export function useDebouncedSearchValue(value: string, delay = 250) {
  const [debouncedValue, setDebouncedValue] = useState(value.trim())

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedValue(value.trim()), delay)
    return () => clearTimeout(timeout)
  }, [delay, value])

  return debouncedValue
}
