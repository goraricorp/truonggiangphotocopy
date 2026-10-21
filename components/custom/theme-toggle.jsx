import { useSyncExternalStore } from "react"
import { Monitor, Sun, Moon } from "lucide-react"

import { Button } from "@/components/ui/button"

const themes = ["system", "light", "dark"]
const labels = { system: "Hệ thống", light: "Sáng", dark: "Tối" }
const icons = { system: Monitor, light: Sun, dark: Moon }

function subscribe(callback) {
  window.addEventListener("color-theme-updated", callback)
  return () => window.removeEventListener("color-theme-updated", callback)
}

function getTheme() {
  const theme = document.documentElement.dataset.theme
  return themes.includes(theme) ? theme : "system"
}

export default function ThemeToggle({ className }) {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "system")
  const next = themes[(themes.indexOf(theme) + 1) % themes.length]
  const Icon = icons[theme]

  return (
    <Button
      className={className}
      type="button"
      variant="outline"
      size="icon"
      data-theme-toggle
      title={`Giao diện: ${labels[theme]}`}
      aria-label={`Giao diện: ${labels[theme]}. Chuyển sang ${labels[next]}.`}
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent("color-theme-change", { detail: next })
        )
      }
    >
      <Icon className="size-4" aria-hidden="true" />
    </Button>
  )
}
