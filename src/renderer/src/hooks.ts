import { useEffect, useState } from 'react'

/**
 * True only once `active` has stayed true for `delayMs`. Used to hide loading
 * skeletons for fast responses (nothing flashes under ~200ms) while still
 * showing one for a slow request.
 */
export function useDelayedFlag(active: boolean, delayMs = 200): boolean {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!active) {
      return undefined
    }
    const timer = setTimeout(() => setShow(true), delayMs)
    return () => {
      clearTimeout(timer)
      setShow(false)
    }
  }, [active, delayMs])

  return show
}
