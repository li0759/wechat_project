/** @typedef {{ fetch?: () => unknown, shouldFetch?: () => boolean, commandField?: string, revealAfterPaint?: boolean }} RunPanelLoadOptions */

const CMD_START = 'start'
const CMD_REVEAL = 'reveal'
const CMD_REVEAL_AFTER_PAINT = 'revealAfterPaint'

/**
 * 统一 panel.loadData 与骨架过渡组件的协作（父 panel 只需 pltCommand + 本 helper）
 * @param {WechatMiniprogram.Component.TrivialInstance} panel
 * @param {RunPanelLoadOptions} options
 */
function runPanelLoad(panel, options = {}) {
  const field = options.commandField || 'pltCommand'
  const revealCmd = options.revealAfterPaint ? CMD_REVEAL_AFTER_PAINT : CMD_REVEAL

  panel.setData({ [field]: CMD_START })

  if (options.shouldFetch && !options.shouldFetch()) {
    panel.setData({ [field]: revealCmd })
    return Promise.resolve()
  }

  if (!options.fetch) {
    panel.setData({ [field]: revealCmd })
    return Promise.resolve()
  }

  return Promise.resolve(options.fetch()).finally(() => {
    panel.setData({ [field]: revealCmd })
  })
}

/** 供 wxml bind:loaded 转发给页面（页面 bind 在业务 panel 上，不会自动收到子组件事件） */
function emitPanelLoaded(panel) {
  panel.triggerEvent('loaded')
}

module.exports = {
  runPanelLoad,
  emitPanelLoaded,
  CMD_START,
  CMD_REVEAL,
  CMD_REVEAL_AFTER_PAINT,
}
