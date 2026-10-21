import { useLayoutEffect, useState } from "react"

export function useNavigationIndicator(root, path) {
  const [indicator, setIndicator] = useState(null)
  useLayoutEffect(() => {
    let active = true
    const measure = () => {
      if (!active || !root.current?.offsetWidth) return
      const link = root.current.querySelector('[aria-current="page"]')
      if (!link) return
      const parent = root.current.getBoundingClientRect(),
        item = link.getBoundingClientRect()
      const next = {
        x: item.left - parent.left,
        y: item.top - parent.top,
        width: item.width,
        height: item.height,
      }
      setIndicator((previous) =>
        previous &&
        Object.keys(next).every((key) => previous[key] === next[key])
          ? previous
          : next
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (root.current) observer.observe(root.current)
    document.fonts.ready.then(measure)
    return () => {
      active = false
      observer.disconnect()
    }
  }, [root, path])
  return indicator
}
