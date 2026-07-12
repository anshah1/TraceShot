const CHARS = 'abcdefghijklmnop'

export function generate7CharId(): string {
  let id = ''
  for (let i = 0; i < 7; i++) {
    id += CHARS[Math.floor(Math.random() * CHARS.length)]
  }
  return id
}
