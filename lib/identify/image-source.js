export function revokeImageUrls(value) {
  if (value?.sourceUrl) URL.revokeObjectURL(value.sourceUrl)
  if (value?.outputUrl) URL.revokeObjectURL(value.outputUrl)
}
