/**
 * gen-manifest.mjs —— 离线生成 fish-game bundle 的帧清单与 trim/锚点数据
 *
 * 用法(在项目根目录执行):
 *   node tools/gen-manifest.mjs
 *
 * 逻辑与源 Phaser 项目 scripts/gen-manifest.js 一致(纯 Node 解析 PNG 计算可见包围盒、
 * 中心锚点、嘴部锚点),仅适配 Cocos bundle 目录结构:
 *   - 扫描 assets/fish-game/textures/
 *   - hero/lv* 仅收录 atk 帧;hero/end 收录 idle;hero/move 收录 move(不计算 trim)
 *   - npc/0* 仅收录 idle;boss/ 收录全部帧;textures/ui/*.png 作为 UI 图
 *   - key 使用相对 textures/ 的路径(去 .png 后缀),供 Cocos SpriteFrame 映射
 *   - 输出 assets/fish-game/data/manifest.json
 * 当 textures/ 下的美术资源发生增删时,重新运行本脚本即可。
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { dirname, extname, join } from 'path'
import { fileURLToPath } from 'url'
import { inflateSync } from 'zlib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const TEX = join(ROOT, 'assets', 'fish-game', 'textures')
const OUT = join(ROOT, 'assets', 'fish-game', 'data', 'manifest.json')

const HERO_LEVELS = ['lv0', 'lv30', 'lv60', 'lv90', 'lv120']
const NPC_WAVES = ['01', '02', '03', '04', '05']
const SKIP = new Set(['Thumbs.db', '.DS_Store', 'desktop.ini'])

const safeReadDir = (d) => { try { return readdirSync(d).filter(f => !SKIP.has(f)) } catch { return [] } }
const isDir = (p) => { try { return statSync(p).isDirectory() } catch { return false } }
const isFile = (p) => { try { return statSync(p).isFile() } catch { return false } }
const naturalSort = (a) => [...a].sort((x, y) => x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' }))
const toKey = (abs) => abs.slice(TEX.length + 1).replace(/\\/g, '/').replace(/\.png$/i, '')

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

function parsePngTrim(filePath) {
  const buf = readFileSync(filePath)
  if (!buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error(`不是合法 PNG: ${filePath}`)
  let offset = 8, width = 0, height = 0, bitDepth = 8, colorType = 6
  const idat = []; let transparency = null
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset)
    const type = buf.toString('ascii', offset + 4, offset + 8)
    const data = buf.subarray(offset + 8, offset + 8 + length)
    offset += 12 + length
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data.readUInt8(8); colorType = data.readUInt8(9) }
    else if (type === 'tRNS') transparency = data
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
  }
  if (colorType === 3 && bitDepth !== 8) throw new Error(`暂不支持非 8-bit 索引 PNG: ${filePath}`)
  if (colorType !== 3 && bitDepth !== 8) throw new Error(`暂不支持非 8-bit PNG: ${filePath}`)
  let bpp = 4
  if (colorType === 2) bpp = 3
  else if (colorType === 3) bpp = 1
  else if (colorType !== 6) throw new Error(`暂不支持 colorType=${colorType}: ${filePath}`)
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * bpp
  const pixels = Buffer.alloc(height * stride)
  let src = 0, dst = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[src++]
    for (let x = 0; x < stride; x++) {
      const byte = raw[src++]
      const left = x >= bpp ? pixels[dst + x - bpp] : 0
      const up = y > 0 ? pixels[dst + x - stride] : 0
      const upLeft = y > 0 && x >= bpp ? pixels[dst + x - stride - bpp] : 0
      switch (filter) {
        case 0: pixels[dst + x] = byte; break
        case 1: pixels[dst + x] = (byte + left) & 255; break
        case 2: pixels[dst + x] = (byte + up) & 255; break
        case 3: pixels[dst + x] = (byte + Math.floor((left + up) / 2)) & 255; break
        case 4: pixels[dst + x] = (byte + paeth(left, up, upLeft)) & 255; break
        default: throw new Error(`未知 PNG filter=${filter}: ${filePath}`)
      }
    }
    dst += stride
  }
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * bpp
      let alpha = 255
      if (colorType === 6) alpha = pixels[idx + 3]
      else if (colorType === 3) { const pi = pixels[idx]; alpha = transparency && pi < transparency.length ? transparency[pi] : 255 }
      if (alpha > 0) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y }
    }
  }
  if (maxX < 0 || maxY < 0) { minX = 0; minY = 0; maxX = width - 1; maxY = height - 1 }
  const bw = maxX - minX + 1, bh = maxY - minY + 1
  const cx = minX + bw / 2, cy = minY + bh / 2
  const mouthX = minX + bw * 0.88, mouthY = minY + bh * 0.48
  return {
    sourceWidth: width, sourceHeight: height,
    bounds: { x: minX, y: minY, width: bw, height: bh },
    renderOffset: { x: cx - width / 2, y: cy - height / 2 },
    centerAnchor: { x: cx / width, y: cy / height },
    mouthAnchor: { x: mouthX / width, y: mouthY / height },
  }
}

const manifest = { version: 2, heroesByLevel: {}, heroEnd: [], heroMove: [], npcWaves: {}, boss: { frames: [] }, trimData: {}, ui: {} }

const uiDir = join(TEX, 'ui')
for (const f of safeReadDir(uiDir)) {
  const full = join(uiDir, f)
  if (isFile(full) && extname(f).toLowerCase() === '.png') manifest.ui[f.replace(/\.png$/i, '')] = toKey(full)
}

for (const level of HERO_LEVELS) {
  const dir = join(TEX, 'hero', level)
  if (!isDir(dir)) continue
  const frames = naturalSort(safeReadDir(dir).filter(n => n.toLowerCase().endsWith('.png') && n.includes('-atk_')).map(n => join(dir, n)))
  manifest.heroesByLevel[level] = { atk: frames.map(toKey) }
  for (const fp of frames) manifest.trimData[toKey(fp)] = parsePngTrim(fp)
}

const endDir = join(TEX, 'hero', 'end')
if (isDir(endDir)) {
  const frames = naturalSort(safeReadDir(endDir).filter(n => n.toLowerCase().endsWith('.png') && n.includes('-idle_')).map(n => join(endDir, n)))
  manifest.heroEnd = frames.map(toKey)
  for (const fp of frames) manifest.trimData[toKey(fp)] = parsePngTrim(fp)
}

const moveDir = join(TEX, 'hero', 'move')
if (isDir(moveDir)) {
  const frames = naturalSort(safeReadDir(moveDir).filter(n => n.toLowerCase().endsWith('.png') && n.includes('-move_')).map(n => join(moveDir, n)))
  manifest.heroMove = frames.map(toKey)
}

for (const wave of NPC_WAVES) {
  const dir = join(TEX, 'npc', wave)
  if (!isDir(dir)) continue
  const frames = naturalSort(safeReadDir(dir).filter(n => n.toLowerCase().endsWith('.png') && n.includes('-idle_')).map(n => join(dir, n)))
  manifest.npcWaves[wave] = { idle: frames.map(toKey) }
  for (const fp of frames) manifest.trimData[toKey(fp)] = parsePngTrim(fp)
}

const bossDir = join(TEX, 'boss')
if (isDir(bossDir)) {
  const frames = naturalSort(safeReadDir(bossDir).filter(n => n.toLowerCase().endsWith('.png')).map(n => join(bossDir, n)))
  manifest.boss.frames = frames.map(toKey)
  for (const fp of frames) manifest.trimData[toKey(fp)] = parsePngTrim(fp)
}

writeFileSync(OUT, JSON.stringify(manifest), 'utf8')
const heroFrames = Object.values(manifest.heroesByLevel).reduce((s, i) => s + i.atk.length, 0)
const npcFrames = Object.values(manifest.npcWaves).reduce((s, i) => s + i.idle.length, 0)
console.log(`[gen-manifest] heroAtk=${heroFrames} heroEnd=${manifest.heroEnd.length} heroMove=${manifest.heroMove.length} npc=${npcFrames} boss=${manifest.boss.frames.length} ui=${Object.keys(manifest.ui).length} trim=${Object.keys(manifest.trimData).length}`)
console.log(`[gen-manifest] 输出 → ${OUT}`)
