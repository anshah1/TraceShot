type ScreenshotKey = string & { readonly __brand: 'ScreenshotKey' }

export function isValidScreenshotKey(id: string): id is ScreenshotKey {
  return /^[a-p]{14}$/.test(id)
}