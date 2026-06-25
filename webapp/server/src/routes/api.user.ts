import type { FastifyPluginAsync } from 'fastify'
import {
  apiPaths,
  type DeviceLookupResponse,
  type ImageUploadResponse,
  type TemplateUploadResponse,
  type UserState,
} from '@travelframe/contracts'
import type { DeviceRegistry } from '../store/devices.js'
import type { UserStateStore } from '../store/userState.js'
import { userStateSchema } from '../store/userState.js'
import type { ImageStore } from '../store/image.js'
import type { TemplateStore } from '../store/template.js'

interface Deps {
  registry: DeviceRegistry
  userState: UserStateStore
  image: ImageStore
  template: TemplateStore
  templateMaxBytes: number
}

//user facing api
export const userRoutes = (deps: Deps): FastifyPluginAsync =>
  async (app) => {
    //check that serial is registered
    app.addHook('preHandler', app.requireRegisteredSerial)

    app.get<{ Params: { serial: string } }>(
      apiPaths.device(':serial'),
      async (request): Promise<DeviceLookupResponse> => {
        const record = request.deviceRecord!
        return {
          serial: record.serial,
          label: record.label,
          createdAt: record.createdAt,
        }
      },
    )

    app.get<{ Params: { serial: string } }>(
      apiPaths.deviceState(':serial'),
      async (request): Promise<UserState> => {
        return deps.userState.get(request.deviceSerial!)
      },
    )

    app.put<{ Params: { serial: string } }>(
      apiPaths.deviceState(':serial'),
      async (request, reply): Promise<UserState | undefined> => {
        const parsed = userStateSchema.safeParse(request.body ?? {})
        if (!parsed.success) {
          reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues })
          return
        }
        return deps.userState.put(request.deviceSerial!, parsed.data)
      },
    )

    app.put<{ Params: { serial: string } }>(
      apiPaths.deviceImage(':serial'),
      async (request, reply): Promise<ImageUploadResponse | undefined> => {
        const body = request.body
        if (!Buffer.isBuffer(body)) {
          reply
            .code(415)
            .send({ error: 'unsupported_media_type', expected: 'image/bmp or application/octet-stream' })
          return
        }
        if (body.length === 0) {
          reply.code(400).send({ error: 'empty_body' })
          return
        }
        if (!isLikelyBmp(body)) {
          reply.code(400).send({ error: 'not_bmp' })
          return
        }
        const meta = await deps.image.put(request.deviceSerial!, body)
        reply.header('ETag', `"${meta.etag}"`)
        return meta
      },
    )

    app.put<{ Params: { serial: string } }>(
      apiPaths.deviceTemplate(':serial'),
      async (request, reply): Promise<TemplateUploadResponse | undefined> => {
        const body = request.body
        const text = Buffer.isBuffer(body)
          ? body.toString('utf-8')
          : typeof body === 'string'
            ? body
            : null
        if (text == null) {
          reply
            .code(415)
            .send({ error: 'unsupported_media_type', expected: 'image/svg+xml or text/plain' })
          return
        }
        if (text.length === 0) {
          reply.code(400).send({ error: 'empty_body' })
          return
        }
        if (text.length > deps.templateMaxBytes) {
          reply.code(413).send({ error: 'template_too_large' })
          return
        }
        if (!text.includes('<svg')) {
          reply.code(400).send({ error: 'not_svg' })
          return
        }
        return deps.template.put(request.deviceSerial!, text)
      },
    )
  }

//short check
const isLikelyBmp = (buf: Buffer): boolean =>
  buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4d
