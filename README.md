# dsh-write-rule-guard

禁止在 edit / write 写入内容里出现匹配配置正则的字符。工具真正执行前直接拦截并报错；拒绝文案完全由各规则 message 决定，填完占位符后即单行结果，不再自动追加任何明细或堆栈。同一回合内一旦命中被拦，后续的 pwsh 也会一并拦截并复用同一理由，防止改用 pwsh 绕过写文件。

默认规则经 cordis.patch.yml 随安装注入，匹配全角圆括号，也可在 cordis 配置文件里改成任意正则并自定义报错文案。代码不内置默认规则，rules 为空即不拦截。标准可安装 dsh 插件，host 单半身，设置经 cordis 配置文件注入，不提供界面配置 UI。

## 工作方式

host 半身 lib/index.js 在 tools/pre-execute 瀑布里拦截 edit / write 的写入内容，按配置的 enabled / rules 逐条检查。拦截逻辑在工具执行最前面，按规则拦 edit / write，以及同一回合内锁存后的 pwsh。

## 配置

插件通过 cordis 配置注入，默认 enabled: true。规则列表 rules 由 cordis.patch.yml 随安装带入一条匹配全角圆括号的默认规则；代码不兜底默认，rules 为空即不拦截。

| 键 | 默认 | 说明 |
| --- | --- | --- |
| enabled | true | 是否启用拦截 |
| joiner | 单个空格 | 多规则命中时拼接各规则文案的分隔符，可填空格或 \n 等，由配置决定形态 |
| rules | patch 注入的单条匹配全角圆括号的默认规则，为空则不拦截 | 规则列表，每条含 enabled / pattern / message |

安装即随 cordis.patch.yml 注入一条默认规则，可直接对照修改；rules 为空则不拦截。每条规则独立检查、任一命中即拦，缺 pattern 的条目被忽略。单条规则命中的输出即该规则 message 填占位符后的单行文本；多条命中时用顶层 joiner 拼接，不再自动追加明细。

配置示例，等价于 patch 注入的默认规则，可在此基础上增删：

```yaml
plugins:
  dsh-write-rule-guard:
    enabled: true
    joiner: ' '
    rules:
      - enabled: true
        pattern: '[\uFF08\uFF09]'
        message: 本次写入未遵循用户偏好，已被用户拒绝写入。请修改为不使用括号的描述方式。行：{lines}
```

pattern 支持任意合法正则；若某条 pattern 是非法正则，该条保守放行不阻断。message 支持 {file}、{count}、{lines}、{pattern} 占位符，其中 {lines} 填充违规所在不重复行号的逗号分隔纯数字列表，如 3, 7。输出即填占位符后的结果，完全由 message 决定；需单行时 message 别写换行即可。

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
- collectLines(hits)：提取命中所在的不重复行号，升序排列。
- fillMessage(template, ctx)：替换报错文案占位符，ctx 含 file / count / line / pattern。
- buildReason(message, file, hits, pattern)：构造单条规则的单行拒绝原因。
