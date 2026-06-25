import cron from 'node-cron'
import type { FastifyBaseLogger } from 'fastify'
import type { ImageStore } from '../store/image.js'
import type { TemplateStore } from '../store/template.js'
import type { UserStateStore } from '../store/userState.js'
import { fetchWeatherForCity } from './weather.js'
import { renderTemplateToBmp, resolveHudInputs } from './renderTemplate.js'

//every hour the server will refresh the bmp with the current weather and etd days using a cron job

export interface AutoRefreshDeps {
  userState: UserStateStore
  template: TemplateStore
  image: ImageStore
  logger: FastifyBaseLogger
}

const HOURLY_CRON = '0 * * * *'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export const scheduleAutoRefresh = (deps: AutoRefreshDeps): { stop: () => void; runNow: () => Promise<void> } => {
  const task = cron.schedule(
    HOURLY_CRON,
    () => {
      runRefresh(deps).catch((err) => {
        deps.logger.error({ err }, 'auto-refresh: scheduled run failed')
      })
    },
    { timezone: 'UTC' },
  )
  return {
    stop: () => task.stop(),
    runNow: () => runRefresh(deps),
  }
}

const runRefresh = async (deps: AutoRefreshDeps): Promise<void> => {
  const serial = 'XXXXXXXX'

  deps.logger.info('auto-refresh: starting hourly run')
  const template = await deps.template.get(serial)
  if (!template) {
    deps.logger.debug({ serial }, 'auto-refresh: no template stored, skipping')
    return
  }
  const state = await deps.userState.get(serial)
  const destinationName = state.nextDestination.name?.trim() ?? ''

  let weatherTemp = '--°C'
  let weatherIcon = '○'
  if (destinationName) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const weather = await fetchWeatherForCity(destinationName)
        if (weather) {
          weatherTemp = `${Math.round(weather.tempC)}°C`
          weatherIcon = weather.icon
        }
        break 
      } 
      catch (err) {
        if (attempt === 3) {
          deps.logger.warn(
            { err, serial, destinationName, attempts: attempt },
            'auto-refresh: weather fetch failed after 3 attempts',
          )
        } else {
          await sleep(1000)
        }
      }
    }
  }

  const daysUntil = computeDaysUntil(state.nextDestination.date)
  const inputs = resolveHudInputs(
    template,
    {
      etdDays: daysUntil != null ? String(daysUntil) : '---',
      weatherTemp,
      weatherIcon,
    },
    {
      destinationName: (state.nextDestination.name || '—').toUpperCase(),
      visitedCount: state.visited.length,
      totalCountries: 249,
    },
  )

  const bytes = renderTemplateToBmp(template, inputs)
  const meta = await deps.image.put(serial, bytes)
  deps.logger.info(
    { serial, bytes: meta.bytes, etag: meta.etag, etdDays: inputs.etdDays, tempC: weatherTemp },
    'auto-refresh: device updated',
  )
}

const computeDaysUntil = (isoDate: string): number | null => {
  if (!isoDate) return null
  const target = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(target.getTime())) return null
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = target.getTime() - startOfToday.getTime()
  return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)))
}
