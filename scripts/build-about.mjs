// Builds responsive AVIF/WebP for the /about page. Run: npm run assets:about
// Real photos come from ./assets/<slot>.(jpg|jpeg|png|webp); missing ones fall back to stand-ins.
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

const SLOTS = ['about-hero', 'about-vision-grid', 'about-building', 'about-origin', 'about-partners']
const STANDINS = 'assets-src/standins'
const OUT = 'public/about'
const WIDTHS = [800, 1400, 2000]
const EXT = ['jpg', 'jpeg', 'png', 'webp']

const find = (dir, slot) => EXT.map((e) => path.join(dir, `${slot}.${e}`)).find((p) => fs.existsSync(p))

fs.rmSync(OUT, { recursive: true, force: true }) // drop variants of retired slots
fs.mkdirSync(OUT, { recursive: true })
const manifest = {}

for (const slot of SLOTS) {
  const real = find('assets', slot)
  const src = real ?? find(STANDINS, slot)
  if (!src) {
    manifest[slot] = null
    continue
  }
  const meta = await sharp(src).rotate().metadata()
  const widths = WIDTHS.filter((w) => w < meta.width).concat(Math.min(meta.width, 2400))
  const uniq = [...new Set(widths)]
  for (const w of uniq) {
    const pipe = sharp(src).rotate().resize({ width: w })
    await pipe.clone().avif({ quality: 52, effort: 4 }).toFile(`${OUT}/${slot}-${w}.avif`)
    await pipe.clone().webp({ quality: 80 }).toFile(`${OUT}/${slot}-${w}.webp`)
  }
  manifest[slot] = { widths: uniq, width: meta.width, height: meta.height, standIn: !real }
  console.log(`${slot}: ${real ? 'photo' : 'STAND-IN'} ${meta.width}x${meta.height} -> ${uniq.join(', ')}`)
}

fs.writeFileSync('src/aboutImages.json', JSON.stringify(manifest, null, 2) + '\n')
