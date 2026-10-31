import { defineConfig } from 'tsdown'

/** 浏览器半身的外部依赖：由 shell 的单例模块表提供，不能打进 bundle。 */
const CLIENT_EXTERNALS = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-primitives',
  'react',
  'react/jsx-runtime',
]
const ID = 'dsh-write-rule-guard'

export default defineConfig([
  {
    name: `${ID}/lib`,
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: true,
    clean: false,
    sourcemap: true,
    deps: {
      // schemastery 由 dsh 安装提供，作为 peer 在运行时解析，不打进产物。
      neverBundle: ['@deepseek-ai/schemastery'],
    },
  },
  {
    name: `${ID}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    dts: false,
    clean: false,
    sourcemap: true,
    deps: {
      neverBundle: [...CLIENT_EXTERNALS],
      alwaysBundle: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    },
    outputOptions: {
      entryFileNames: 'client.js',
      exports: 'named',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
