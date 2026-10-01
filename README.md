# dsh·写入规则守卫插件

在写入类工具执行前按配置的正则拦截写入内容，命中即拒绝并把 pwsh 切到禁用态，防止改用 pwsh 绕过；被拦截工具一旦成功执行，本回合内即解除禁用，回合结束恢复允许。

默认规则与工具范围由 cordis.patch.yml 随安装注入，匹配全角圆括号，默认覆盖 edit / write / edit_remote / write_remote，都可在配置文件里改。host 单半身，代码不内置默认规则，rules 为空即不拦截。

## 工作方式

host 半身 lib/index.js 按 edit / write / edit_remote / write_remote 的成败维护「禁 pwsh」状态机。pre-execute 里拦截 edit / write / edit_remote / write_remote 的写入内容，按配置的 enabled / rules 逐条检查，命中即视为失败并进入禁 pwsh 态；post-execute 里按真实执行结果收口状态——返回错误视为失败继续禁用，执行成功则解除禁用。pwsh 的放行与否由当前禁态决定。

## 配置

插件通过 cordis 配置注入，默认 enabled: true。规则列表 rules 由 cordis.patch.yml 随安装带入一条匹配全角圆括号的默认规则；代码不兜底默认，rules 为空即不拦截。extraTools 由 cordis.patch.yml 随安装带入 [dsh-remote-file-system](https://github.com/better-er/dsh-remote-file-system) 的 edit_remote 与 write_remote，给空数组则只拦内置的 edit / write。

配置文件位于 `~/.dsh/profiles/web/cordis.patch.yml`，在此文件中添加对本插件的 config 覆盖即可。

| 键 | 默认 | 说明 |
| --- | --- | --- |
| enabled | true | 是否启用拦截 |
| joiner | 单个空格 | 多规则命中时拼接各规则文案的分隔符，可填空格或 \n 等，由配置决定形态 |
| pwshMessage | 内置默认文案 | 处于禁 pwsh 态时拦截 pwsh 的文案，支持 {reason} 占位符嵌入最近一次失败理由；空则回落到内置默认。禁 pwsh 态指本回合内某次被拦截工具失败 |
| rules | patch 注入的单条匹配全角圆括号的默认规则，为空则不拦截 | 规则列表，每条含 enabled / pattern / message |
| extraTools | patch 注入的 edit_remote 与 write_remote | 额外拦截的工具列表，每项含 name 和 contentKey；给空数组则只拦截内置的 edit / write。文件路径参数固定按 file_path 读取，路径字段名不同的工具命中规则时 {file} 会填成「未知路径」；与内置 edit / write 同名的条目会覆盖内置映射 |

安装即随 cordis.patch.yml 注入一条默认规则，可直接对照修改；rules 为空则不拦截。每条规则独立检查、任一命中即拦，缺 pattern 的条目被忽略。单条规则命中的输出即该规则 message 填占位符后的单行文本；多条命中时用顶层 joiner 拼接，不再自动追加明细。

pwshMessage 缺省或为空时回落代码内置默认文案，patch 也注入了同款，可在配置文件里改成别的写法；想带上原写入理由就在文案里加 {reason} 占位符。

配置示例，等价于 patch 注入的默认规则与工具范围：

> patch 的 `config` 是整块替换而不是逐键合并，所以在 profile 里覆盖本插件的 config 时必须重述 `extraTools`，否则会退回空数组。

```yaml
- id: dsh-write-rule-guard
  config:
    enabled: true
    joiner: ' '
    pwshMessage: 'あー！坏孩子被抓住啦！用 pwsh 绕过可不行哦！先改对了再来吧！'
    rules:
      - enabled: true
        pattern: '[\uFF08\uFF09]'
        message: 本次写入未遵循用户偏好，已被用户拒绝写入。请修改为不使用括号的描述方式。行：{lines}；文件：{file}
    extraTools:
      - name: edit_remote
        contentKey: new_string
      - name: write_remote
        contentKey: content
```

pattern 支持任意合法正则；若某条 pattern 是非法正则，该条保守放行不阻断。message 支持 {file}、{count}、{lines}、{pattern} 占位符，其中 {lines} 填充违规所在不重复行号的逗号分隔纯数字列表，如 3, 7。输出即填占位符后的结果，完全由 message 决定；需单行时 message 别写换行即可。

## 拦截范围

- 工具：常态拦 edit 和 write 的写入内容，patch 默认再拦 [dsh-remote-file-system](https://github.com/better-er/dsh-remote-file-system) 的 edit_remote 与 write_remote，也可自行配置更多工具；被拦截工具失败后，后续的 pwsh 进入禁用态被拦，文案由 pwshMessage 决定，缺省用内置默认。此后某次写入工具真实执行成功即解除禁用，回合结束一律回到允许。
- 字段：edit 的 new_string、write 的 content；extraTools 的工具按各自 contentKey 提取新内容，默认 edit_remote 取 new_string、write_remote 取 content。
- 场景：全局所有会话生效，run_code 内嵌的 edit / write 子调用同样被捕获。

## 状态机与已知局限

对每个会话，按被拦截工具的结果维护一个只在当前回合内有效的开关：

| 事件 | 结果 |
| --- | --- |
| 被拦截工具内容命中规则被拦 | 进入禁 pwsh 态，记录该次规则理由 |
| 被拦截工具真实执行返回错误 | 进入禁 pwsh 态，记录该错误信息 |
| 被拦截工具真实执行成功 | 解除禁 pwsh 态，本回合后续 pwsh 放行 |
| 回合开始或结束 | 一律重置为允许 pwsh |

「成功」按真实执行结果判定，需要内容先过规则检查、再在 post-execute 看到无错误的返回值才算数；纯内容通过但执行阶段失败仍算失败。规则拦掉的调用也会以错误结果流经 post-execute，与执行失败走同一收口，语义一致。

**已知局限**：禁用 pwsh 是为了拦住「直接用 pwsh 写文件绕过内容规则」这条路。本设计下模型只要先做一次成功写入把状态解开，之后仍可改用 pwsh 写入违规内容，从而绕开守卫——这是取舍后的有意行为：一次真实成功写入被当作「模型已遵守规则」的信号，代价是放开了这条潜在绕过路径。extraTools 配置的远程工具同样受规则检查，但远程操作的成功/失败判定由远端宿主决定。需要严格防绕过时不建议依赖本插件，应改用更底层、可逐命令校验的写保护。

## 安装

**从 GitHub 安装**：源码在 `src/`，`lib/` 不入仓库，安装时 npm 会触发 `prepare` 脚本现场构建。

```powershell
dsh plugin --profile web add github:better-er/dsh-write-rule-guard
```

**从 npm 安装**：包内已含构建产物 `lib/index.js`，安装时不再构建。

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
