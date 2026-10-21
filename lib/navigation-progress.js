const path = (url) => url.pathname.replace(/\/+$/, "") || "/"

export function bindNavigationProgress(
  events,
  { start, stop, shallowRouting },
  currentUrl = () => window.location.href
) {
  let pending = null,
    disposed = false
  const begin = (event) => {
    if (event.signal?.aborted) return
    if (
      event.to.href === event.from.href ||
      (shallowRouting && path(event.to) === path(event.from))
    )
      return
    const navigation = { url: event.to }
    pending = navigation
    start()
    event.signal?.addEventListener(
      "abort",
      () => {
        if (pending !== navigation) return
        pending = null
        // A superseding navigation may start in the same task.
        queueMicrotask(() => {
          if (!disposed && !pending) stop()
        })
      },
      { once: true }
    )
  }
  const finish = () => {
    if (!pending) return
    const current = new URL(currentUrl())
    if (
      path(current) !== path(pending.url) ||
      (!shallowRouting && current.search !== pending.url.search)
    )
      return
    pending = null
    stop()
  }
  events.addEventListener("astro:before-preparation", begin)
  events.addEventListener("astro:page-load", finish)
  return () => {
    disposed = true
    pending = null
    events.removeEventListener("astro:before-preparation", begin)
    events.removeEventListener("astro:page-load", finish)
    stop()
  }
}
