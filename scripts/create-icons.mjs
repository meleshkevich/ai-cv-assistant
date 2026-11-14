/**
 * Generates placeholder PNG icons for the Chrome extension.
 * Uses only Node.js built-ins (zlib + Buffer). No external deps.
 * Replace the generated files with proper branded icons before publishing.
 */

import { writeFileSync, mkdirSync } from 'fs'
import { deflateSync } from 'zlib'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const iconsDir = join(__dirname, '..', 'public', 'icons')

// CRC-32 lookup table (IEEE polynomial)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c
  }
  return t
})()

function crc32(buf) {
  let crc = 0xffffffff
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

/** Creates a solid-colour square PNG (RGB, no alpha). */
function createSolidPng(size, r, g, b) {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  // IHDR: width, height, bit-depth=8, colour-type=2 (RGB), rest=0
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2

  // Raw scanlines: filter byte (None=0) followed by RGB pixels
  const stride = 1 + size * 3
  const raw = Buffer.alloc(size * stride)
  for (let y = 0; y < size; y++) {
    // filter byte at start of each row is already 0
    for (let x = 0; x < size; x++) {
      const o = y * stride + 1 + x * 3
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
    }
  }

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(iconsDir, { recursive: true })

// Blue #2563EB: R=37, G=99, B=235
for (const size of [16, 48, 128]) {
  const path = join(iconsDir, `icon${size}.png`)
  writeFileSync(path, createSolidPng(size, 37, 99, 235))
  console.log(`  created ${path}`)
}

console.log('Icons generated. Replace with branded assets before publishing.')
