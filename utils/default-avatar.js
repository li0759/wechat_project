/** 全局缺省头像：static_url/assets/default_avatar.webp（对应 dist/assets/default_avatar.webp） */

function getDefaultAvatarUrl() {
  try {
    const app = getApp()
    if (app && app.globalData && app.globalData.defaultAvatarUrl) {
      return app.globalData.defaultAvatarUrl
    }
    const base = (app && app.globalData && app.globalData.static_url) || ''
    if (base) return `${base}/assets/default_avatar.webp`
  } catch (e) {}
  return '/assets/default_avatar.webp'
}

function resolveAvatarUrl(url) {
  const trimmed = (url == null ? '' : String(url)).trim()
  return trimmed || getDefaultAvatarUrl()
}

module.exports = {
  getDefaultAvatarUrl,
  resolveAvatarUrl,
}
