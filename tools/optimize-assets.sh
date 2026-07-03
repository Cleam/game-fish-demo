#!/usr/bin/env bash
# optimize-assets.sh —— 一次性资源瘦身(需要 ImageMagick `convert`/`mogrify`)
#
# 作用:
#   1. 裁掉 hero/npc/boss 全部帧的透明留白(mogrify -trim),大幅降低纹理/GPU 内存并利于打图集;
#   2. 重压缩 UI 大图(-strip 去冗余元数据)、下采样超大背景;
#   3. 删除未使用的 UI 图(as1 / boss)。
# 处理后务必运行:node tools/gen-manifest.mjs 重新生成 manifest(锚点随裁剪自洽更新,视觉不变)。
#
# 用法(项目根目录):bash tools/optimize-assets.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEX="$ROOT/assets/fish-game/textures"

# ImageMagick 7 用 `magick`,6 用 `convert`/`mogrify`;优先 magick 以消除弃用告警
if command -v magick >/dev/null 2>&1; then
  CONVERT=(magick); MOGRIFY=(magick mogrify)
else
  CONVERT=(convert); MOGRIFY=(mogrify)
fi

echo "[1/3] 裁剪帧透明留白..."
for d in hero/lv0 hero/lv30 hero/lv60 hero/lv90 hero/lv120 hero/end hero/move boss \
         npc/01 npc/02 npc/03 npc/04 npc/05; do
  [ -d "$TEX/$d" ] && "${MOGRIFY[@]}" -trim +repage -strip -define png:compression-level=9 "$TEX/$d"/*.png
done

echo "[2/3] 压缩 UI 大图..."
"${CONVERT[@]}" "$TEX/ui/as2.png"       -strip -define png:compression-level=9 "$TEX/ui/as2.png"
"${CONVERT[@]}" "$TEX/ui/bg.png"        -resize 1664x1024 -strip -define png:compression-level=9 "$TEX/ui/bg.png"
"${CONVERT[@]}" "$TEX/ui/modal_win.png" -strip -define png:compression-level=9 "$TEX/ui/modal_win.png"

echo "[3/3] 移除未使用 UI 图(as1 / boss)..."
rm -f "$TEX/ui/as1.png" "$TEX/ui/as1.png.meta" "$TEX/ui/boss.png" "$TEX/ui/boss.png.meta"

echo "完成。请运行: node tools/gen-manifest.mjs"
du -sh "$TEX"
