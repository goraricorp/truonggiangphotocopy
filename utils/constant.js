export const appGlobal = {
  name: "Photocopy Trường Giang",
}

export const identityCropLimits = Object.freeze({
  outsideMargin: 0.75,
  minimumVisibleFraction: 0.35,
  minimumInlierCoverage: 0.04,
})

export const statementDefaults = Object.freeze({
  font: "Times New Roman",
  fontSize: 14,
  left: 30,
  right: 20,
  top: 20,
  bottom: 20,
  lineSpacing: 1.5,
})

export const navigationItems = Object.freeze([
  { title: "Trang chủ", href: "/" },
  { title: "Photo CCCD", href: "/identify" },
  { title: "Tạo bản mẫu", href: "/generator" },
  { title: "Đánh máy văn bản", href: "/statement" },
  { title: "Biểu ngữ", href: "/banner" },
])
