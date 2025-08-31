import * as React from "react"

// Use drawer view for mobile and tablet (< 1024px), desktop gets side-by-side (≥ 1024px)
const DRAWER_BREAKPOINT = 1024

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