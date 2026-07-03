#!/usr/bin/env bash
# build-assets.sh —— fish-game 资源一键处理流水线
#
# 顺序:裁剪透明留白/压缩大图 → TinyPNG 式量化压缩 → 重算 manifest。
# 适用场景:美术资源(textures/ 下)有增删或重新导出后,一条命令完成瘦身与清单更新。
#
# 用法(项目根目录):bash tools/build-assets.sh
#
# 依赖:
#   - ImageMagick(convert / mogrify)—— 第 1 步裁剪/压缩;
#   - 压缩器:pngquant(推荐)或 upng-js(`cd tools && npm i` 安装回退)—— 第 2 步;
#   - Node —— 第 2、3 步。
#
# 幂等性:各步对已处理资源基本幂等(裁剪无可裁则跳过、压缩 skip-if-larger);
#         但「量化压缩」不建议反复叠加运行,正常执行一次即可。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==================================================="
echo " fish-game 资源流水线"
echo "==================================================="

echo ""
echo "▶ [1/3] 裁剪留白 + 压缩 UI 大图"
if command -v mogrify >/dev/null 2>&1; then
  bash tools/optimize-assets.sh
else
  echo "  ⚠ 未检测到 ImageMagick,跳过裁剪步骤(仅影响首次瘦身)。"
fi

echo ""
echo "▶ [2/3] TinyPNG 式量化压缩"
node tools/compress-png.mjs

echo ""
echo "▶ [3/3] 重算 manifest"
node tools/gen-manifest.mjs

echo ""
echo "✔ 完成。请回编辑器让其重新导入被覆盖的图片。"
du -sh "$ROOT/assets/fish-game/textures"
