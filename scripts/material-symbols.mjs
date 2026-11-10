import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)
const packageDir = dirname(require.resolve('@material-symbols/font-400/package.json'))
const definitions = await readFile(resolve(packageDir, 'index.d.ts'), 'utf8')
const knownIcons = new Set([...definitions.matchAll(/"([a-z0-9_]+)"/g)].map(match => match[1]))
const usedIcons = new Set()

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      await scan(path)
    }
    else if (/\.(?:vue|ts)$/.test(entry.name)) {
      const source = await readFile(path, 'utf8')
      // Include all matching tokens so dynamic icon maps and template branches are covered.
      for (const [token] of source.matchAll(/\b[a-z0-9_]+\b/g)) {
        if (knownIcons.has(token))
          usedIcons.add(token)
      }
    }
  }
}

await scan(resolve(root, 'src'))
const icons = [...usedIcons].sort()
const fontPath = resolve(root, 'src/assets/fonts/material-symbols-rounded.woff2')
const manifestPath = resolve(root, 'src/assets/fonts/material-symbols.json')

if (process.argv.includes('--update')) {
  const url = new URL('https://fonts.googleapis.com/css2')
  url.searchParams.set('family', 'Material Symbols Rounded:opsz,wght@24,400')
  url.searchParams.set('icon_names', icons.join(','))
  url.searchParams.set('display', 'block')
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36' },
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok)
    throw new Error(`Font CSS request failed: ${response.status}`)
  const css = await response.text()
  const fontUrl = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/)?.[1]
  if (!fontUrl)
    throw new Error('Font response did not contain a Google Fonts asset')
  const fontResponse = await fetch(fontUrl, { signal: AbortSignal.timeout(30000) })
  if (!fontResponse.ok)
    throw new Error(`Font download failed: ${fontResponse.status}`)
  const font = Buffer.from(await fontResponse.arrayBuffer())
  if (font.toString('ascii', 0, 4) !== 'wOF2')
    throw new Error('Expected a WOFF2 font')
  await writeFile(fontPath, font)
  await writeFile(resolve(root, 'src/assets/fonts/LICENSE.txt'), await readFile(resolve(packageDir, 'LICENSE')))
  await writeFile(manifestPath, `${JSON.stringify({ icons, sha256: createHash('sha256').update(font).digest('hex') }, null, 2)}\n`)
  console.log(`Updated Material Symbols: ${icons.length} icons, ${font.length} bytes`)
}
else {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const missing = icons.filter(icon => !manifest.icons.includes(icon))
  if (missing.length)
    throw new Error(`Run pnpm icons:update to include new icons: ${missing.join(', ')}`)
  const font = await readFile(fontPath)
  if (createHash('sha256').update(font).digest('hex') !== manifest.sha256)
    throw new Error('Material Symbols font does not match its manifest; run pnpm icons:update')
  console.log(`Material Symbols verified: ${manifest.icons.length} icons, ${font.length} bytes`)
}
