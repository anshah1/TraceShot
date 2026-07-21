import { CHARSET } from './watermark'

// The screenshot half of the watermark id; prepended with the user's 7-char user_id to form the
// 14-char [a-p] key the backend validates. Charset is shared with the codec so both stay in lockstep.
export function generateScreenshotId(): string {
  let id = ''
  for (let i = 0; i < 7; i++) {
    id += CHARSET[Math.floor(Math.random() * CHARSET.length)]
  }
  return id
}
