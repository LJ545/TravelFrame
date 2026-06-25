import type { FastifyPluginAsync } from 'fastify'
import { fetchWeatherForCity } from '../services/weather.js'

//so that auto refresh and webapp can use the same endpoint
export const weatherRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { city?: string } }>('/api/weather', async (request, reply) => {
    const city = (request.query.city ?? '').trim()
    if (!city) {
      reply.code(400).send({ error: 'missing_city' })
      return
    }

    let weather: Awaited<ReturnType<typeof fetchWeatherForCity>>
    try {
      weather = await fetchWeatherForCity(city)
    } catch (err) {
      app.log.warn({ err, city }, 'weather: upstream fetch failed')
      reply.code(502).send({ error: 'upstream_failed' })
      return
    }
    if (!weather) {
      reply.code(404).send({ error: 'geocode_or_weather_not_found' })
      return
    }
    return weather
  })
}
