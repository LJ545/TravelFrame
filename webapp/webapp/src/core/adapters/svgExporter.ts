import {
  buildHudItems,
  type HudRenderInputs,
  type HudSnapshot,
  type HudTextItem,
  embedHudSnapshot,
} from '@travelframe/contracts'
import { BMP_VISIT_FILLS, type VisitShade } from '../domain/visitShading'
import type { SvgExporter } from '../ports'

const BMP_WIDTH = 800
const BMP_HEIGHT = 480
const MAP_OVERSAMPLE = 3

const STROKE_COUNTRY_BORDER = '1.1'
const STROKE_VISITED_BORDER = '1.2'
const STROKE_STATE_BORDER = STROKE_VISITED_BORDER
const STROKE_DOT = '0.9'

const MAPS_EXPORT_STYLE = `
path, circle { shape-rendering: geometricPrecision; }
`

const setCapJoin = (el: Element) => {
  el.setAttribute('stroke-linejoin', 'round')
  el.setAttribute('stroke-linecap', 'round')
}

const getVisitFill = (element: Element, isVisited: boolean): string => {
  const shade = element.getAttribute('data-visit-shade') as VisitShade | null
  if (shade && shade !== 'none') return BMP_VISIT_FILLS[shade]
  return isVisited ? '#000000' : 'none'
}

const applyMapStrokes = (clone: SVGSVGElement) => {
  clone.querySelectorAll('path.land-shape, path.border-mesh').forEach((p) => {
    const el = p as SVGPathElement
    el.setAttribute('fill', 'none')
    el.setAttribute('stroke', '#000000')
    el.setAttribute('stroke-width', STROKE_COUNTRY_BORDER)
    setCapJoin(el)
    el.removeAttribute('class')
  })

  clone.querySelectorAll('path.visited-border-mesh, path[data-state-intl-border="true"]').forEach((p) => {
      const el = p as SVGPathElement
      el.setAttribute('fill', 'none')
      el.setAttribute('stroke', '#ffffff')
      el.setAttribute('stroke-width', STROKE_VISITED_BORDER)
      setCapJoin(el)
      el.removeAttribute('class')
    })

  clone.querySelectorAll('path[data-country-code]').forEach((path) => {
    const isVisited = path.getAttribute('data-visited') === 'true'
    path.setAttribute('fill', getVisitFill(path, isVisited))
    path.setAttribute('stroke', 'none')
    path.removeAttribute('stroke-width')
    path.removeAttribute('class')
    path.removeAttribute('pointer-events')
  })

  clone.querySelectorAll('circle[data-country-code]').forEach((circle) => {
    const isVisited = circle.getAttribute('data-visited') === 'true'
    const visitFill = getVisitFill(circle, isVisited)
    circle.setAttribute('fill', visitFill === 'none' ? '#ffffff' : visitFill)
    if (isVisited) {
      circle.setAttribute('stroke', 'none')
      circle.removeAttribute('stroke-width')
    } else {
      circle.setAttribute('stroke', '#000000')
      circle.setAttribute('stroke-width', STROKE_DOT)
    }
    circle.removeAttribute('class')
    circle.removeAttribute('pointer-events')
  })
  clone.querySelectorAll('circle.country-dot-hit').forEach((el) => el.remove())

  clone.querySelectorAll('path[data-state-id]').forEach((path) => {
    const isVisited = path.getAttribute('data-visited') === 'true'
    path.setAttribute('fill', getVisitFill(path, isVisited))
    if (isVisited) {
      path.setAttribute('stroke', '#ffffff')
      path.setAttribute('stroke-width', STROKE_STATE_BORDER)
      setCapJoin(path)
    } else {
      path.setAttribute('stroke', 'none')
      path.removeAttribute('stroke-width')
    }
    path.removeAttribute('class')
  })
}

const buildMapSvgMarkup = (source: SVGSVGElement): string => {
  const clone = source.cloneNode(true) as SVGSVGElement
  clone.querySelector('.map-hud-overlay')?.remove()
  applyMapStrokes(clone)

  const NS = 'http://www.w3.org/2000/svg'
  const styleElement = document.createElementNS(NS, 'style')
  styleElement.textContent = MAPS_EXPORT_STYLE
  clone.insertBefore(styleElement, clone.firstChild)

  clone.setAttribute('xmlns', NS)
  clone.setAttribute('width', String(BMP_WIDTH * MAP_OVERSAMPLE))
  clone.setAttribute('height', String(BMP_HEIGHT * MAP_OVERSAMPLE))
  return new XMLSerializer().serializeToString(clone)
}

const loadSvgAsImage = (markup: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to rasterize SVG'))
    }
    image.src = url
  })

const rasterizeMap = async (markup: string): Promise<HTMLCanvasElement> => {
  const image = await loadSvgAsImage(markup)
  const rasterW = BMP_WIDTH * MAP_OVERSAMPLE
  const rasterH = BMP_HEIGHT * MAP_OVERSAMPLE

  const hi = document.createElement('canvas')
  hi.width = rasterW
  hi.height = rasterH
  const hictx = hi.getContext('2d')
  if (!hictx) throw new Error('Canvas context unavailable')
  hictx.fillStyle = '#ffffff'
  hictx.fillRect(0, 0, rasterW, rasterH)
  hictx.imageSmoothingEnabled = true
  hictx.imageSmoothingQuality = 'high'
  hictx.drawImage(image, 0, 0, rasterW, rasterH)

  const out = document.createElement('canvas')
  out.width = BMP_WIDTH
  out.height = BMP_HEIGHT
  const octx = out.getContext('2d', { willReadFrequently: true })
  if (!octx) throw new Error('Canvas context unavailable')
  octx.fillStyle = '#ffffff'
  octx.fillRect(0, 0, BMP_WIDTH, BMP_HEIGHT)
  octx.imageSmoothingEnabled = true
  octx.imageSmoothingQuality = 'high'
  octx.drawImage(hi, 0, 0, rasterW, rasterH, 0, 0, BMP_WIDTH, BMP_HEIGHT)
  return out
}

type CanvasCtxWithLetterSpacing = CanvasRenderingContext2D & { letterSpacing?: string }

const drawHudOnCanvas = (canvas: HTMLCanvasElement, items: HudTextItem[]) => {
  const ctx = canvas.getContext('2d') as CanvasCtxWithLetterSpacing | null
  if (!ctx) return
  ctx.fillStyle = '#000000'
  ctx.textBaseline = 'alphabetic'
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  for (const item of items) {
    if (item.rawSvg !== undefined) continue
    ctx.font = `${item.fontWeight} ${item.fontSize}px ${item.fontFamily}`
    ctx.textAlign =
      item.textAnchor === 'end' ? 'right' : item.textAnchor === 'middle' ? 'center' : 'left'
    if ('letterSpacing' in ctx) {
      ctx.letterSpacing = item.letterSpacing ?? '0px'
    }
    ctx.fillText(item.text, item.x, item.y)
  }
  if (ctx && 'letterSpacing' in ctx) ctx.letterSpacing = '0px'
}

const encodeBmp8BitGrayscale = (imageData: ImageData): Uint8Array => {
  const { width, height, data } = imageData
  const rowSize = Math.ceil(width / 4) * 4
  const pixelDataSize = rowSize * height
  const fileHeaderSize = 14
  const dibHeaderSize = 40
  const paletteSize = 256 * 4
  const pixelDataOffset = fileHeaderSize + dibHeaderSize + paletteSize
  const fileSize = pixelDataOffset + pixelDataSize

  const buffer = new Uint8Array(fileSize)
  const view = new DataView(buffer.buffer)

  buffer[0] = 0x42
  buffer[1] = 0x4d
  view.setUint32(2, fileSize, true)
  view.setUint32(6, 0, true)
  view.setUint32(10, pixelDataOffset, true)

  view.setUint32(14, dibHeaderSize, true)
  view.setInt32(18, width, true)
  view.setInt32(22, height, true)
  view.setUint16(26, 1, true)
  view.setUint16(28, 8, true)
  view.setUint32(30, 0, true)
  view.setUint32(34, pixelDataSize, true)
  view.setInt32(38, 2835, true)
  view.setInt32(42, 2835, true)
  view.setUint32(46, 256, true)
  view.setUint32(50, 0, true)

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
      const r = data[src]
      const g = data[src + 1]
      const b = data[src + 2]
      const a = data[src + 3]
      const aN = a / 255
      const rW = r * aN + 255 * (1 - aN)
      const gW = g * aN + 255 * (1 - aN)
      const bW = b * aN + 255 * (1 - aN)
      buffer[rowOffset + x] = Math.round((rW * 299 + gW * 587 + bW * 114) / 1000)
    }
  }
  return buffer
}

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

const prepareHudFonts = async () => {
  if (typeof document === 'undefined' || !('fonts' in document)) return
  try {
    await Promise.all([
      document.fonts.load('800 15px "Orbitron"'),
      document.fonts.load('800 14px "Orbitron"'),
      document.fonts.load('800 16px "Orbitron"'),
      document.fonts.load('800 19.2px "Orbitron"'),
      document.fonts.load('400 22px "Archivo Black"'),
      document.fonts.load('400 30px "Archivo Black"'),
      document.fonts.load('400 32px "Archivo Black"'),
      document.fonts.load('400 34px "Archivo Black"'),
    ])
    await document.fonts.ready
  } catch {
  }
}

const createCanvasMeasure = (canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext('2d') as CanvasCtxWithLetterSpacing | null
  return (
    text: string,
    style: {
      fontSize: number
      fontFamily: string
      fontWeight: number
      letterSpacing?: string
    },
  ) => {
    if (!ctx) return text.length * style.fontSize * 0.55
    ctx.font = `${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`
    if ('letterSpacing' in ctx) ctx.letterSpacing = style.letterSpacing ?? '0px'
    return ctx.measureText(text).width
  }
}

export class BrowserSvgExporter implements SvgExporter {
  async render(svgElement: SVGSVGElement, hudInputs: HudRenderInputs): Promise<Uint8Array> {
    const mapMarkup = buildMapSvgMarkup(svgElement)
    const canvas = await rasterizeMap(mapMarkup)
    await prepareHudFonts()
    const items = buildHudItems(hudInputs, createCanvasMeasure(canvas))
    drawHudOnCanvas(canvas, items)

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('Canvas context unavailable')
    const imageData = ctx.getImageData(0, 0, BMP_WIDTH, BMP_HEIGHT)
    return encodeBmp8BitGrayscale(imageData)
  }

  download(bytes: Uint8Array, fileName: string): void {
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'image/bmp' })
    downloadBlob(blob, fileName)
  }

  buildTemplate(svgElement: SVGSVGElement, snapshot: HudSnapshot): string {
    const NS = 'http://www.w3.org/2000/svg'
    const clone = svgElement.cloneNode(true) as SVGSVGElement
    clone.querySelector('.map-hud-overlay')?.remove()
    applyMapStrokes(clone)

    const styleElement = document.createElementNS(NS, 'style')
    styleElement.textContent = MAPS_EXPORT_STYLE
    clone.insertBefore(styleElement, clone.firstChild)

    clone.setAttribute('xmlns', NS)
    clone.setAttribute('width', String(BMP_WIDTH))
    clone.setAttribute('height', String(BMP_HEIGHT))

    let markup = new XMLSerializer().serializeToString(clone)
    markup = embedHudSnapshot(markup, snapshot)
    return markup
  }
}
