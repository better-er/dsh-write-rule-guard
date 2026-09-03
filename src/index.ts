/**
 * dsh-write-rule-guard — host 半身。
 * 状态机：edit / write 失败时把当前回合切到「禁用 pwsh」态，之后某次
 * edit / write 真实执行成功则解除禁用。工具真正执行前拦截 edit / write 的
 * 写入内容；拒绝文案完全由各规则 message 决定，填完占位符后即单行结果。
 * 「失败」指内容命中规则被本插件拒掉、或 edit / write 执行返回错误；
 * 「成功」指内容未命中规则且该调用真实执行无错。禁 pwsh 态只在本回合内
 * 生效，回合边界一律重置为允许。
 * 配置结构：enabled 总开关 + rules 规则列表，每条规则含 enabled / pattern /
 * message 三个字段。遍历所有启用的规则，任一命中即拦；拒绝文案完全由各规则
 * message 决定，多规则命中时按顶层 joiner 拼接。配置经 cordis 配置文件注入，
 * 正则匹配、报错文案均来自配置文件；代码不内置默认规则，rules 为空即不拦截。
 */

/** 插件名，与 cordis.patch.yml 的 name 一致。 */
export const name = 'dsh-write-rule-guard'

/** 纯 host 半身，无额外服务注入。 */
export const inject: string[] = []

/** 默认 pwsh 拦截文案：处于禁 pwsh 态时使用。{reason} 占位符可嵌入最近一次 edit/write 失败理由。 */
export const DEFAULT_PWSH_MESSAGE =
  'あー！差点就让你混过去了！这段不行哦，改对了再写，pwsh 也不行哦！'
/** 单条拦截规则。 */
export interface Rule {
  /** 该条规则是否启用。 */
  enabled: boolean
  /** 匹配禁止出现字符的正则，需提供有效字符串，缺省该规则的条目会被丢弃。 */
  pattern: string
  /** 拦截时报给模型的文案，支持 {file}、{count}、{lines}、{pattern} 占位符；整条输出即此文案填占位符后的单行结果。 */
  message: string
}

/** 插件解析后的配置。 */
export interface Config {
  /** 总开关：是否启用拦截。 */
  enabled: boolean
  /** 多规则命中时拼接各规则文案所用的分隔符，默认单个空格；填 \n 可换行，由配置决定。 */
  joiner: string
  /** 处于禁 pwsh 态时拦截 pwsh 所用的文案，支持 {reason} 占位符嵌入最近一次失败理由；空则用内置默认文案。禁 pwsh 态指本回合内某次 edit/write 失败。 */
  pwshMessage: string
  /** 规则列表，每条含 enabled / pattern / message；为空则不拦截，默认规则由配置注入而非代码兜底。 */
  rules: Rule[]
}

/** 规整 cordis 配置；rules 为空即不拦截，代码不内置默认规则。丢弃缺 pattern 的条目。 */
export function normalizeConfig(config: Partial<Config> = {}): Config {
  const enabled = config.enabled !== undefined ? config.enabled !== false : true
  const joiner = typeof config.joiner === 'string' ? config.joiner : ' '
  const pwshMessage = typeof config.pwshMessage === 'string' && config.pwshMessage.trim() !== ''
    ? config.pwshMessage
    : DEFAULT_PWSH_MESSAGE
  const rawRules = Array.isArray(config.rules) ? config.rules : []
  const rules: Rule[] = rawRules
    .filter((rule) => rule !== null && typeof rule === 'object'
      && typeof rule.pattern === 'string' && rule.pattern.trim() !== '')
    .map((rule) => ({
      enabled: rule.enabled !== undefined ? rule.enabled !== false : true,
      pattern: rule.pattern,
      message: typeof rule.message === 'string' ? rule.message : '',
    }))
  return { enabled, joiner, pwshMessage, rules }
}

/** 一处匹配的位置。 */
export interface Match {
  /** 1 基行号。 */
  line: number
  /** 1 基列号。 */
  col: number
  /** 以该处为中心的上下文片段。 */
  snippet: string
}

/** 编译用户正则；非法正则返回 null，由调用方保守放行。 */
export function compilePattern(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, 'gu')
  } catch {
    return null
  }
}

/** 扫描文本，返回匹配位置清单，每项含行号、列号与上下文片段。 */
export function findMatches(content: string, pattern: string): Match[] {
  const re = compilePattern(pattern)
  if (!re) return []
  const hits: Match[] = []
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    re.lastIndex = 0
    const line = lines[i]
    let m: RegExpExecArray | null
    while ((m = re.exec(line)) !== null) {
      const col = m.index + 1
      const from = Math.max(0, m.index - 10)
      const to = Math.min(line.length, m.index + 11)
      hits.push({
        line: i + 1,
        col,
        snippet: (from > 0 ? '…' : '') + line.slice(from, to) + (to < line.length ? '…' : ''),
      })
    }
  }
  return hits
}

/** 提取命中所在的不重复行号并按升序排列，供 {lines} 占位符使用。 */
export function collectLines(hits: Match[]): number[] {
  return [...new Set(hits.map((h) => h.line))].sort((a, b) => a - b)
}

/** 替换报错文案里的占位符。{lines} 填充为不重复行号的逗号分隔纯数字列表。 */
export function fillMessage(template: string, ctx: { file: string; count: number; pattern: string; lines: string }): string {
  return template
    .replaceAll('{file}', ctx.file)
    .replaceAll('{count}', String(ctx.count))
    .replaceAll('{lines}', ctx.lines)
    .replaceAll('{pattern}', ctx.pattern)
}

/** 生成单条规则的拒绝原因：仅按规则 message 填占位符，结果一行、完全由配置决定，不追加任何明细。 */
export function buildReason(message: string, file: string, hits: Match[], pattern: string): string {
  const lines = collectLines(hits).join(', ')
  return fillMessage(message, { file, count: hits.length, pattern, lines })
}

/**
 * 对内容做多重报错检查。返回 null 表示放行，否则返回用配置 joiner 拼接的拒绝文本。
 * 各规则文案即填占位符后的单行结果；多条命中时按顶层 joiner 拼接，默认单个空格。
 */
export function checkContent(content: string, config: Config, file: string): string | null {
  const reasons: string[] = []
  for (const rule of config.rules) {
    if (rule.enabled !== true) continue
    const hits = findMatches(content, rule.pattern)
    if (hits.length === 0) continue
    reasons.push(buildReason(rule.message, file, hits, rule.pattern))
  }
  return reasons.length > 0 ? reasons.join(config.joiner) : null
}

/** edit / write 各自承载新内容的参数字段名。 */
const FILE_PATH_KEY = 'file_path'
const NEW_CONTENT_KEYS: Record<string, string> = { edit: 'new_string', write: 'content' }

/**
 * 插件入口：按 edit / write 的成败维护「禁 pwsh」状态机。
 * 状态机规则：
 * - edit / write 失败，即内容命中规则被拦或真实执行返回错误 → 进入禁 pwsh 态，
 *   记录该失败理由；
 * - edit / write 成功，即内容未命中规则且真实执行无错 → 解除禁 pwsh 态；
 * - 处于禁 pwsh 态时，本会话的 pwsh 一律拦截，文案用 pwshMessage 并把 {reason}
 *   替换为最近一次失败理由；
 * - 禁态只在本回合内生效，回合边界一律重置为允许 pwsh。
 * 配置来自 cordis 配置文件的 enabled / rules，不再提供浏览器设置界面。
 * @param ctx - 宿主上下文。
 * @param config - cordis 配置，含 enabled / rules 可选字段。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function apply(ctx: any, config: Partial<Config> = {}): void {
  const source: () => Config = () => normalizeConfig(config)
  /** 每个会话当前是否处于禁 pwsh 态，值为最近一次 edit/write 失败理由；键与会话 id 相同。 */
  const locked = new Map<string, string>()
  // 回合开始或结束时重置禁态，避免泄漏到下一个用户回合；禁态也会在成功写入后解除
  ctx.on('session/event', (session: any, event: any) => {
    if (event.type === 'turn/start' || event.type === 'turn/end') locked.delete(session.id)
  })
  const setLocked = (scope: string | null, reason: string): void => {
    if (scope !== null) locked.set(scope, reason)
  }
  const lockedReason = (scope: string | null): string | undefined =>
    scope !== null ? locked.get(scope) : undefined
  // pre-execute：内容规则命中视为 edit/write 失败，立即禁用 pwsh；pwsh 在禁态时被拦
  ctx.on('tools/pre-execute', async (exec: any, next: () => Promise<unknown>) => {
    const cfg = source()
    if (cfg.enabled !== true) return next()
    const scope = exec.agent?.id ?? null
    if (exec.name === 'pwsh') {
      const reason = lockedReason(scope)
      if (reason !== undefined) {
        return { kind: 'deny', reason: cfg.pwshMessage.replaceAll('{reason}', reason) }
      }
      return next()
    }
    if (exec.name !== 'edit' && exec.name !== 'write') return next()
    const args = exec.arguments
    const newContentKey = NEW_CONTENT_KEYS[exec.name]
    const newContent = typeof args?.[newContentKey] === 'string' ? args[newContentKey] : undefined
    if (newContent === undefined || newContent === '') return next()
    const filePath = typeof args?.[FILE_PATH_KEY] === 'string' ? args[FILE_PATH_KEY] : '未知路径'
    const reason = checkContent(newContent, cfg, filePath)
    if (reason === null) return next()
    setLocked(scope, reason)
    return { kind: 'deny', reason }
  })
  // post-execute：内容未被规则拦的 edit/write 走真实执行，用结果成败收口状态。
  // 规则拦掉的调用也会以 isError 结果流经此处，同样进入失败态，语义一致。
  ctx.on('tools/post-execute', async (exec: any, result: any, next: () => Promise<unknown>) => {
    const cfg = source()
    if (cfg.enabled !== true) return next()
    if (exec.name !== 'edit' && exec.name !== 'write') return next()
    const scope = exec.agent?.id ?? null
    if (result?.isError === true) {
      const message = typeof result?.error?.message === 'string' && result.error.message.trim() !== ''
        ? result.error.message
        : 'edit/write 执行失败'
      setLocked(scope, message)
    } else if (scope !== null) {
      // 真实执行成功 → 解除禁 pwsh 态
      locked.delete(scope)
    }
    return next()
  })
}
