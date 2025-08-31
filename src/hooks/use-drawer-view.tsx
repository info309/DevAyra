import * as React from "react"

// Use drawer view for mobile and tablet (< 800px), desktop gets side-by-side (≥ 800px)
const DRAWER_BREAKPOINT = 800

export function useIsDrawerView() {
  const [isDrawerView, setIsDrawerView] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${DRAWER_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsDrawerView(window.innerWidth < DRAWER_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsDrawerView(window.innerWidth < DRAWER_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isDrawerView
}