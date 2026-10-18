import { useState } from "react"

import { Button } from "@/components/ui/button"

export default function Counter() {
  const [count, setCount] = useState(0)

  return (
    <Button type="button" onClick={() => setCount((value) => value + 1)}>
      Số lần bấm: {count}
    </Button>
  )
}
