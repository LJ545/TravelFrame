import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

//font generation script ttf

const require = createRequire(import.meta.url)
const wawoff2 = require('wawoff2')

const coolvariable = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(coolvariable, '../assets/fonts')

const sources = [
  { pkg: '@fontsource/orbitron', pattern: /^orbitron-latin-(400|700|800)-normal\.woff2$/ },
  { pkg: '@fontsource/archivo-black', pattern: /^archivo-black-latin-400-normal\.woff2$/ },
  { pkg: '@fontsource/noto-sans-symbols-2', pattern: /^noto-sans-symbols-2-symbols-400-normal\.woff2$/ },
]

const run = async () => {
  fs.mkdirSync(outDir, { recursive: true })
  for (const { pkg, pattern } of sources) {
    const filesDir = path.join(path.dirname(require.resolve(`${pkg}/package.json`)), 'files')
    const matches = fs.readdirSync(filesDir).filter((name) => pattern.test(name))
    if (matches.length === 0) {
      throw new Error(`no woff2 files matched for ${pkg} in ${filesDir}`)
    }
    for (const name of matches) {
      const woff2 = fs.readFileSync(path.join(filesDir, name))
      const ttf = await wawoff2.decompress(woff2)
      fs.writeFileSync(path.join(outDir, name.replace(/\.woff2$/, '.ttf')), Buffer.from(ttf))
    }
  }
}

run().catch((err) => {
  console.error('generate-fonts failed:', err)
  process.exit(1)
})
