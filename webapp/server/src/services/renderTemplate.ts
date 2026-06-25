import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { Resvg } from '@resvg/resvg-js'
import {
  buildHudItems,
  estimateTextWidth,
  injectHudOverlay,
  parseHudSnapshot,
  stripHudOverlay,
  type HudRenderInputs,
} from '@travelframe/contracts'

const BMP_WIDTH = 800
const BMP_HEIGHT = 480

const BUNDLED_FONTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../assets/fonts',
)

const resolveResvgFonts = () => {
  let fontFiles: string[] = []
  try {
    fontFiles = fs
      .readdirSync(BUNDLED_FONTS_DIR)
      .filter((name) => name.endsWith('.ttf'))
      .map((name) => path.join(BUNDLED_FONTS_DIR, name))
  } catch {
    fontFiles = []
  }
  return {
    loadSystemFonts: true,
    ...(fontFiles.length > 0 ? { fontFiles } : {}),
    defaultFontFamily: 'Archivo Black',
  }
}

export type { HudRenderInputs }

export const renderTemplateToBmp = (
  templateSvg: string,
  inputs: HudRenderInputs,
): Buffer => {
  const mapSvg = stripHudOverlay(templateSvg)
  const hudItems = buildHudItems(inputs, estimateTextWidth)
  const svg = injectHudOverlay(mapSvg, hudItems)
  const resvg = new Resvg(svg, {
    background: '#ffffff',
    fitTo: { mode: 'width', value: BMP_WIDTH },
    font: resolveResvgFonts(),
  })
  const rendered = resvg.render()
  const pixels = rendered.pixels
  if (rendered.width !== BMP_WIDTH || rendered.height !== BMP_HEIGHT) {
    throw new Error(
      `unexpected render size ${rendered.width}x${rendered.height} (want ${BMP_WIDTH}x${BMP_HEIGHT})`,
    )
  }
  return encodeBmp8BitGrayscale(pixels, BMP_WIDTH, BMP_HEIGHT)
}

export const resolveHudInputs = (
  templateSvg: string,
  dynamic: Pick<HudRenderInputs, 'etdDays' | 'weatherTemp' | 'weatherIcon'>,
  fallback: Pick<HudRenderInputs, 'destinationName' | 'visitedCount' | 'totalCountries'>,
): HudRenderInputs => {
  const snapshot = parseHudSnapshot(templateSvg)
  return {
    destinationName: snapshot?.destinationName ?? fallback.destinationName,
    visitedCount: snapshot?.visitedCount ?? fallback.visitedCount,
    totalCountries: snapshot?.totalCountries ?? fallback.totalCountries,
    etdDays: dynamic.etdDays,
    weatherTemp: dynamic.weatherTemp,
    weatherIcon: dynamic.weatherIcon,
  }
}

const encodeBmp8BitGrayscale = (pixels: Uint8Array, width: number, height: number): Buffer => {
  const rowSize = Math.ceil(width / 4) * 4
  const pixelDataSize = rowSize * height
  const fileHeaderSize = 14
  const dibHeaderSize = 40
  const paletteSize = 256 * 4
  const pixelDataOffset = fileHeaderSize + dibHeaderSize + paletteSize
  const fileSize = pixelDataOffset + pixelDataSize

  const buffer = Buffer.alloc(fileSize)
  buffer[0] = 0x42
  buffer[1] = 0x4d
  buffer.writeUInt32LE(fileSize, 2)
  buffer.writeUInt32LE(0, 6)
  buffer.writeUInt32LE(pixelDataOffset, 10)

  buffer.writeUInt32LE(dibHeaderSize, 14)
  buffer.writeInt32LE(width, 18)
  buffer.writeInt32LE(height, 22)
  buffer.writeUInt16LE(1, 26)
  buffer.writeUInt16LE(8, 28)
  buffer.writeUInt32LE(0, 30)
  buffer.writeUInt32LE(pixelDataSize, 34)
  buffer.writeInt32LE(2835, 38)
  buffer.writeInt32LE(2835, 42)
  buffer.writeUInt32LE(256, 46)
  buffer.writeUInt32LE(0, 50)

  for (let i = 0; i < 256; i++) {
    const off = fileHeaderSize + dibHeaderSize + i * 4
    buffer[off] = i
    buffer[off + 1] = i
    buffer[off + 2] = i
    buffer[off + 3] = 0
  }

  for (let y = 0; y < height; y++) {
    const bmpY = height - 1 - y
    const rowOffset = pixelDataOffset + bmpY * rowSize
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4
      const r = pixels[src]
      const g = pixels[src + 1]
      const b = pixels[src + 2]
      const a = pixels[src + 3]
      const aN = a / 255
      const rW = r * aN + 255 * (1 - aN)
      const gW = g * aN + 255 * (1 - aN)
      const bW = b * aN + 255 * (1 - aN)
      buffer[rowOffset + x] = Math.round((rW * 299 + gW * 587 + bW * 114) / 1000)
    }
  }
  return buffer
}
