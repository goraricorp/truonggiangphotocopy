import fingerprintTemplate from "../../docs/new.png?url"
import modernTemplate from "../../docs/image.png?url"

// Coordinates refer to the cropped template, not the surrounding reference sheet.
const field = (key, label, box, kind = "text", sourceBox = box) => ({
  key,
  label,
  box,
  sourceBox,
  kind,
})
export const templates = {
  fingerprint: {
    label: "Có vân tay · QR mặt trước",
    url: fingerprintTemplate,
    front: {
      rect: [3, 3, 500, 295],
      fields: [
        field("number", "Số CCCD", [0.4, 0.405, 0.97, 0.5], "number"),
        field("name", "Họ và tên", [0.29, 0.55, 0.98, 0.62]),
        field("birth", "Ngày sinh", [0.57, 0.615, 0.97, 0.685], "date"),
        field("sex", "Giới tính", [0.49, 0.685, 0.6, 0.745]),
        field("nationality", "Quốc tịch", [0.83, 0.685, 0.99, 0.745]),
        field("origin", "Quê quán", [0.29, 0.79, 0.98, 0.865]),
        field("residence", "Nơi thường trú", [0.29, 0.89, 0.98, 0.985]),
        field("expiry", "Ngày hết hạn", [0.03, 0.945, 0.275, 0.998], "date"),
      ],
      patches: [
        [0.03, 0.34, 0.275, 0.87],
        [0.81, 0.06, 0.975, 0.32],
      ],
    },
    back: {
      rect: [3, 304, 500, 297],
      fields: [
        field(
          "identification",
          "Đặc điểm nhận dạng",
          [0.03, 0.075, 0.53, 0.15]
        ),
        field("issue", "Ngày cấp", [0.41, 0.16, 0.97, 0.245], "date"),
      ],
      patches: [
        [0.54, 0.025, 0.775, 0.475],
        [0.775, 0.025, 0.995, 0.475],
        [0.28, 0.28, 0.54, 0.64],
      ],
      mrz: [0.035, 0.7, 0.98, 0.98],
    },
  },
  modern: {
    label: "Không có vân tay · QR mặt sau",
    url: modernTemplate,
    front: {
      rect: [0, 0, 780, 515],
      fields: [
        field(
          "number",
          "Số định danh cá nhân",
          [0.28, 0.47, 0.94, 0.565],
          "number"
        ),
        field("name", "Họ, chữ đệm và tên", [0.28, 0.64, 0.98, 0.735]),
        field("birth", "Ngày sinh", [0.28, 0.8, 0.73, 0.875], "date"),
        field("sex", "Giới tính", [0.28, 0.925, 0.49, 0.995]),
        field("nationality", "Quốc tịch", [0.54, 0.925, 0.96, 0.995]),
        field("expiry", "Ngày hết hạn", [0.01, 0.925, 0.26, 0.995], "date"),
      ],
      patches: [[0.015, 0.35, 0.255, 0.875]],
    },
    back: {
      rect: [0, 525, 780, 515],
      fields: [
        field("residence", "Nơi cư trú", [0.02, 0.085, 0.72, 0.19]),
        field(
          "birthplace",
          "Nơi đăng ký khai sinh",
          [0.02, 0.245, 0.72, 0.325]
        ),
        field("issue", "Ngày cấp", [0.43, 0.37, 0.72, 0.435], "date"),
        field("expiry", "Ngày hết hạn", [0.45, 0.5, 0.72, 0.565], "date"),
      ],
      patches: [[0.735, 0.035, 0.975, 0.395]],
      mrz: [0.035, 0.7, 0.98, 0.98],
    },
  },
}

// Regions in the uploaded, rectified card can differ from the blank layout.
const sourceRegions = {
  fingerprint: {
    front: {
      name: [0.285, 0.54, 0.98, 0.625],
      sex: [0.47, 0.68, 0.56, 0.74],
      origin: [0.285, 0.8, 0.98, 0.86],
      residence: [0.285, 0.87, 0.99, 0.995],
      expiry: [0.145, 0.895, 0.28, 0.94],
    },
    back: {
      identification: [0.035, 0.06, 0.53, 0.135],
      issue: [0.42, 0.135, 0.555, 0.18],
    },
  },
  modern: {
    front: {
      name: [0.28, 0.63, 0.98, 0.695],
      birth: [0.285, 0.78, 0.48, 0.84],
      sex: [0.79, 0.78, 0.88, 0.835],
      nationality: [0.34, 0.89, 0.51, 0.95],
    },
    back: {
      residence: [0.02, 0.025, 0.73, 0.17],
      birthplace: [0.025, 0.225, 0.5, 0.28],
      issue: [0.44, 0.35, 0.61, 0.4],
      expiry: [0.44, 0.46, 0.61, 0.51],
    },
  },
}
for (const [name, template] of Object.entries(templates)) {
  template.back.sourceMrz = [0.035, 0.655, 0.98, 0.98]
  for (const side of ["front", "back"])
    for (const definition of template[side].fields)
      definition.sourceBox =
        sourceRegions[name][side][definition.key] ?? definition.box
}
// Addresses can start after an inline label and continue on the next line.
templates.fingerprint.front.fields.find(
  (field) => field.key === "residence"
).sourceBoxes = [
  [0.68, 0.86, 0.98, 0.915],
  [0.285, 0.925, 0.98, 0.985],
]
templates.modern.back.fields.find(
  (field) => field.key === "residence"
).sourceBoxes = [
  [0.335, 0.015, 0.6, 0.07],
  [0.02, 0.075, 0.52, 0.135],
]
// Some modern cards carry expiry only on the back; do not invent a front value.
templates.modern.front.fields.find((field) => field.key === "expiry").optional =
  true

const targetRegions = {
  fingerprint: {
    front: {
      number: [0.4, 0.435, 0.97, 0.5],
      name: [0.29, 0.57, 0.98, 0.625],
      origin: [0.29, 0.815, 0.98, 0.875],
      residence: [0.29, 0.915, 0.98, 0.995],
    },
    back: {},
  },
  modern: {
    front: {
      number: [0.28, 0.49, 0.94, 0.565],
      birth: [0.28, 0.835, 0.73, 0.89],
      sex: [0.28, 0.95, 0.49, 0.999],
      nationality: [0.54, 0.95, 0.96, 0.999],
      expiry: [0.01, 0.95, 0.26, 0.999],
    },
    back: { expiry: [0.745, 0.48, 0.985, 0.545] },
  },
}
for (const [name, template] of Object.entries(templates))
  for (const side of ["front", "back"])
    for (const definition of template[side].fields)
      definition.box =
        targetRegions[name][side][definition.key] ?? definition.box
const modernExpiry = templates.modern.back.fields.find(
  (field) => field.key === "expiry"
)
modernExpiry.caption = "Ngày hết hạn"
modernExpiry.captionBox = [0.745, 0.435, 0.985, 0.475]
