import { Suspense, useEffect } from "react"
import { Bar, Progress, ProgressProvider, useProgress } from "@bprogress/react"
import { bindNavigationProgress } from "@/lib/navigation-progress"

function SuspenseProgress() {
  const { start, stop, shallowRouting } = useProgress()
  useEffect(
    () => bindNavigationProgress(document, { start, stop, shallowRouting }),
    [start, stop, shallowRouting]
  )
  return null
}

export default function NavigationProgress() {
  return (
    <ProgressProvider
      height="2px"
      color="var(--primary)"
      options={{ showSpinner: false, template: null }}
      shallowRouting
    >
      <Progress aria-hidden="true">
        <Bar className="bg-primary!" />
      </Progress>
      <Suspense fallback={null}>
        <SuspenseProgress />
      </Suspense>
    </ProgressProvider>
  )
}
