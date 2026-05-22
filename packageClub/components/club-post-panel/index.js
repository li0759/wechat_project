const app = getApp()
const LONG_PRESS_MS = 1000
const MOVE_CANCEL_PX = 40
/** 拖拽项与目标格子重叠面积占较小一方面积的比例，达到后才交换 */
const SWAP_OVERLAP_RATIO = 0.85

function buildDisplaySrc(url) {
  if (!url) return ''
  if (url.includes('/download/') && app.convertToThumbnailUrl) {
    return app.convertToThumbnailUrl(url, 100)
  }
  return url
}

function normalizeRect(r) {
  if (!r) return null
  const w = r.width != null ? r.width : r.right - r.left
  const h = r.height != null ? r.height : r.bottom - r.top
  return {
    left: r.left,
    top: r.top,
    right: r.left + w,
    bottom: r.top + h,
    width: w,
    height: h
  }
}

function intersectionArea(a, b) {
  const left = Math.max(a.left, b.left)
  const right = Math.min(a.right, b.right)
  const top = Math.max(a.top, b.top)
  const bottom = Math.min(a.bottom, b.bottom)
  if (right <= left || bottom <= top) return 0
  return (right - left) * (bottom - top)
}

/** 重叠面积 / min(两格面积)，两格等大时约等于视觉重叠比例 */
function overlapRatio(dragRect, targetRect) {
  const inter = intersectionArea(dragRect, targetRect)
  if (inter <= 0) return 0
  const minArea = Math.min(dragRect.width * dragRect.height, targetRect.width * targetRect.height)
  return minArea > 0 ? inter / minArea : 0
}

function buildPostItem(file, index) {
  const fileId = file.fileID ?? file.file_id ?? null
  const url = file.fileUrl || file.file_url || file.url || ''
  return {
    key: fileId ? `f-${fileId}` : `t-${index}-${url}`,
    fileId,
    url,
    displaySrc: buildDisplaySrc(url)
  }
}

Component({
  properties: {
    mode: {
      type: String,
      value: 'manage'
    },
    clubId: {
      type: String,
      value: ''
    },
    initialPosts: {
      type: Array,
      value: []
    }
  },

  data: {
    postList: [],
    editMode: false,
    editShaking: false,
    draggingIndex: -1,
    dragStyle: '',
    saving: false,
    uploadAPI: ''
  },

  lifetimes: {
    attached() {
      this.setData({
        uploadAPI: app.globalData.request_url + '/file/upload_file'
      })
      this.initFromProps()
    },
    detached() {
      this._clearLongPressTimer()
    }
  },

  observers: {
    initialPosts() {
      if (this.properties.mode === 'create') {
        this.initFromProps()
      }
    }
  },

  methods: {
    initFromProps() {
      if (this.properties.mode !== 'create') return
      const list = (this.properties.initialPosts || []).map((f, i) => buildPostItem(f, i))
      this.setData({ postList: list, editMode: false, editShaking: false, draggingIndex: -1, dragStyle: '' })
    },

    setPostFiles(postFiles) {
      const list = (postFiles || []).map((f, i) => buildPostItem(f, i))
      this.setData({ postList: list, editMode: false, editShaking: false, draggingIndex: -1, dragStyle: '' })
    },

    getPostPayload() {
      return (this.data.postList || []).map((item) => ({
        fileId: item.fileId,
        url: item.url
      }))
    },

    emitChange() {
      this.triggerEvent('change', { posts: this.getPostPayload() })
    },

    enterEditMode() {
      if (this.data.editMode) return
      this._suppressTap = true
      setTimeout(() => { this._suppressTap = false }, 400)
      // 先完成布局（角标/FAB/头部），下一帧再开抖动，避免 scroll-view 与动画同时触发整页重排
      this.setData({
        editMode: true,
        editShaking: false
      }, () => {
        this._refreshItemRects()
        wx.nextTick(() => {
          if (this.data.editMode) {
            this.setData({ editShaking: true })
          }
        })
      })
    },

    exitEditMode() {
      if (!this.data.editMode) return
      this._endDrag(false)
      this.setData({
        editMode: false,
        editShaking: false,
        draggingIndex: -1,
        dragStyle: ''
      })
    },

    onExitEdit() {
      if (this.data.editMode) this.exitEditMode()
    },

    _clearLongPressTimer() {
      if (this._lpTimer) {
        clearTimeout(this._lpTimer)
        this._lpTimer = null
      }
    },

    _refreshItemRects() {
      const query = this.createSelectorQuery()
      query.selectAll('.post-item').boundingClientRect()
      query.exec((res) => {
        this._itemRects = res && res[0] ? res[0] : []
      })
    },

    request({ url, method = 'GET', data }) {
      return new Promise((resolve, reject) => {
        wx.request({
          url: app.globalData.request_url + url,
          method,
          data,
          header: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + wx.getStorageSync('token')
          },
          success: (res) => resolve(res.data),
          fail: reject
        })
      })
    },

    async uploadImage(filePath) {
      return new Promise((resolve, reject) => {
        wx.uploadFile({
          url: this.data.uploadAPI,
          filePath,
          name: 'file',
          formData: { fileType: 'club_img' },
          header: { Authorization: 'Bearer ' + wx.getStorageSync('token') },
          success: (res) => {
            try {
              const data = JSON.parse(res.data)
              if (data.Flag === 4000) resolve(data.data)
              else reject(new Error(data.Message || data.message || '上传失败'))
            } catch (e) {
              reject(new Error('解析响应失败'))
            }
          },
          fail: reject
        })
      })
    },

    async persistToServer(postList) {
      const clubId = this.properties.clubId
      if (!clubId) return null
      const post_ids = (postList || []).map((p) => p.fileId).filter((id) => id != null)
      const res = await this.request({
        url: `/club/${clubId}/update_posts`,
        method: 'POST',
        data: { post_ids }
      })
      if (res.Flag === 4000 || res.Flag === '4000') return res.data
      throw new Error(res.message || '保存失败')
    },

    async saveList(postList, { silent } = {}) {
      if (this.properties.mode === 'create') {
        this.setData({ postList })
        this.emitChange()
        return
      }
      if (!silent) this.setData({ saving: true })
      try {
        const data = await this.persistToServer(postList)
        const files = data?.post_files || []
        const next = files.length
          ? files.map((f, i) => buildPostItem(f, i))
          : postList
        this.setData({ postList: next })
        this.triggerEvent('updated', { post_files: files, post_ids: data?.post_ids || [] })
        if (!silent) wx.showToast({ title: '已保存', icon: 'success' })
      } finally {
        if (!silent) this.setData({ saving: false })
      }
    },

    onItemTouchStart(e) {
      const index = Number(e.currentTarget.dataset.index)
      const touch = e.touches[0]
      if (!touch) return

      this._touchIndex = index
      this._touchMoved = false
      this._lpStartX = touch.clientX
      this._lpStartY = touch.clientY

      if (this.data.editMode) {
        this._beginDrag(index, touch)
        return
      }

      this._clearLongPressTimer()
      this._lpTimer = setTimeout(() => {
        this._lpTimer = null
        this.enterEditMode()
      }, LONG_PRESS_MS)
    },

    onItemTouchMove(e) {
      const touch = e.touches[0]
      if (!touch) return

      const dx = touch.clientX - this._lpStartX
      const dy = touch.clientY - this._lpStartY
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (this.data.editMode && this._drag) {
        this._onDragMove(touch)
        return
      }

      if (!this.data.editMode && this._lpTimer && dist > MOVE_CANCEL_PX) {
        this._touchMoved = true
        this._clearLongPressTimer()
      }
    },

    onItemTouchEnd() {
      this._clearLongPressTimer()

      if (this.data.editMode) {
        if (this._drag) {
          this._suppressTap = true
          setTimeout(() => { this._suppressTap = false }, 400)
          this._endDrag(true)
        }
        return
      }

      this._touchIndex = null
    },

    onItemTap(e) {
      if (this.data.editMode || this._suppressTap) return
      if (this._touchMoved) return

      const index = Number(e.currentTarget.dataset.index)
      const list = this.data.postList || []
      const item = list[index]
      const urls = list.map((p) => p.url).filter(Boolean)
      if (!item || !urls.length) {
        wx.showToast({ title: '图片地址无效', icon: 'none' })
        return
      }
      wx.previewImage({
        urls,
        current: item.url || urls[0]
      })
    },

    onImageError(e) {
      const index = Number(e.currentTarget.dataset.index)
      const list = [...(this.data.postList || [])]
      const item = list[index]
      if (!item || !item.url) return
      if (item.displaySrc === item.url) return
      list[index] = { ...item, displaySrc: item.url }
      this.setData({ postList: list })
    },

    _beginDrag(index, touch) {
      this._drag = {
        index,
        startX: touch.clientX,
        startY: touch.clientY
      }
      this.setData({
        draggingIndex: index,
        dragStyle: 'transform: translate3d(0, 0, 0) scale(1.06); z-index: 100;'
      })
      this._refreshItemRects()
    },

    _onDragMove(touch) {
      if (!this._drag) return
      const dx = touch.clientX - this._drag.startX
      const dy = touch.clientY - this._drag.startY
      this.setData({
        dragStyle: `transform: translate3d(${dx}px, ${dy}px, 0) scale(1.06); z-index: 100;`
      })
      this._trySwapAt(touch.clientX, touch.clientY)
    },

    _trySwapAt(clientX, clientY) {
      const rects = this._itemRects
      if (!rects || !this._drag) return

      const from = this._drag.index
      const dx = clientX - this._drag.startX
      const dy = clientY - this._drag.startY
      const base = normalizeRect(rects[from])
      if (!base) return

      const dragged = {
        left: base.left + dx,
        top: base.top + dy,
        right: base.right + dx,
        bottom: base.bottom + dy,
        width: base.width,
        height: base.height
      }

      let target = -1
      let bestRatio = 0
      for (let i = 0; i < rects.length; i++) {
        if (i === from) continue
        const cell = normalizeRect(rects[i])
        if (!cell) continue
        const ratio = overlapRatio(dragged, cell)
        if (ratio >= SWAP_OVERLAP_RATIO && ratio > bestRatio) {
          bestRatio = ratio
          target = i
        }
      }
      if (target < 0 || target === from) return

      const list = [...(this.data.postList || [])]
      const [moved] = list.splice(this._drag.index, 1)
      list.splice(target, 0, moved)
      this._drag.index = target
      this.setData({
        postList: list,
        draggingIndex: target,
        dragStyle: 'transform: translate3d(0, 0, 0) scale(1.06); z-index: 100;'
      })
      this._drag.startX = clientX
      this._drag.startY = clientY
      setTimeout(() => this._refreshItemRects(), 50)
    },

    async _endDrag(shouldSave) {
      if (!this._drag) return
      this._drag = null
      const list = this.data.postList || []
      this.setData({ draggingIndex: -1, dragStyle: '' })
      if (shouldSave) {
        await this.saveList(list, { silent: true })
      }
    },

    async onDeleteBadge(e) {
      if (!this.data.editMode) return
      const index = Number(e.currentTarget.dataset.index)
      const list = [...(this.data.postList || [])]
      if (index < 0 || index >= list.length) return
      list.splice(index, 1)
      await this.saveList(list)
      if (!list.length) this.exitEditMode()
      else setTimeout(() => this._refreshItemRects(), 50)
    },

    onAddTap() {
      if (this.data.editMode) return
      const remain = 9 - (this.data.postList || []).length
      if (remain <= 0) {
        wx.showToast({ title: '最多添加 9 张海报', icon: 'none' })
        return
      }
      wx.chooseMedia({
        count: Math.min(remain, 9),
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: async (res) => {
          const paths = (res.tempFiles || []).map((f) => f.tempFilePath).filter(Boolean)
          if (!paths.length) return
          wx.showLoading({ title: '上传中...' })
          try {
            const uploaded = []
            for (const path of paths) {
              const result = await this.uploadImage(path)
              const fileId = result.file_id ?? result.fileID
              const url = result.file_url ?? result.fileUrl ?? path
              uploaded.push(buildPostItem({ fileID: fileId, fileUrl: url }, 0))
            }
            const merged = [...(this.data.postList || []), ...uploaded].map((item, i) => ({
              ...item,
              key: item.fileId ? `f-${item.fileId}` : `t-${i}-${item.url}`
            }))
            await this.saveList(merged)
          } catch (err) {
            wx.showToast({ title: err.message || '上传失败', icon: 'none' })
          } finally {
            wx.hideLoading()
          }
        }
      })
    }
  }
})
