/**
 * dsh-write-rule-guard — host 半身。
 * 在 tools/pre-execute 拦截 edit / write 写入内容；同一回合内一旦命中被拦，
 * 后续 pwsh 也一并拦截并复用同一理由。
 * 配置结构：enabled 总开关 + rules 规则列表，每条规则含 enabled / pattern /
 * message 三个字段。遍历所有启用的规则，任一命中即拦，多条命中则多重报错。
 * 配置经 cordis 配置文件注入，正则匹配、报错文案均来自配置文件。
 */

/** 插件名，与 cordis.patch.yml 的 name 一致。 */
export const name = 'dsh-write-rule-guard'

/** 纯 host 半身，无额外服务注入。 */
export const inject: string[] = []

/** 默认正则：匹配全角圆括号。源码用 unicode 转义书写，避免与自身拦截冲突。 */
export const DEFAULT_PATTERN = '[\uFF08\uFF09]'

/** 默认报错文案：只告知被用户拦截，不透露匹配条件。{file}、{count}、{pattern} 占位符供自定义文案使用。 */
export const DEFAULT_MESSAGE =
  '本次写入未遵循用户偏好，已被用户拒绝写入。'

/** 单条拦截规则。 */
export interface Rule {
  /** 该条规则是否启用。 */
  enabled: boolean
  /** 匹配禁止出现字符的正则。 */
  pattern: string
  /** 拦截时报给模型的文案，支持 {file}、{count}、{pattern} 占位符。 */
  message: string
}

/** 插件解析后的配置。 */
export interface Config {
  /** 总开关：是否启用拦截。 */
  enabled: boolean
  /** 规则列表，每条含 enabled / pattern / message。 */
  rules: Rule[]
}

/** 构造一条默认规则：匹配全角圆括号。 */
export function defaultRule(): Rule {
  return { enabled: true, pattern: DEFAULT_PATTERN, message: DEFAULT_MESSAGE }
}

/** 把 cordis 配置规整成完整配置，缺省回退默认值；空规则列表兜底为默认规则。 */
export function normalizeConfig(config: Partial<Config> = {}): Config {
  const enabled = config.enabled !== undefined ? config.enabled !== false : true
  const rawRules = Array.isArray(config.rules) ? config.rules : []
  const rules: Rule[] = rawRules.length > 0
    ? rawRules.map((rule) => ({
        enabled: rule.enabled !== undefined ? rule.enabled !== false : true,
        pattern: typeof rule.pattern === 'string' && rule.pattern.trim() !== ''
          ? rule.pattern
          : DEFAULT_PATTERN,
        message: typeof rule.message === 'string' && rule.message.trim() !== ''
          ? rule.message
          : DEFAULT_MESSAGE,
      }))
    : [defaultRule()]
  return { enabled, rules }
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

/** 替换报错文案里的占位符。 */
export function fillMessage(template: string, ctx: { file: string; count: number; pattern: string }): string {
  return template
    .replaceAll('{file}', ctx.file)
    .replaceAll('{count}', String(ctx.count))
    .replaceAll('{pattern}', ctx.pattern)
}

/** 生成拒绝原因：报错文案 + 违规行号清单。只披露行号，不披露列号与上下文片段，避免向模型透露匹配条件。 */
export function buildReason(message: string, file: string, hits: Match[], pattern: string): string {
  const lines = [...new Set(hits.map((h) => h.line))].sort((a, b) => a - b)
  const detail = lines.map((line) => '  - 第 ' + line + ' 行').join('\n')
  const head = fillMessage(message, { file, count: hits.length, pattern })
  return head + '\n' + detail
}

/**
 * 对内容做多重报错检查。返回 null 表示放行，否则返回叠加了所有命中规则拒绝原因的文本。
 * 所有启用的规则都会检查：任一规则命中即拦，多条命中时各规则的报错文案叠加。
 */
export function checkContent(content: string, config: Config, file: string): string | null {
  const reasons: string[] = []
  for (const rule of config.rules) {
    if (rule.enabled !== true) continue
    const hits = findMatches(content, rule.pattern)
    if (hits.length === 0) continue
    reasons.push(buildReason(rule.message, file, hits, rule.pattern))
  }
  return reasons.length > 0 ? reasons.join('\n\n') : null
}

/** edit / write 各自承载新内容的参数字段名。 */
const FILE_PATH_KEY = 'file_path'
const NEW_CONTENT_KEYS: Record<string, string> = { edit: 'new_string', write: 'content' }

/**
 * 插件入口：在工具执行前拦截 edit / write；本回合内一旦命中正则被拦，后续 pwsh 也一并拦下并复用同一理由。
 * 配置来自 cordis 配置文件的 enabled / rules，不再提供浏览器设置界面。
 * @param ctx - 宿主上下文。
 * @param config - cordis 配置，含 enabled / rules 可选字段。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function apply(ctx: any, config: Partial<Config> = {}): void {
  const source: () => Config = () => normalizeConfig(config)
  /** 本回合内已因命中正则被拦后的拒绝理由，按会话隔离；回合边界时清空。 */
  const latch = new Map<string, string>()
  // 回合开始或结束时清空该会话的锁存，避免泄漏到下一个用户回合
  ctx.on('session/event', (session: any, event: any) => {
    if (event.type === 'turn/start' || event.type === 'turn/end') latch.delete(session.id)
  })
  ctx.on('tools/pre-execute', async (exec: any, next: () => Promise<unknown>) => {
    const cfg = source()
    if (cfg.enabled !== true) return next()
    const scope = exec.agent?.id ?? null
    if (exec.name === 'pwsh') {
      if (scope !== null) {
        const reason = latch.get(scope)
        if (reason !== undefined) return { kind: 'deny', reason }
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
    if (scope !== null) latch.set(scope, reason)
    return { kind: 'deny', reason }
  })
}
