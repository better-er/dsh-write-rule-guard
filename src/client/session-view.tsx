/**
 * 会话视图里的「规则」页：在对话、轨迹之后，按条目关掉本会话的写入检查。
 *
 * 与设置页同一套行样式和内置开关；豁免按规则 pattern 记在 sessionOverrides 里。
 */

import * as React from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  NS, failureText, readOverrides, readRules, ruleKey, ruleOn, ruleTitle,
  type RuleValue, type SettingsRemote,
} from './settings'

interface SessionViewProps {
  sessionId?: string
  remote?: SettingsRemote
}

interface ViewState {
  status: 'loading' | 'ready' | 'saving' | 'error'
  message: string | null
  writable: boolean
  rules: RuleValue[]
  off: string[]
}

export function SessionRuleView({ sessionId, remote }: SessionViewProps): React.ReactElement {
  const [state, setState] = React.useState<ViewState>({
    status: 'loading',
    message: null,
    writable: false,
    rules: [],
    off: [],
  })
  const revisionRef = React.useRef(0)

  React.useEffect(() => {
    let alive = true
    void (async () => {
      if (remote === undefined || sessionId === undefined || sessionId === '') {
        setState((prev) => ({ ...prev, status: 'error', message: '设置服务或会话信息不可用。' }))
        return
      }
      let result
      try {
        result = await remote.describe()
      } catch (error) {
        if (alive) setState((prev) => ({ ...prev, status: 'error', message: String(error) }))
        return
      }
      if (!alive) return
      if (!result.ok) {
        setState((prev) => ({ ...prev, status: 'error', message: failureText(result.error) }))
        return
      }
      const namespace = result.value.namespaces.find((entry) => entry.ns === NS)
      if (namespace === undefined) {
        setState((prev) => ({ ...prev, status: 'error', message: '找不到本插件的配置条目。' }))
        return
      }
      revisionRef.current = namespace.revision
      const overrides = readOverrides(namespace.value)
      setState({
        status: 'ready',
        message: null,
        writable: result.value.writable,
        rules: readRules(namespace.value),
        off: overrides[sessionId] ?? [],
      })
    })()
    return () => {
      alive = false
    }
  }, [remote, sessionId])

  const isOff = (rule: RuleValue): boolean => {
    const key = ruleKey(rule)
    return key !== '' && state.off.includes(key)
  }

  const toggleRule = async (index: number, next: boolean): Promise<void> => {
    const rule = state.rules[index]
    if (rule === undefined || remote === undefined || sessionId === undefined || sessionId === '') return
    const key = ruleKey(rule)
    if (key === '') return
    const nextOff = next ? state.off.filter((item) => item !== key) : [...state.off, key]
    setState((prev) => ({ ...prev, status: 'saving', message: null, off: nextOff }))
    let result
    try {
      result = await remote.update(NS, { sessionOverrides: { [sessionId]: nextOff } }, revisionRef.current)
    } catch (error) {
      setState((prev) => ({ ...prev, status: 'error', message: String(error) }))
      return
    }
    if (!result.ok) {
      setState((prev) => ({ ...prev, status: 'error', message: failureText(result.error) }))
      return
    }
    revisionRef.current = result.value.revision
    const overrides = readOverrides(result.value.value)
    setState({
      status: 'ready',
      message: null,
      writable: true,
      rules: readRules(result.value.value),
      off: overrides[sessionId] ?? [],
    })
  }

  const busy = state.status === 'saving' || state.status === 'loading'

  if (state.status === 'loading') {
    return <div className="wrg-view"><div className="wrg-page wrg-inner"><p className="wrg-desc">读取规则中…</p></div></div>
  }

  return (
    <div className="wrg-view">
      <div className="wrg-page wrg-inner">
        <p className="wrg-desc wrg-intro">
        这里只影响当前会话。关掉的条目在这个会话里不再检查，设置页的全局开关不受影响。
      </p>

      {state.status === 'error' && state.message !== null
        ? <p className="wrg-error">{state.message}</p>
        : null}

      {state.rules.length === 0
        ? <p className="wrg-desc">当前没有配置任何规则。</p>
        : state.rules.map((rule, index) => (
          <div className="wrg-row" key={ruleKey(rule) + index}>
            <div className="wrg-text">
              <div className="wrg-title" data-off={isOff(rule) || !ruleOn(rule) || undefined}>{ruleTitle(rule, index)}</div>
              {typeof rule.pattern === 'string'
                ? <code className="wrg-code">{rule.pattern}</code>
                : null}
              {!ruleOn(rule)
                ? <div className="wrg-desc">全局已关闭，本会话不用再设。</div>
                : typeof rule.message === 'string' && rule.message !== ''
                  ? <div className="wrg-desc">{rule.message}</div>
                  : null}
            </div>
            <Switch
              checked={!isOff(rule) && ruleOn(rule)}
              disabled={!state.writable || busy || !ruleOn(rule)}
              label={ruleTitle(rule, index)}
              onChange={(next: boolean) => { void toggleRule(index, next) }}
            />
          </div>
        ))}

      {state.status === 'saving'
        ? <p className="wrg-desc">保存中…</p>
        : null}
      </div>
    </div>
  )
}
