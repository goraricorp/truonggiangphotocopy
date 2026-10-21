import { useEffect, useRef, useState } from "react"
import { TextAlignJustify } from "lucide-react"
import Logo from "@/assets/logo/logo"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu"
import { navigationItems } from "@/utils/constant"
import { cn } from "@/lib/utils"
import ButtonLink from "./button-link"
import ThemeToggle from "./theme-toggle"
import { useNavigationIndicator } from "@/hooks/use-navigation-indicator"

export default function Navbar({ pathname = "/" }) {
  const [sticky, setSticky] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [current, setCurrent] = useState(pathname.replace(/\/+$/, "") || "/")
  const menu = useRef(null)
  const navigation = useRef(null)
  const indicator = useNavigationIndicator(menu, current)
  const active = (href) =>
    current === href || (current === "/identity" && href === "/identify")
  useEffect(() => {
    const scroll = () => setSticky(window.scrollY >= 50)
    const resize = () => {
      if (window.innerWidth >= 1024) setIsOpen(false)
    }
    const preparing = (event) => {
      const next = { path: event.to.pathname.replace(/\/+$/, "") || "/" }
      navigation.current = next
      setCurrent(next.path)
      event.signal?.addEventListener(
        "abort",
        () => {
          if (navigation.current !== next) return
          navigation.current = null
          setCurrent(location.pathname.replace(/\/+$/, "") || "/")
        },
        { once: true }
      )
    }
    const pageLoaded = () => {
      const path = location.pathname.replace(/\/+$/, "") || "/"
      if (navigation.current && navigation.current.path !== path) return
      navigation.current = null
      setCurrent(path)
      setIsOpen(false)
      scroll()
    }
    document.addEventListener("astro:before-preparation", preparing)
    document.addEventListener("astro:page-load", pageLoaded)
    scroll()
    window.addEventListener("scroll", scroll, { passive: true })
    window.addEventListener("resize", resize)
    return () => {
      document.removeEventListener("astro:before-preparation", preparing)
      document.removeEventListener("astro:page-load", pageLoaded)
      window.removeEventListener("scroll", scroll)
      window.removeEventListener("resize", resize)
    }
  }, [])
  return (
    <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-md">
      <div className="container mx-auto px-6 py-3">
        <nav
          aria-label="Điều hướng chính"
          className={cn(
            "flex w-full items-center justify-between gap-3 rounded-full border p-2 transition-[background-color,border-color,box-shadow] duration-150 lg:gap-6",
            sticky
              ? "border-border/60 bg-background/60 shadow-lg shadow-foreground/5"
              : "border-transparent bg-transparent"
          )}
        >
          <ButtonLink
            href="/"
            variant="ghost"
            className="h-auto shrink-0 rounded-full p-0 hover:bg-transparent"
            aria-label="Japtor · Trang chủ"
          >
            <span className="block h-12 w-[138px]">
              <Logo className="size-full" />
            </span>
          </ButtonLink>
          <NavigationMenu
            ref={menu}
            className="isolate hidden rounded-full bg-muted p-1 lg:flex"
            aria-label="Các trang"
          >
            {indicator && (
              <span
                aria-hidden="true"
                data-navigation-indicator
                className="pointer-events-none absolute top-0 left-0 rounded-full bg-background shadow-xs transition-[transform,width,height] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
                style={{
                  width: indicator.width,
                  height: indicator.height,
                  transform: `translate(${indicator.x}px, ${indicator.y}px)`,
                }}
              />
            )}
            <NavigationMenuList className="relative">
              {navigationItems.map((item) => (
                <NavigationMenuItem key={item.href}>
                  <NavigationMenuLink
                    href={item.href}
                    aria-current={active(item.href) ? "page" : undefined}
                    className={cn(
                      "relative rounded-full px-4 py-2 text-sm font-medium tracking-normal text-muted-foreground transition-colors duration-150 hover:bg-transparent hover:text-foreground focus:bg-transparent",
                      active(item.href) && "text-foreground"
                    )}
                  >
                    {item.title}
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle className="size-10 rounded-full" />
            <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon-lg"
                    className="rounded-full lg:hidden"
                    aria-label="Mở menu điều hướng"
                  />
                }
              >
                <TextAlignJustify className="size-5" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="mt-2 w-60">
                {navigationItems.map((item) => (
                  <DropdownMenuItem
                    key={item.href}
                    render={<a href={item.href} />}
                    aria-current={active(item.href) ? "page" : undefined}
                    className={cn(
                      "cursor-pointer",
                      active(item.href) && "bg-muted"
                    )}
                    onClick={() => setIsOpen(false)}
                  >
                    {item.title}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </nav>
      </div>
    </header>
  )
}
