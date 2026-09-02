# dsh-write-rule-guard

禁止在 edit / write 写入内容里出现匹配配置正则的字符。工具真正执行前直接拦截并报错；默认理由只说被用户拦截、不透露匹配条件，仅追加违规所在的行号。同一回合内一旦命中被拦，后续的 pwsh 也会一并拦截并复用同一理由，防止改用 pwsh 绕过写文件。

默认正则是匹配全角圆括号，可在 cordis 配置文件里改成任意正则并自定义报错文案。标准可安装 dsh 插件，host 单半身，设置经 cordis 配置文件注入，不提供界面配置 UI。

## 工作方式

host 半身 lib/index.js 在 tools/pre-execute 瀑布里拦截 edit / write 的写入内容，按配置的 enabled / rules 逐条检查。拦截逻辑在工具执行最前面，按规则拦 edit / write，以及同一回合内锁存后的 pwsh。

## 配置

插件通过 cordis 配置注入，默认 enabled: true；未配置 rules 时回退内置默认，即一条匹配全角圆括号的规则。

| 键 | 默认 | 说明 |
| --- | --- | --- |
| enabled | true | 是否启用拦截 |
| rules | 单条匹配全角圆括号的默认规则 | 规则列表，每条含 enabled / pattern / message |

rules 缺省即启用默认单条规则；配置了 rules 后完全按配置执行，每条规则独立检查、任一命中即拦，多条命中时各规则报错文案叠加。

配置示例，等价于默认行为，可在此基础上增删规则：

```yaml
plugins:
  dsh-write-rule-guard:
    enabled: true
    rules:
      - enabled: true
        pattern: '[\uFF08\uFF09]'
        message: 本次写入未遵循用户偏好，已被用户拒绝写入。
```

pattern 支持任意合法正则；若某条 pattern 是非法正则，该条保守放行不阻断。message 支持 {file}、{count}、{pattern} 占位符，违规所在的行号自动追加到文案末尾。

## 拦截范围

- 工具：常态只拦 edit 和 write；同一回合内一旦命中被拦，后续的 pwsh 也一并拦截并复用同一理由，回合结束自动解除。
- 字段：edit 的 new_string、write 的 content，即写入文件的新内容。
- 场景：全局所有会话生效，run_code 内嵌的 edit / write 子调用同样被捕获。

## 安装

**从 GitHub 安装**：源码在 src/，lib/ 不入仓库，安装时 npm 会触发 prepare 脚本现场构建。

```powershell
dsh plugin --profile web add github:better-er/dsh-write-rule-guard
```

**从 npm 安装**：包内已含构建产物 lib/index.js，安装时不再构建。

```powershell
dsh plugin --profile web add dsh-write-rule-guard
```

两种方式装完都会自动挂载，重启 DSH web 后启用，无需手工编辑任何文件。

## 卸载

```powershell
dsh plugin --profile web remove dsh-write-rule-guard
```

彻底移除，重启 DSH web 后不再加载。

## 构建

源码为 TypeScript，host 半身 src/index.ts，用 esbuild 打包到 lib/index.js。host 产物无外部运行时依赖，esbuild 仅作 devDependency。

```bash
npm install
npm run build   # 生成 lib/index.js
npm run watch   # 监听 src/index.ts 增量重建
```

## 导出

- compilePattern(pattern)：编译用户正则，非法时返回 null。
- findMatches(content, pattern)：扫描文本，返回匹配位置清单。
- fillMessage(template, ctx)：替换报错文案占位符。
- buildReason(message, file, hits, pattern)：构造拒绝原因。
