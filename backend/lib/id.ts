export function generate7CharId(): string {
  const chars = 'abcdefghijklmnop'
  let id = ''
  for (let i = 0; i < 7; i++) {
    id += chars[Math.floor(Math.random() * chars.length)]
  }
  return id
}
