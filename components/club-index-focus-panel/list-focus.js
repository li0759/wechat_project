/**
 * 索引列表与左滑详情窗联动辅助（行点击打开 / 焦点态 class）
 */

function toggleFocusId(currentId, rowId) {
  const cur = String(currentId || '')
  const id = String(rowId || '')
  if (!id) return cur
  return cur === id ? '' : id
}

function isFocusRowActive(selectedId, rowId) {
  return String(selectedId || '') === String(rowId || '')
}

function isFocusRowMuted(selectedId, rowId) {
  const sid = String(selectedId || '')
  const rid = String(rowId || '')
  return !!sid && sid !== rid
}

/**
 * 列表行 tap：bulk 模式走 onBulkTap，否则 toggle 左滑窗并回调 onFocusChange
 * @param {object} ctx - 组件 this
 * @param {object} e - tap 事件
 * @param {object} options
 * @param {string} options.idKey - dataset 字段名，如 eventid / memberid
 * @param {function} options.getSelectedId - () => string
 * @param {function} options.isBulkMode - () => boolean
 * @param {function} options.onBulkTap - (e) => void
 * @param {function} options.onFocusChange - (nextId, rowId, e) => void
 */
function handleListRowTap(ctx, e, options) {
  const idKey = options.idKey || 'id'
  const rowId = String(e?.currentTarget?.dataset?.[idKey] || '')
  if (!rowId) return
  if (options.isBulkMode && options.isBulkMode.call(ctx)) {
    if (typeof options.onBulkTap === 'function') options.onBulkTap.call(ctx, e)
    return
  }
  const current = typeof options.getSelectedId === 'function'
    ? String(options.getSelectedId.call(ctx) || '')
    : ''
  const nextId = toggleFocusId(current, rowId)
  if (typeof options.onFocusChange === 'function') {
    options.onFocusChange.call(ctx, nextId, rowId, e)
  }
}

module.exports = {
  toggleFocusId,
  isFocusRowActive,
  isFocusRowMuted,
  handleListRowTap,
}
