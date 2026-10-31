/**
 * 设置页里的「写入规则守卫」面板：逐条列出拦截规则，沿用内置设置页的行样式。
 *
 * 开关写入 profile 的 Cordis patch，对全部会话生效；只想在某个会话里关掉某条规则时，
 * 切到会话视图的「规则」页，那一层记在 sessionOverrides 里。
 */

import * as React from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  NS, failureText, readEnabled, readRules, ruleKey, ruleOn, ruleTitle,
  type RuleValue, type SettingsRemote,
} from './settings'

interface PanelProps {
  remote?: SettingsRemote
}

interface PanelState {
  status: 'loading' | 'ready' | 'saving' | 'error'
  message: string | null
  writable: boolean
  enabled: boolean
  rules: RuleValue[]
}

export function RuleGuardPanel({ remote }: PanelProps): React.ReactElement {
  const [state, setState] = React.useState<PanelState>({
    status: 'loading',
    message: null,
    writable: false,
    enabled: true,
    rules: [],
  })
  const revisionRef = React.useRef(0)

  React.useEffect(() => {
    let alive = true
    void (async () => {
      if (remote === undefined) {
        setState((prev) => ({ ...prev, status: 'error', message: '设置服务不可用，无法读取规则。' }))
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
      const view = result.value.namespaces.find((entry) => entry.ns === NS)
      if (view === undefined) {
        setState((prev) => ({ ...prev, status: 'error', message: '找不到本插件的配置条目，可能尚未挂载。' }))
        return
      }
      revisionRef.current = view.revision
      setState({
        status: 'ready',
        message: null,
        writable: result.value.writable,
        enabled: readEnabled(view.value),
        rules: readRules(view.value),
      })
    })()
    return () => {
      alive = false
    }
  }, [remote])

  const save = React.useCallback(async (patch: Record<string, unknown>): Promise<void> => {
    if (remote === undefined) return
    setState((prev) => ({ ...prev, status: 'saving', message: null }))
    let result
    try {
      result = await remote.update(NS, patch, revisionRef.current)
    } catch (error) {
      setState((prev) => ({ ...prev, status: 'error', message: String(error) }))
      return
    }
    if (!result.ok) {
      setState((prev) => ({ ...prev, status: 'error', message: failureText(result.error) }))
      return
    }
    revisionRef.current = result.value.revision
    setState((prev) => ({
      status: 'ready',
      message: null,
      writable: prev.writable,
      enabled: readEnabled(result.value.value),
      rules: readRules(result.value.value),
    }))
  }, [remote])

  const busy = state.status === 'saving'
  const disabled = !state.writable || busy

  if (state.status === 'loading') {
    return <div className="wrg-page wrg-panel"><p className="wrg-desc">读取规则中…</p></div>
  }

  return (
    <div className="wrg-page wrg-panel">
      <p className="wrg-desc wrg-intro">
        规则命中的写入会被直接拒绝，并让本回合的 pwsh 进入禁用态，直到下一次写入成功。
        这里的开关对全部会话生效；只想在某个会话里临时关掉某条规则时，切到会话视图的「写入规则」页。
      </p>

      <div className="wrg-row">
        <div className="wrg-text">
          <div className="wrg-title">启用拦截</div>
          <div className="wrg-desc">总开关，关闭后全部规则都不再生效。</div>
        </div>
        <Switch
          checked={state.enabled}
          disabled={disabled}
          label="启用拦截"
          onChange={(next: boolean) => { void save({ enabled: next }) }}
        />
      </div>

      <div className="wrg-heading">
        <span>规则</span>
        <span className="wrg-count">{state.rules.length} 条</span>
      </div>

      {state.rules.length === 0
        ? <p className="wrg-desc">当前没有配置任何规则，写入不会被拦截。</p>
        : state.rules.map((rule, index) => (
          <div className="wrg-row" key={ruleKey(rule) + index}>
            <div className="wrg-text">
              <div className="wrg-title" data-off={!ruleOn(rule) || undefined}>{ruleTitle(rule, index)}</div>
              {typeof rule.pattern === 'string'
                ? <code className="wrg-code">{rule.pattern}</code>
                : null}
              {typeof rule.message === 'string' && rule.message !== ''
                ? <div className="wrg-desc">{rule.message}</div>
                : null}
            </div>
            <Switch
              checked={ruleOn(rule)}
              disabled={disabled}
              label={ruleTitle(rule, index)}
              onChange={(next: boolean) => {
                const rules = state.rules.map((item, i) => (i === index ? { ...item, enabled: next } : item))
                void save({ rules })
              }}
            />
          </div>
        ))}

      {state.message !== null
        ? <p className="wrg-error">{state.message}</p>
        : null}
      {!state.writable && state.status !== 'error'
        ? <p className="wrg-desc">当前 profile 不接受写入，开关不可用。</p>
        : null}
    </div>
  )
}
