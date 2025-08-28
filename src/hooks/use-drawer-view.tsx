import * as React from "react"

// MacBook Air is typically 1440px wide - use drawer for smaller screens only
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