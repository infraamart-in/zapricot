// Crops / compresses source imagery into /public. Run: npm run assets
import sharp from 'sharp'
import fs from 'node:fs'
import { cardMaster } from './card-master.mjs'
import { CARD_IMAGE_2D, CARD_TEXTURE } from '../src/cardSpec.ts'

const src = 'assets-src'
const out = 'public'
const finishes = ['graphite', 'titanium', 'gold', 'copper', 'midnight']

// Card finishes: one clean master per finish (exact ID-1 aspect, spec corner radius, no
// stretching; see scripts/card-master.mjs), all at the same pixel size from src/cardSpec.ts.
// Midnight's photo is assets-src/card-blue-new.png (previous one kept as card-blue-old.png).
const sources = {
  graphite: `${src}/card-graphite.webp`,
  titanium: `${src}/card-titanium.webp`,
  gold: `${src}/card-gold.webp`,
  copper: `${src}/card-copper.webp`,
  midnight: `${src}/card-blue-new.png`,
}
const masterName = (f) => (f === 'midnight' ? 'card-blue' : `card-${f}`)
fs.mkdirSync(`${src}/clean`, { recursive: true })

for (const f of finishes) {
  const m = await cardMaster(sources[f], CARD_TEXTURE)
  console.log(f.padEnd(9), JSON.stringify(m.report))
  const img = () => sharp(m.data, { raw: { width: m.width, height: m.height, channels: 4 } })
  // high-quality masters (PNG + WebP + AVIF)
  await img().png({ compressionLevel: 9 }).toFile(`${src}/clean/${masterName(f)}.png`)
  await img().webp({ quality: 92, alphaQuality: 100, exact: true }).toFile(`${src}/clean/${masterName(f)}.webp`)
  await img().avif({ quality: 70 }).toFile(`${src}/clean/${masterName(f)}.avif`)
  // 3D texture. exact: keep the card colour under the transparent corners (no dark fringe in mipmaps)
  await img().webp({ quality: 86, exact: true }).toFile(`${out}/cards/${f}.webp`)
  // flat image (fallbacks, poster, dialog): same aspect, alpha corners
  await img().resize(CARD_IMAGE_2D.width, CARD_IMAGE_2D.height, { fit: 'fill', kernel: 'lanczos3' }).webp({ quality: 82 }).toFile(`${out}/cards/${f}-2d.webp`)
}

// Brand marks: recolour the light-grey artwork to champagne + white
const mark = await sharp(`${src}/mark.webp`).trim({ threshold: 10 }).toBuffer()
const word = await sharp(`${src}/wordmark.webp`).trim({ threshold: 10 }).toBuffer()
await sharp(word).resize({ height: 96 }).png().toFile(`${out}/img/wordmark.png`)
// preloader logo (inlined into the home page HTML): white glyph, the detail lives in the alpha
{
  const logo = await sharp(word).resize({ width: 440 }).toBuffer()
  const { width, height } = await sharp(logo).metadata()
  const alpha = await sharp(logo).extractChannel(3).toBuffer()
  await sharp({ create: { width, height, channels: 3, background: '#ffffff' } }).joinChannel(alpha).webp({ lossless: true, effort: 6 }).toFile(`${out}/img/loader-logo.webp`)
}
await sharp(mark).resize(256).png().toFile(`${out}/img/mark.png`)

// Favicons: champagne mark on charcoal tile
async function favicon(size, file) {
  const inner = Math.round(size * 0.58)
  const glyph = await sharp(mark).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .tint({ r: 226, g: 196, b: 140 }).png().toBuffer()
  const r = Math.round(size * 0.22)
  const tile = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="#121214"/></svg>`)
  await sharp(tile).composite([{ input: glyph, gravity: 'center' }]).png().toFile(file)
}
await favicon(32, `${out}/favicon-32.png`)
await favicon(180, `${out}/apple-touch-icon.png`)
await favicon(192, `${out}/icon-192.png`)
await favicon(512, `${out}/icon-512.png`)
// square logo for Organization structured data (≥512px, readable on light and dark)
fs.copyFileSync(`${out}/icon-512.png`, `${out}/logo-512.png`)

// favicon.ico: PNG-compressed entries (16/32/48), supported by every current browser
{
  const sizes = [16, 32, 48]
  const pngs = []
  for (const sz of sizes) {
    const tmp = `${out}/.fav-${sz}.png`
    await favicon(sz, tmp)
    pngs.push(fs.readFileSync(tmp))
    fs.rmSync(tmp)
  }
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(sizes.length, 4)
  let offset = 6 + 16 * sizes.length
  const dir = sizes.map((sz, i) => {
    const e = Buffer.alloc(16)
    e.writeUInt8(sz === 256 ? 0 : sz, 0)
    e.writeUInt8(sz === 256 ? 0 : sz, 1)
    e.writeUInt8(0, 2)
    e.writeUInt8(0, 3)
    e.writeUInt16LE(1, 4) // colour planes
    e.writeUInt16LE(32, 6) // bits per pixel
    e.writeUInt32LE(pngs[i].length, 8)
    e.writeUInt32LE(offset, 12)
    offset += pngs[i].length
    return e
  })
  fs.writeFileSync(`${out}/favicon.ico`, Buffer.concat([header, ...dir, ...pngs]))
}

fs.writeFileSync(
  `${out}/site.webmanifest`,
  JSON.stringify(
    {
      name: 'Zapricot',
      short_name: 'Zapricot',
      description: 'One card for every EV charger. Coming soon to India.',
      start_url: '/',
      scope: '/',
      display: 'browser',
      background_color: '#0B0B0C',
      theme_color: '#0B0B0C',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    null,
    2,
  ) + String.fromCharCode(10),
)

// Open Graph images (public/og/*.jpg) are composed from the live scene + type; see README notes.

// Editorial shots used in the fallback / footer
await sharp(`${src}/shot-gold-hand.webp`).resize(900).webp({ quality: 78 }).toFile(`${out}/img/gold-hand.webp`)

console.log('assets built')
