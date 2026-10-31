/**
 * 设置远端的共享类型与读取工具。
 *
 * 主机把本插件的配置声明成 volatile 表单，浏览器端通过 settings.describe 拿到解析后的值与修订号，
 * 用 settings.update 把改动写回 profile 的 Cordis patch。设置页与会话头的小面板都用这一份。
 */

/** 本插件的 profile 条目 id，同时也是设置表单的命名空间。 */
export const NS = 'dsh-write-rule-guard'

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
