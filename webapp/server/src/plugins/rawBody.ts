import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'

interface Options {
  imageMaxBytes: number
  templateMaxBytes: number
}

type ParserDone = (err: Error | null, body?: Buffer | string) => void

const rawBodyPluginImpl: FastifyPluginAsync<Options> = async (
  app: FastifyInstance,
  opts,
) => {
  const rejectIfTooLarge = (length: number, maxBytes: number, done: ParserDone) => {
    if (length > maxBytes) {
      const err = new Error(`payload too large (${length} > ${maxBytes})`) as Error & {
        statusCode?: number
      }
      err.statusCode = 413
      done(err)
      return true
    }
    return false
  }

  const imageParser = (
    _req: Parameters<Parameters<FastifyInstance['addContentTypeParser']>[2]>[0],
    body: Buffer | string,
    done: ParserDone,
  ) => {
    const length = typeof body === 'string' ? Buffer.byteLength(body, 'utf-8') : body.length
    if (rejectIfTooLarge(length, opts.imageMaxBytes, done)) return
    done(null, body)
  }

  const templateParser = (
    _req: Parameters<Parameters<FastifyInstance['addContentTypeParser']>[2]>[0],
    body: Buffer | string,
    done: ParserDone,
  ) => {
    const length = typeof body === 'string' ? Buffer.byteLength(body, 'utf-8') : body.length
    if (rejectIfTooLarge(length, opts.templateMaxBytes, done)) return
    done(null, body)
  }

  app.addContentTypeParser('image/bmp', { parseAs: 'buffer' }, imageParser)
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, imageParser)
  app.addContentTypeParser('image/svg+xml', { parseAs: 'string' }, templateParser)
  app.addContentTypeParser('text/plain', { parseAs: 'string' }, templateParser)
}

export const rawBodyPlugin = fp(rawBodyPluginImpl, {
  name: 'travelframe-raw-body',
  fastify: '5.x',
})
