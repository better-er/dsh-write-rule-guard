/**
 * 构建脚本：esbuild 打包 host 半身。
 *
 * host 半身 src/index.ts 无外部运行时依赖，用 esbuild 转译打包成
 * lib/index.js。已去掉浏览器 client 半身与 CSS 相关依赖，回归 host 单半身。
 *
 * 前置：npm install 拉 esbuild 到 ./node_modules。
 */
import { build, context } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const watch = process.argv.includes('--watch')

/** 让 esbuild 从本插件 node_modules 解析依赖。 */
const nodePaths = [fileURLToPath(new URL('./node_modules', import.meta.url))]

const hostOptions = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  nodePaths,
  outfile: 'lib/index.js',
  sourcemap: true,
  logLevel: 'info',
  // 保留 UTF-8 源码字符，默认 ascii 会把中文注释/字符串转成 unicode 转义，产物难读
  charset: 'utf8',
}

await mkdir('lib', { recursive: true })
if (watch) {
  const ctx = await context(hostOptions)
  await ctx.watch()
  console.log('[build] watching src/index.ts ...')
} else {
  await build(hostOptions)
}
