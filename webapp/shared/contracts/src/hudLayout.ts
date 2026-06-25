export interface HudRenderInputs {
  destinationName: string
  etdDays: string
  weatherTemp: string
  weatherIcon: string
  visitedCount: number
  totalCountries: number
}

export interface HudSnapshot {
  destinationName: string
  visitedCount: number
  totalCountries: number
}

export interface HudTextItem {
  text: string
  x: number
  y: number
  fontSize: number
  fontFamily: string
  fontWeight: number
  textAnchor: 'start' | 'middle' | 'end'
  letterSpacing?: string
  rawSvg?: string
}

export type MeasureTextWidth = (
  text: string,
  style: {
    fontSize: number
    fontFamily: string
    fontWeight: number
    letterSpacing?: string
  },
) => number

const VISITED_HUD = {
  x: 14,
  yCount: 424,
  yLabel1: 452,
  yLabel2: 470,
} as const

const ETD_HUD_RIGHT_X = 786
const ETD_GAP_NUMBER_TO_DAYS = 10
const ETD_GAP_ETD_TO_NUMBER = 10

const DEST_MAX_WIDTH = 526
const DEST_BASE_FONT = 32
const DEST_CHAR_WIDTH_RATIO = 0.72
const DEST_MIN_FONT = 14

export const HUD_EMPH_FONT = {
  fontFamily: '"Archivo Black", sans-serif',
  fontWeight: 400,
  letterSpacing: '0.04em',
} as const

export const HUD_LABEL_FONT = {
  fontFamily: "'Orbitron', sans-serif",
  fontWeight: 800,
  letterSpacing: '0.06em',
} as const

const WEATHER_ICON_SVG: Record<string, string> = {
  '☀':
    '<g transform="translate(775,50)" pointer-events="none">' +
    '<circle cx="0" cy="0" r="4.5" fill="#000000"/>' +
    '<g fill="none" stroke="#000000" stroke-width="2" stroke-linecap="round">' +
    '<line x1="0" y1="-9" x2="0" y2="-6.5"/>' +
    '<line x1="0" y1="6.5" x2="0" y2="9"/>' +
    '<line x1="9" y1="0" x2="6.5" y2="0"/>' +
    '<line x1="-9" y1="0" x2="-6.5" y2="0"/>' +
    '<line x1="4.6" y1="-4.6" x2="6.4" y2="-6.4"/>' +
    '<line x1="-4.6" y1="-4.6" x2="-6.4" y2="-6.4"/>' +
    '<line x1="4.6" y1="4.6" x2="6.4" y2="6.4"/>' +
    '<line x1="-4.6" y1="4.6" x2="-6.4" y2="6.4"/>' +
    '</g></g>',
  '☁':
    '<g transform="translate(775,50)" fill="#000000" stroke="none" pointer-events="none">' +
    '<circle cx="-3" cy="1" r="5"/>' +
    '<circle cx="3" cy="-2" r="6"/>' +
    '<circle cx="8" cy="1" r="4"/>' +
    '<rect x="-8" y="1" width="17" height="6"/>' +
    '</g>',
  '☂':
    '<g transform="translate(775,50)" pointer-events="none">' +
    '<path d="M-9,0 A9,9 0 0 1 9,0 Z" fill="#000000" stroke="none"/>' +
    '<g fill="none" stroke="#000000" stroke-width="1.5" stroke-linecap="round">' +
    '<line x1="-3" y1="3" x2="-4" y2="8"/>' +
    '<line x1="1" y1="3" x2="0" y2="8"/>' +
    '<line x1="5" y1="3" x2="4" y2="8"/>' +
    '</g></g>',
  '☾':
    '<g transform="translate(775,50)" pointer-events="none">' +
    '<circle cx="0" cy="0" r="8.5" fill="#000000" stroke="none"/>' +
    '<circle cx="4" cy="0" r="7" fill="#ffffff" stroke="none"/>' +
    '</g>',
  '❄':
    '<g transform="translate(775,50)" fill="none" stroke="#000000" stroke-width="2" stroke-linecap="round" pointer-events="none">' +
    '<line x1="-9" y1="0" x2="9" y2="0"/>' +
    '<line x1="-7.8" y1="-4.5" x2="7.8" y2="4.5"/>' +
    '<line x1="7.8" y1="-4.5" x2="-7.8" y2="4.5"/>' +
    '</g>',
  '⚡':
    '<polygon transform="translate(775,50)" points="2,-9 -1,-1 3,-1 -2,9 1,1 -3,1" fill="#000000" stroke="none" pointer-events="none"/>',
  '○':
    '<circle transform="translate(775,50)" cx="0" cy="0" r="8" fill="none" stroke="#000000" stroke-width="2" pointer-events="none"/>',
}

export const buildWeatherIconSvg = (icon: string): string =>
  WEATHER_ICON_SVG[icon] ?? WEATHER_ICON_SVG['○'] ?? ''

export const HUD_SNAPSHOT_METADATA_ID = 'tf-hud-snapshot'

export const computeDestinationFontSize = (text: string): number => {
  const estimated = text.length * DEST_BASE_FONT * DEST_CHAR_WIDTH_RATIO
  if (estimated <= DEST_MAX_WIDTH) return DEST_BASE_FONT
  const scaled = Math.floor((DEST_MAX_WIDTH / estimated) * DEST_BASE_FONT)
  return Math.max(DEST_MIN_FONT, scaled)
}

const widthRatio = (
  fontSize: number,
  fontWeight: number,
  fontFamily: string,
  letterSpacing?: string,
) => {
  const spacing = letterSpacing?.endsWith('em')
    ? fontSize * Number.parseFloat(letterSpacing) * 0.5
    : 0
  const weightScale = fontFamily.includes('Archivo Black')
    ? 0.64
    : fontWeight >= 900
      ? 0.62
      : fontWeight >= 800
        ? 0.58
        : 0.52
  return fontSize * weightScale + spacing
}

export const estimateTextWidth: MeasureTextWidth = (text, style) => {
  const ratio = widthRatio(style.fontSize, style.fontWeight, style.fontFamily, style.letterSpacing)
  return Math.max(style.fontSize * 0.35, text.length * ratio)
}

export const layoutEtdXs = (
  etdDays: string,
  measure: MeasureTextWidth,
): { xEtd: number; xNum: number } => {
  const wDays = measure('days', { fontSize: 22, ...HUD_EMPH_FONT })
  const wNum = measure(etdDays, { fontSize: 30, ...HUD_EMPH_FONT })
  const xNum = ETD_HUD_RIGHT_X - wDays - ETD_GAP_NUMBER_TO_DAYS
  const xEtd = xNum - wNum - ETD_GAP_ETD_TO_NUMBER
  return { xEtd, xNum }
}

export const buildHudItems = (inputs: HudRenderInputs, measure: MeasureTextWidth): HudTextItem[] => {
  const destinationText = (inputs.destinationName || '—').toUpperCase()
  const destinationFontSize = computeDestinationFontSize(destinationText)
  const worldSeenPercent =
    inputs.totalCountries > 0 ? Math.round((inputs.visitedCount / inputs.totalCountries) * 100) : 0
  const { xEtd, xNum } = layoutEtdXs(inputs.etdDays, measure)

  return [
    {
      text: 'next destination',
      x: 14,
      y: 18,
      fontSize: 15,
      textAnchor: 'start',
      ...HUD_LABEL_FONT,
    },
    {
      text: destinationText,
      x: 14,
      y: 46,
      fontSize: destinationFontSize,
      textAnchor: 'start',
      ...HUD_EMPH_FONT,
    },
    {
      text: 'ETD',
      x: xEtd,
      y: 38,
      fontSize: 22,
      textAnchor: 'end',
      ...HUD_EMPH_FONT,
    },
    {
      text: inputs.etdDays,
      x: xNum,
      y: 38,
      fontSize: 30,
      textAnchor: 'end',
      ...HUD_EMPH_FONT,
    },
    {
      text: 'days',
      x: ETD_HUD_RIGHT_X,
      y: 38,
      fontSize: 22,
      textAnchor: 'end',
      ...HUD_EMPH_FONT,
    },
    {
      text: inputs.weatherTemp,
      x: 744,
      y: 61,
      fontSize: 19.2,
      textAnchor: 'end',
      ...HUD_LABEL_FONT,
    },
    {
      text: inputs.weatherIcon,
      x: 786,
      y: 61,
      fontSize: 21.6,
      fontFamily: 'sans-serif',
      fontWeight: 400,
      textAnchor: 'end',
      rawSvg: buildWeatherIconSvg(inputs.weatherIcon),
    },
    {
      text: `${inputs.visitedCount}/${inputs.totalCountries}`,
      x: VISITED_HUD.x,
      y: VISITED_HUD.yCount,
      fontSize: 34,
      textAnchor: 'start',
      ...HUD_EMPH_FONT,
    },
    {
      text: `${worldSeenPercent}%`,
      x: VISITED_HUD.x,
      y: 388,
      fontSize: 19.2,
      textAnchor: 'start',
      ...HUD_LABEL_FONT,
    },
    {
      text: 'destinations',
      x: VISITED_HUD.x,
      y: VISITED_HUD.yLabel1,
      fontSize: 16,
      textAnchor: 'start',
      ...HUD_LABEL_FONT,
    },
    {
      text: 'visited',
      x: VISITED_HUD.x,
      y: VISITED_HUD.yLabel2,
      fontSize: 16,
      textAnchor: 'start',
      ...HUD_LABEL_FONT,
    },
  ]
}

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

export const hudItemsToSvgGroup = (items: HudTextItem[]): string => {
  const texts = items
    .map((item) => {
      if (item.rawSvg !== undefined) return item.rawSvg
      const anchor = item.textAnchor === 'end' ? ' text-anchor="end"' : ''
      const spacing = item.letterSpacing ? ` letter-spacing="${item.letterSpacing}"` : ''
      return `<text x="${item.x}" y="${item.y}" font-size="${item.fontSize}" font-family="${escapeXml(item.fontFamily)}" font-weight="${item.fontWeight}" fill="#000000"${anchor}${spacing}>${escapeXml(item.text)}</text>`
    })
    .join('')
  return `<g class="map-hud-overlay" pointer-events="none">${texts}</g>`
}

export const serializeHudSnapshot = (snapshot: HudSnapshot): string =>
  JSON.stringify(snapshot)

export const parseHudSnapshot = (svg: string): HudSnapshot | null => {
  const match = svg.match(
    new RegExp(`<metadata[^>]*id="${HUD_SNAPSHOT_METADATA_ID}"[^>]*data-json="([^"]*)"`, 'u'),
  )
  if (!match?.[1]) return null
  try {
    const parsed = JSON.parse(
      match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
    ) as Partial<HudSnapshot>
    if (
      typeof parsed.destinationName !== 'string' ||
      typeof parsed.visitedCount !== 'number' ||
      typeof parsed.totalCountries !== 'number'
    ) {
      return null
    }
    return {
      destinationName: parsed.destinationName,
      visitedCount: parsed.visitedCount,
      totalCountries: parsed.totalCountries,
    }
  } catch {
    return null
  }
}

export const stripHudOverlay = (svg: string): string =>
  svg.replace(/<g class="map-hud-overlay"[^>]*>[\s\S]*?<\/g>/u, '')

export const injectHudOverlay = (svg: string, items: HudTextItem[]): string => {
  const withoutHud = stripHudOverlay(svg)
  const hud = hudItemsToSvgGroup(items)
  const close = withoutHud.lastIndexOf('</svg>')
  if (close < 0) return `${withoutHud}${hud}`
  return `${withoutHud.slice(0, close)}${hud}${withoutHud.slice(close)}`
}

export const embedHudSnapshot = (svg: string, snapshot: HudSnapshot): string => {
  const json = escapeXml(serializeHudSnapshot(snapshot))
  const tag = `<metadata id="${HUD_SNAPSHOT_METADATA_ID}" data-json="${json}"></metadata>`
  const withoutMeta = svg.replace(
    new RegExp(`<metadata[^>]*id="${HUD_SNAPSHOT_METADATA_ID}"[^>]*>\\s*</metadata>`, 'u'),
    '',
  )
  if (withoutMeta.includes('<defs')) {
    return withoutMeta.replace('<defs', `${tag}<defs`)
  }
  return withoutMeta.replace(/<svg([^>]*)>/u, `<svg$1>${tag}`)
}
