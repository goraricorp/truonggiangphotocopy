import { ScanLine, CreditCard, FileText, LayoutTemplate } from "lucide-react"
import Logo from "@/assets/logo/logo"
import { Separator } from "@/components/ui/separator"
import { appGlobal, navigationItems } from "@/utils/constant"
import ButtonLink from "./button-link"

const tools = [ScanLine, CreditCard, FileText, LayoutTemplate]
const sections = [
  { title: "Công cụ", links: navigationItems.slice(1, 4) },
  {
    title: "Khám phá",
    links: navigationItems.filter((item) =>
      ["/", "/banner"].includes(item.href)
    ),
  },
]

export default function Footer() {
  return (
    <footer className="border-t bg-background py-10">
      <div className="container mx-auto px-6">
        <div className="flex flex-col gap-8 sm:gap-12">
          <div className="grid grid-cols-2 gap-x-8 gap-y-10 py-6 md:grid-cols-4 lg:grid-cols-12 lg:py-10">
            <div className="col-span-2 flex flex-col items-start gap-6 lg:col-span-4">
              <ButtonLink
                href="/"
                variant="ghost"
                className="h-auto rounded-full p-0 hover:bg-transparent"
                aria-label="Japtor · Về trang chủ"
              >
                <span className="block h-12 w-[138px]">
                  <Logo className="size-full" />
                </span>
              </ButtonLink>
              <p className="max-w-sm text-base text-muted-foreground">
                Xử lý ảnh giấy tờ, tạo bản mẫu và chuyển ảnh văn bản thành tài
                liệu để chỉnh sửa, lưu trữ và in ấn.
              </p>
              <div
                className="flex items-center gap-2"
                aria-label="Truy cập nhanh công cụ"
              >
                {navigationItems.slice(1).map((item, index) => {
                  const Icon = tools[index]
                  return (
                    <ButtonLink
                      key={item.href}
                      href={item.href}
                      variant="ghost"
                      size="icon"
                      className="rounded-full text-muted-foreground hover:text-foreground"
                      aria-label={item.title}
                      title={item.title}
                    >
                      <Icon className="size-5" aria-hidden="true" />
                    </ButtonLink>
                  )
                })}
              </div>
            </div>
            <div className="hidden lg:col-span-1 lg:block" aria-hidden="true" />
            {sections.map((section) => (
              <nav
                key={section.title}
                aria-label={`Chân trang · ${section.title}`}
                className="col-span-1 space-y-4 lg:col-span-2"
              >
                <h2 className="text-base font-medium">{section.title}</h2>
                <ul className="flex flex-col gap-3">
                  {section.links.map((item) => (
                    <li key={item.href}>
                      <ButtonLink
                        href={item.href}
                        variant="link"
                        className="h-auto justify-start p-0 text-base font-normal whitespace-normal text-muted-foreground hover:text-foreground"
                      >
                        {item.title}
                      </ButtonLink>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
            <div className="col-span-2 space-y-4 md:col-span-4 lg:col-span-3">
              <h2 className="text-base font-medium">Thông tin</h2>
              <div className="space-y-3 text-base text-muted-foreground">
                <p>{appGlobal.name}</p>
                <p>Hỗ trợ xuất tài liệu Word, PDF và ảnh.</p>
                <p>Kiểm tra nội dung trước khi lưu hoặc in.</p>
              </div>
            </div>
          </div>
          <Separator orientation="horizontal" />
          <p className="text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} {appGlobal.name}. Bảo lưu mọi quyền.
          </p>
        </div>
      </div>
    </footer>
  )
}
