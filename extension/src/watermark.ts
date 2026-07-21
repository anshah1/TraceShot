// Border watermark codec (DataDog-style). Encodes a 14-char [a-p] id into a 30-pixel strip painted
// on each edge of the capture; 2 bits/pixel via R/G +/-3 offsets, blue-elevated sentinels bracket it.
// See docs/watermark-encoding.md. Pure + orientation-agnostic: callers map each edge to/from a line.

export type RGB = { r: number; g: number; b: number }

export const CHARSET = 'abcdefghijklmnop' // 16 symbols, a=0 .. p=15 (one nibble each)
export const ID_LENGTH = 14
export const BITS_PER_ID = ID_LENGTH * 4 // 56

export const OFFSET = 3 // +/-3 on R and G encodes a bit (+3 -> 1, -3 -> 0)
export const SENTINEL_BLUE = 3 // sentinel pixels raise blue by this; data pixels leave blue at base
export const DATA_PIXELS = 28 // 28 data pixels * 2 bits = 56 bits
export const STRIP_PIXELS = DATA_PIXELS + 2 // 30: sentinel + 28 data + sentinel
export const BORDER_H = 3 // frame thickness in physical px

const OFFSET_MIN = 1 // fuzzy decode window: |offset| in [1,5] is a confident bit
const OFFSET_MAX = 5

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
const ID_RE = /^[a-p]{14}$/

// Keep R/G in [OFFSET, 255-OFFSET] and blue with sentinel headroom, so no +/-offset saturates to 0.
function safeBase(base: RGB): RGB {
  const s = (v: number) => Math.max(OFFSET, Math.min(255 - OFFSET, Math.round(v)))
  return { r: s(base.r), g: s(base.g), b: Math.max(0, Math.min(255 - SENTINEL_BLUE, Math.round(base.b))) }
}

export function idToBits(id: string): number[] {
  if (!ID_RE.test(id)) throw new Error(`invalid watermark id: ${id}`)
  const bits: number[] = []
  for (const ch of id) {
    const nib = CHARSET.indexOf(ch)
    for (let b = 3; b >= 0; b--) bits.push((nib >> b) & 1) // MSB-first within the nibble
  }
  return bits
}

function bitsToNibbles(bits: number[]): number[] {
  const nibbles: number[] = []
  for (let i = 0; i < ID_LENGTH; i++) {
    let n = 0
    for (let b = 0; b < 4; b++) n = (n << 1) | (bits[i * 4 + b] & 1)
    nibbles.push(n)
  }
  return nibbles
}

export function nibblesToId(nibbles: number[]): string | null {
  if (nibbles.length !== ID_LENGTH) return null
  const id = nibbles.map((n) => CHARSET[n] ?? '?').join('')
  return ID_RE.test(id) ? id : null
}

function sentinelPixel(base: RGB): RGB {
  return { r: base.r, g: base.g, b: clamp(base.b + SENTINEL_BLUE) }
}

// Build the 30-pixel run for one edge from the 56-bit payload and that edge's baseline color.
export function encodeLine(bits: number[], baseIn: RGB): RGB[] {
  if (bits.length !== BITS_PER_ID) throw new Error(`expected ${BITS_PER_ID} bits, got ${bits.length}`)
  const base = safeBase(baseIn)
  const line: RGB[] = [sentinelPixel(base)]
  for (let i = 0; i < DATA_PIXELS; i++) {
    line.push({
      r: clamp(base.r + (bits[2 * i] ? OFFSET : -OFFSET)),
      g: clamp(base.g + (bits[2 * i + 1] ? OFFSET : -OFFSET)),
      b: base.b,
    })
  }
  line.push(sentinelPixel(base))
  return line
}

// The bit is just the sign of the offset (+3 -> 1, -3 -> 0). Whether the channel is trustworthy is
// judged separately by the confidence gate in decodeLine; here we only pick the most likely bit.
function readBit(offset: number): number {
  return offset > 0 ? 1 : 0
}

// Scan a line (any length >= 30) for the sentinel pair and decode the 28 data pixels between.
// Sentinels are found structurally: both ends blue-elevated over the data run they bracket.
// Returns 14 nibbles, or null if no strip is located. Base R/G come from the (unoffset) sentinels.
const SENTINEL_MATCH_TOL = 2 // the two sentinels are identical when encoded; allow small noise drift
const MIN_CONFIDENT = 54 // of 56 data channels must fall in the ±[1,5] window (lossless strips score 56)

export function decodeLine(line: RGB[]): number[] | null {
  for (let i = 0; i + STRIP_PIXELS <= line.length; i++) {
    const s0 = line[i]
    const s1 = line[i + STRIP_PIXELS - 1]
    // Sentinels are an identical, blue-elevated pair bracketing the run; both checks reject content.
    if (Math.abs(s0.r - s1.r) > SENTINEL_MATCH_TOL || Math.abs(s0.g - s1.g) > SENTINEL_MATCH_TOL) continue
    let midBlue = 0
    for (let k = 1; k < STRIP_PIXELS - 1; k++) midBlue += line[i + k].b
    midBlue /= DATA_PIXELS
    if (s0.b - midBlue < SENTINEL_BLUE - 1 || s1.b - midBlue < SENTINEL_BLUE - 1) continue

    const baseR = (s0.r + s1.r) / 2 // sentinels carry the un-offset R/G baseline
    const baseG = (s0.g + s1.g) / 2
    const bits: number[] = []
    let confident = 0
    for (let k = 0; k < DATA_PIXELS; k++) {
      const px = line[i + 1 + k]
      const offR = px.r - baseR
      const offG = px.g - baseG
      if (Math.abs(offR) >= OFFSET_MIN && Math.abs(offR) <= OFFSET_MAX) confident++
      if (Math.abs(offG) >= OFFSET_MIN && Math.abs(offG) <= OFFSET_MAX) confident++
      bits.push(readBit(offR))
      bits.push(readBit(offG))
    }
    // Real strips sit at ±3 (all 56 in-window); content that faked the sentinels won't clear this.
    if (confident < MIN_CONFIDENT) continue
    return bitsToNibbles(bits)
  }
  return null
}

const range = (from: number, to: number): number[] => {
  const out: number[] = []
  for (let n = from; n < to; n++) out.push(n)
  return out
}

// Paint a solid BORDER_H frame around content inset at offset B, and write the encoded 30px run down
// each fitting edge (each edge filled with its own median color; runs centered so they clear corners).
// Pure over an RGBA buffer so it runs identically on a canvas ImageData or a plain array in tests.
export function paintWatermarkFrame(
  data: Uint8ClampedArray,
  outW: number,
  outH: number,
  sw: number,
  sh: number,
  B: number,
  id: string,
): void {
  const bits = idToBits(id)
  const at = (x: number, y: number) => (y * outW + x) * 4
  const setPx = (x: number, y: number, c: RGB) => {
    const i = at(x, y)
    data[i] = c.r
    data[i + 1] = c.g
    data[i + 2] = c.b
    data[i + 3] = 255
  }
  const edgeMedian = (pts: Array<[number, number]>): RGB => {
    const rs: number[] = [], gs: number[] = [], bs: number[] = []
    for (const [x, y] of pts) {
      const i = at(x, y)
      rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2])
    }
    const med = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1]
    return { r: med(rs), g: med(gs), b: med(bs) }
  }

  const topBase = edgeMedian(range(B, B + sw).map((x) => [x, B]))
  const bottomBase = edgeMedian(range(B, B + sw).map((x) => [x, B + sh - 1]))
  const leftBase = edgeMedian(range(B, B + sh).map((y) => [B, y]))
  const rightBase = edgeMedian(range(B, B + sh).map((y) => [B + sw - 1, y]))

  const fillRect = (x0: number, y0: number, w: number, h: number, c: RGB) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) setPx(x, y, c)
  }
  fillRect(0, 0, outW, B, topBase)
  fillRect(0, outH - B, outW, B, bottomBase)
  fillRect(0, B, B, sh, leftBase)
  fillRect(outW - B, B, B, sh, rightBase)

  const writeRun = (base: RGB, place: (k: number, band: number) => [number, number]) => {
    const run = encodeLine(bits, base)
    for (let band = 0; band < B; band++) for (let k = 0; k < STRIP_PIXELS; k++) setPx(...place(k, band), run[k])
  }
  if (sw >= STRIP_PIXELS) {
    const x0 = Math.floor((outW - STRIP_PIXELS) / 2)
    writeRun(topBase, (k, band) => [x0 + k, band])
    writeRun(bottomBase, (k, band) => [x0 + k, outH - B + band])
  }
  if (sh >= STRIP_PIXELS) {
    const y0 = Math.floor((outH - STRIP_PIXELS) / 2)
    writeRun(leftBase, (k, band) => [band, y0 + k])
    writeRun(rightBase, (k, band) => [outW - B + band, y0 + k])
  }
}

// Decoder side: scan the outermost B rows/cols of an image for watermark runs and majority-vote the id.
// Edges cropped away (or absent because the region was too short) simply yield no run.
export function readFrameId(data: Uint8ClampedArray, w: number, h: number, B: number = BORDER_H): string | null {
  const px = (x: number, y: number): RGB => {
    const i = (y * w + x) * 4
    return { r: data[i], g: data[i + 1], b: data[i + 2] }
  }
  const nibbleSets: number[][] = []
  const tryLine = (pts: Array<[number, number]>) => {
    const nibbles = decodeLine(pts.map(([x, y]) => px(x, y)))
    if (nibbles) nibbleSets.push(nibbles)
  }
  for (let band = 0; band < B; band++) {
    tryLine(range(0, w).map((x) => [x, band]))
    tryLine(range(0, w).map((x) => [x, h - B + band]))
    tryLine(range(0, h).map((y) => [band, y]))
    tryLine(range(0, h).map((y) => [w - B + band, y]))
  }
  return majorityVote(nibbleSets)
}

// Per-nibble mode across the edges that decoded, then validate as an id. Redundancy over 4 edges.
export function majorityVote(nibbleSets: number[][]): string | null {
  const valid = nibbleSets.filter((n) => n.length === ID_LENGTH)
  if (valid.length === 0) return null
  const nibbles: number[] = []
  for (let pos = 0; pos < ID_LENGTH; pos++) {
    const counts = new Map<number, number>()
    for (const set of valid) {
      const v = set[pos]
      counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    let best = 0
    let bestCount = -1
    for (const [v, c] of counts) {
      if (c > bestCount) {
        best = v
        bestCount = c
      }
    }
    nibbles.push(best)
  }
  return nibblesToId(nibbles)
}
