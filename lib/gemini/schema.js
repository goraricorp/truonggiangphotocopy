import { z } from "zod"
export const identityKeys = [
  "number",
  "name",
  "birth",
  "sex",
  "nationality",
  "origin",
  "residence",
  "expiry",
  "identification",
  "issue",
  "birthplace",
]
const paragraph = z
  .object({
    text: z.string().max(30000),
    alignment: z.enum(["left", "center", "right", "justify"]),
    bold: z.boolean(),
    italic: z.boolean(),
    type: z.enum(["paragraph", "table"]),
    indent: z.union([z.literal(0), z.literal(10)]),
  })
  .strict()
export const documentSchema = z
  .object({
    paragraphs: z.array(paragraph).max(1000),
    warnings: z.array(z.string().max(500)).max(20),
  })
  .strict()
export const identitySchema = z
  .object({
    variant: z.enum(["fingerprint", "modern", "unknown"]),
    fields: z
      .object(
        Object.fromEntries(
          identityKeys.map((key) => [key, z.string().max(1000)])
        )
      )
      .strict(),
    mrz: z.string().max(500),
    warnings: z.array(z.string().max(500)).max(20),
  })
  .strict()
export const resultSchema = (task) =>
  task === "statement" ? documentSchema : identitySchema
export function jsonSchema(task) {
  const schema = z.toJSONSchema(resultSchema(task), { target: "draft-7" })
  // Gemini supports numeric enums; Zod literal unions emit unsupported const.
  if (task === "statement")
    schema.properties.paragraphs.items.properties.indent = {
      type: "integer",
      enum: [0, 10],
    }
  // Length limits remain enforced by Zod after reading the provider response.
  const stripUnsupported = (value) => {
    if (Array.isArray(value)) return value.map(stripUnsupported)
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .filter(
            ([key]) =>
              !["maxLength", "maxItems", "additionalProperties"].includes(key)
          )
          .map(([key, entry]) => [key, stripUnsupported(entry)])
      )
    return value
  }
  return stripUnsupported(schema)
}
