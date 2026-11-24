/**
 * 设置远端的共享类型与读取工具。
 *
 * 主机把本插件的配置声明成 volatile 表单，浏览器端通过 settings.describe 拿到解析后的值与修订号，
 * 用 settings.update 把改动写回 profile 的 Cordis patch。设置页与会话头的小面板都用这一份。
 */

/** 本插件的 profile 条目 id，同时也是设置表单的命名空间。 */
export const NS = 'dsh-write-rule-guard'

/** 拦截模式：all 为旧行为，非规则拦截的失败同样禁用 pwsh；guard 只认规则拦截。 */
export type GuardMode = 'all' | 'guard'

/** 会话级拦截模式：inherit 表示跟随全局。 */
export type SessionGuardMode = GuardMode | 'inherit'

/** 全局模式的两个选项，显示顺序即界面顺序。 */
export const GLOBAL_MODE_OPTIONS: { value: GuardMode; label: string }[] = [
  { value: 'all', label: '任何失败' },
  { value: 'guard', label: '仅规则拦截' },
]

/** 会话模式的三个选项，多一个跟随全局。 */
export const SESSION_MODE_OPTIONS: { value: SessionGuardMode; label: string }[] = [
  { value: 'inherit', label: '跟随全局' },
  { value: 'all', label: '任何失败' },
  { value: 'guard', label: '仅规则拦截' },
]

/** 配置里的一条规则，字段按可选处理，配置写坏时不至于让页面崩掉。 */
export interface RuleValue {
  enabled?: boolean
  title?: string
  pattern?: string
  message?: string
}

/** 一个命名空间的表单视图。 */
export interface NamespaceView {
  ns: string
  value: unknown
  revision: number
}

/** describe 的返回结构，只取页面用到的字段。 */
export interface DescribeValue {
  writable: boolean
  namespaces: NamespaceView[]
}

/** 远端失败时的错误描述。 */
export interface RemoteFailure {
  message?: string
}

/** 远端调用统一的结果信封。 */
export type Result<T> = { ok: true; value: T } | { ok: false; error: RemoteFailure }

/** 页面用到的设置远端接口。 */
export interface SettingsRemote {
  describe(): Promise<Result<DescribeValue>>
  update(ns: string, patch: Record<string, unknown>, revision?: number): Promise<Result<NamespaceView>>
}

/** 从命名空间值里读总开关，缺省视为开启。 */
export function readEnabled(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true
  return (value as { enabled?: unknown }).enabled !== false
}

/** 从命名空间值里读规则列表，非对象条目直接丢弃。 */
export function readRules(value: unknown): RuleValue[] {
  if (typeof value !== 'object' || value === null) return []
  const raw = (value as { rules?: unknown }).rules
  if (!Array.isArray(raw)) return []
  return raw.filter((rule): rule is RuleValue => typeof rule === 'object' && rule !== null)
}

/** 从命名空间值里读全局拦截模式，缺省或写坏时按旧行为 all。 */
export function readMode(value: unknown): GuardMode {
  if (typeof value !== 'object' || value === null) return 'all'
  return (value as { mode?: unknown }).mode === 'guard' ? 'guard' : 'all'
}

/** 从命名空间值里读会话级拦截模式表，只保留三种合法值。 */
export function readSessionModes(value: unknown): Record<string, SessionGuardMode> {
  if (typeof value !== 'object' || value === null) return {}
  const raw = (value as { sessionModes?: unknown }).sessionModes
  if (typeof raw !== 'object' || raw === null) return {}
  const result: Record<string, SessionGuardMode> = {}
  for (const [sessionId, mode] of Object.entries(raw)) {
    if (mode === 'all' || mode === 'guard' || mode === 'inherit') result[sessionId] = mode
  }
  return result
}

/** 取某会话的模式，未设置时按跟随全局。 */
export function readSessionMode(value: unknown, sessionId: string): SessionGuardMode {
  return readSessionModes(value)[sessionId] ?? 'inherit'
}

/** 模式的中文名，用于说明当前生效的是哪一档。 */
export function modeTitle(mode: GuardMode): string {
  return mode === 'guard' ? '仅规则拦截' : '任何失败'
}

/** 从命名空间值里读会话级豁免表。 */
export function readOverrides(value: unknown): Record<string, string[]> {
  if (typeof value !== 'object' || value === null) return {}
  const raw = (value as { sessionOverrides?: unknown }).sessionOverrides
  if (typeof raw !== 'object' || raw === null) return {}
  const result: Record<string, string[]> = {}
  for (const [sessionId, patterns] of Object.entries(raw)) {
    if (!Array.isArray(patterns)) continue
    result[sessionId] = patterns.filter((item): item is string => typeof item === 'string')
  }
  return result
}

/** 规则是否处于启用状态，缺省视为启用。 */
export function ruleOn(rule: RuleValue): boolean {
  return rule.enabled !== false
}

/** 规则在页面上的标题，优先用配置里的名字，否则退回正则本身。 */
export function ruleTitle(rule: RuleValue, index: number): string {
  const title = typeof rule.title === 'string' ? rule.title.trim() : ''
  if (title !== '') return title
  const pattern = typeof rule.pattern === 'string' ? rule.pattern : ''
  return pattern !== '' ? pattern : `规则 ${index + 1}`
}

/** 规则在配置里的稳定标识，会话豁免按它记录。 */
export function ruleKey(rule: RuleValue): string {
  return typeof rule.pattern === 'string' ? rule.pattern : ''
}

/** 远端错误转成一行可读文案。 */
export function failureText(error: RemoteFailure | undefined): string {
  const message = error?.message
  return typeof message === 'string' && message.trim() !== '' ? message : '设置写入失败'
}
