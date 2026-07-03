/**
 * compress-png.mjs —— TinyPNG 式 PNG 压缩(有损调色板量化,感观基本不变)
 *
 * 原理:TinyPNG 的核心是「把图量化到最优 ≤256 色调色板 + 抖动,并保留 8-bit alpha」。
 * 本脚本按优先级选择压缩器:
 *   1. pngquant(若已安装,PATH 可调用)—— 与 TinyPNG 同源,质量/压缩率最佳,对
 *      照片级背景(bg / 弹窗)也有效;
 *   2. upng-js(纯 JS 回退,`npm i` 于 tools/ 即可)—— 对精灵帧效果好,无需装原生工具;
 * 并且**只有当压缩结果更小时才覆盖原文件**(skip-if-larger),绝不劣化。
 *
 * 用法(项目根目录):
 *   node tools/compress-png.mjs                 # 压缩 assets/fish-game/textures 下全部 PNG
 *   node tools/compress-png.mjs <目录>          # 压缩指定目录
 *   PNG_QUALITY=60-90 node tools/compress-png.mjs   # 调整 pngquant 质量区间(默认 65-95,越低越小)
 *
 * 依赖:
 *   - 最佳:安装 pngquant(mac: `brew install pngquant`;Windows: 官网/scoop;Linux: `apt install pngquant`)
 *   - 回退:`cd tools && npm i`(安装 upng-js)
 *
 * 注意:量化不改变图片尺寸与透明区域,manifest 无需重算;但仍建议压缩后跑一次
 *       `node tools/gen-manifest.mjs` 做校验。
 */
import { readdirSync, statSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DEFAULT_DIR = join(ROOT, 'assets', 'fish-game', 'textures')
const QUALITY = process.env.PNG_QUALITY || '65-95'

const targetDir = process.argv[2] ? join(process.cwd(), process.argv[2]) : DEFAULT_DIR

function listPngs(dir) {
  let out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) out = out.concat(listPngs(p))
    else if (name.toLowerCase().endsWith('.png')) out.push(p)
  }
  return out
}

// ── 压缩器 1:pngquant(命令行工具)────────────────────────────────
// 依次尝试:PATH 上的 pngquant(brew/apt 安装)→ npm 的 pngquant-bin(自带二进制)。
// 注意:npm 的 `pngquant` 包是流式包装库、不是命令行工具,无法直接调用。
function resolvePngquantBin() {
  try { if (spawnSync('pngquant', ['--version']).status === 0) return 'pngquant' } catch { /* not on PATH */ }
  try {
    const bin = require('pngquant-bin')
    if (bin && spawnSync(bin, ['--version']).status === 0) return bin
  } catch { /* pngquant-bin 未安装 */ }
  return null
}
const pngquantBin = resolvePngquantBin()
function compressPngquant(buf) {
  // 从 stdin 读、stdout 写;质量不达标时 pngquant 退出码 99 且无输出 → 返回 null
  const r = spawnSync(pngquantBin, [`--quality=${QUALITY}`, '--strip', '--speed', '1', '-'], {
    input: buf, maxBuffer: 1 << 30,
  })
  return r.status === 0 && r.stdout && r.stdout.length > 0 ? r.stdout : null
}

// ── 压缩器 2:upng-js(纯 JS 回退)──────────────────────────────────
let UPNG = null
function loadUPNG() {
  if (UPNG !== null) return UPNG
  try { UPNG = require('upng-js') } catch { UPNG = false }
  return UPNG
}
function compressUPNG(buf) {
  const U = loadUPNG()
  if (!U) return null
  try {
    const img = U.decode(buf)
    const rgba = U.toRGBA8(img)[0]
    return Buffer.from(U.encode([rgba], img.width, img.height, 256)) // 256 色量化
  } catch { return null }
}

// ── 主流程 ─────────────────────────────────────────────────────────
const usePngquant = !!pngquantBin
const hasUPNG = !!loadUPNG()
if (!usePngquant && !hasUPNG) {
  console.error('未找到压缩器。请 `brew install pngquant`(或安装 pngquant-bin),或在 tools/ 执行 `npm i` 安装 upng-js 回退。')
  process.exit(1)
}
if (usePngquant) {
  console.log(`压缩器:pngquant @ ${pngquantBin}(quality=${QUALITY})  目录:${targetDir}`)
} else {
  console.log('压缩器:upng-js(256 色)回退')
  console.log('  提示:未找到 pngquant 命令行工具。npm 的 `pngquant` 包不是 CLI;请 `brew install pngquant`,')
  console.log('        或 `cd tools && npm i pngquant-bin`(自带二进制),即可自动启用效果更好的 pngquant。')
  console.log(`  目录:${targetDir}`)
}

const files = listPngs(targetDir)
let before = 0, after = 0, changed = 0, skipped = 0
for (const f of files) {
  const src = readFileSync(f)
  before += src.length
  const candidate = (usePngquant ? compressPngquant(src) : null) ?? compressUPNG(src)
  if (candidate && candidate.length < src.length) {
    writeFileSync(f, candidate)
    after += candidate.length
    changed++
  } else {
    after += src.length
    skipped++
  }
}

const pct = before > 0 ? (100 - after / before * 100).toFixed(1) : '0'
console.log(`共 ${files.length} 张 | 替换 ${changed} | 跳过(未变小)${skipped}`)
console.log(`总体积:${(before / 1048576).toFixed(2)}MB → ${(after / 1048576).toFixed(2)}MB (${pct}% ↓)`)
