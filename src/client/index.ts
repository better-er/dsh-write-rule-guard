/**
 * dsh-write-rule-guard 浏览器半身：设置里加一页，会话视图里加一个「规则」页。
 *
 * 两处都注册到 slots，用内置设置页的行样式和内置 Switch；配置读写全部交给
 * settings 远端的 describe / update，写入落回活动 profile 的 Cordis patch。
 * 样式自带 data-plugin 归属标记，卸载时按标记回收。
 */

import * as React from 'react'
import { RuleGuardPanel } from './panel'
import { SessionRuleView } from './session-view'

/** 插件名，与 package.json 的 name 一致。 */
export const name = 'dsh-write-rule-guard'

/** 需要的客户端服务：slots 提供两处槽位，remote.settings 读写配置表单。 */
export const inject = ['slots', 'remote.settings']

/** 沿用内置设置页的排版：行分隔线、标题与说明的字号颜色都取主题语义令牌。 */
const CSS = [
  '.wrg-page{display:flex;flex-direction:column;}',
  '.wrg-panel{max-width:720px;padding:2px 0 8px;}',
  '.wrg-view{padding:16px calc(var(--dsh-composer-side-clearance,0px) + 16px);}',
  '.wrg-inner{width:100%;max-width:var(--dsh-chat-content-width,748px);margin:0 auto;}',
  '.wrg-desc.wrg-intro{margin:0 0 8px;}',
  '.wrg-row{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:16px 0;',
  '  border-bottom:.5px solid var(--dsw-alias-border-l2);}',
  '.wrg-text{min-width:0;}',
  '.wrg-title{font-size:14px;line-height:20px;color:var(--dsw-alias-label-primary,inherit);word-break:break-word;}',
  '.wrg-title[data-off]{color:var(--dsw-alias-label-tertiary,inherit);}',
  '.wrg-desc{margin:0;color:var(--dsw-alias-label-secondary,inherit);font-size:12px;line-height:18px;word-break:break-word;}',
  '.wrg-code{display:block;margin-top:2px;font-size:12px;line-height:18px;',
  '  font-family:var(--dsw-font-markdown-code-block,monospace);',
  '  color:var(--dsw-alias-label-tertiary,inherit);overflow-wrap:anywhere;}',
  '.wrg-heading{display:flex;align-items:center;justify-content:space-between;margin-top:16px;',
  '  font-size:12px;color:var(--dsw-alias-label-tertiary,inherit);}',
  '.wrg-count{font-weight:400;}',
  '.wrg-error{margin:8px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary);word-break:break-word;}',
].join('')

/**
 * 挂载设置页与会话视图页。
 * @param ctx - 浏览器插件上下文。
 */
export function apply(ctx: any): void {
  if (typeof document === 'undefined') return
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-write-rule-guard'
  style.dataset.pluginCss = 'settings'
  style.textContent = CSS
  document.head.appendChild(style)
  ctx.effect(() => () => { style.remove() }, 'dsh-write-rule-guard: 设置页样式')

  const slots = typeof ctx.get === 'function' ? ctx.get('slots') : undefined
  if (slots === undefined) return
  /** 设置远端：两处页面都靠它读写配置。 */
  const remote = (typeof ctx.get === 'function' ? ctx.get('remote') : undefined)?.settings ?? ctx.remote?.settings

  slots.inject('settings.section', () => slots.register({
    name: 'settings.section',
    id: 'write-rule-guard',
    order: 40,
    label: '写入规则守卫',
  }, () => React.createElement(RuleGuardPanel, { remote })))

  // 会话视图「规则」页，排在对话与轨迹之后。没有这个槽位的版本就跳过。
  try {
    slots.inject('conversation.view', () => slots.register({
      name: 'conversation.view',
      id: 'write-rule-guard',
      order: 15,
      label: '写入规则',
      scope: 'session',
    }, (props: { sessionId?: string }) => React.createElement(SessionRuleView, {
      sessionId: props?.sessionId,
      remote,
    })))
  } catch {
    // 槽位不存在时静默跳过，设置页不受影响。
  }
}
