/**
 * 全屏 panel 依赖分包组件；lazyCodeLoading + componentPlaceholder 下
 * 首次打开时 selectComponent 可能拿到无 loadData 的骨架占位，需预加载并重试。
 */

const PANEL_TYPE_ROOT = {
  'event-detail': 'packageEvent',
  'event-joined': 'packageEvent',
  'event-manage': 'packageEvent',
  'event-create': 'packageEvent',
  'club-detail': 'packageClub',
  'club-joined': 'packageClub',
  'club-manage': 'packageClub',
  'club-create': 'packageClub',
  'club-overview': 'packageHome',
  'club-applications': 'packageProfile',
  'my-applications': 'packageProfile',
  paypersonal: 'packageProfile',
  'user-info': 'packageProfile',
  'club-members': 'packageProfile',
  events: 'packageProfile',
  clubs: 'packageProfile',
  'joined-events': 'packageProfile',
  'all-club-events': 'packageProfile',
  'all-club-users': 'packageProfile',
  'club-events': 'packageProfile',
  'club-timeline': 'packageProfile',
  'club-financial': 'packageProfile'
};

const ALL_PANEL_ROOTS = ['packageEvent', 'packageClub', 'packageProfile', 'packageHome'];

const _loadedRoots = Object.create(null);
let _preloadAllPromise = null;
let _subpackageApiWarned = false;

/** 企业微信模拟器 / 部分宿主无 wx.loadSubpackage，仅依赖 invokePanelLoadData 轮询 */
function canPreloadSubpackage() {
  return typeof wx !== 'undefined' && typeof wx.loadSubpackage === 'function';
}

function loadSubpackageRoot(root) {
  if (!root) return Promise.resolve();
  if (_loadedRoots[root]) return Promise.resolve();

  if (!canPreloadSubpackage()) {
    if (!_subpackageApiWarned) {
      _subpackageApiWarned = true;
      console.warn('[panel-lazy-load] wx.loadSubpackage 不可用，跳过分包预加载（依赖 panel loadData 轮询）');
    }
    _loadedRoots[root] = true;
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const opts = { root };
    if (root === 'packageProfile') opts.name = 'packageProfile';
    wx.loadSubpackage({
      ...opts,
      success: () => {
        _loadedRoots[root] = true;
        resolve();
      },
      fail: (err) => {
        console.warn('[panel-lazy-load] loadSubpackage fail:', root, err);
        resolve();
      }
    });
  });
}

function preloadAllPanelSubpackages() {
  if (!_preloadAllPromise) {
    _preloadAllPromise = Promise.all(ALL_PANEL_ROOTS.map(loadSubpackageRoot));
  }
  return _preloadAllPromise;
}

function preloadForPanelType(type) {
  const root = PANEL_TYPE_ROOT[type];
  if (!root) return preloadAllPanelSubpackages();
  return loadSubpackageRoot(root);
}

/**
 * renderPanel 后轮询直到真实 panel 出现并调用 loadData
 * @param {Object} page - 页面实例
 * @param {string} selector - 如 #globalClubManagePanel
 * @param {Object} [options]
 * @param {number} [options.maxAttempts=80]
 * @param {number} [options.intervalMs=200]
 * @param {Function} [options.onTimeout]
 */
function invokePanelLoadData(page, selector, options = {}) {
  if (!page || !selector) return;

  const maxAttempts = options.maxAttempts != null ? options.maxAttempts : 80;
  const intervalMs = options.intervalMs != null ? options.intervalMs : 200;
  const gen = (page.__panelLoadGen = (page.__panelLoadGen || 0) + 1);
  let attempts = 0;

  const tick = () => {
    if (page.__panelLoadGen !== gen) return;
    attempts += 1;
    const panel = page.selectComponent(selector);
    if (panel && typeof panel.loadData === 'function') {
      try {
        panel.loadData();
      } catch (e) {
        console.error('[panel-lazy-load] loadData error:', selector, e);
      }
      return;
    }
    if (attempts >= maxAttempts) {
      if (typeof options.onTimeout === 'function') options.onTimeout(selector);
      return;
    }
    setTimeout(tick, intervalMs);
  };

  if (typeof wx !== 'undefined' && typeof wx.nextTick === 'function') {
    wx.nextTick(tick);
  } else {
    setTimeout(tick, 50);
  }
}

module.exports = {
  PANEL_TYPE_ROOT,
  preloadAllPanelSubpackages,
  preloadForPanelType,
  invokePanelLoadData
};
