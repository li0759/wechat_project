Component({
  options: {
    // 让外部（页面/父组件）的 wxss 可以影响内部节点，复用 club-members-panel 现有样式
    styleIsolation: 'apply-shared'
  },

  properties: {
    groups: { type: Array, value: [] }, // [{ index: 'a', children: [...] }]
    indexList: { type: Array, value: [] }, // ['a','b',...]
    defaultAvatar: { type: String, value: '' },
    roleNames: { type: Object, value: {} },
    roleOptions: { type: Object, value: {} },
    roleDisplayMap: { type: Object, value: {} },
    isPresident: { type: Boolean, value: false }
  },

  data: {
    scrollIntoView: ''
  },

  methods: {
    onIndexTap(e) {
      const idx = (e?.currentTarget?.dataset?.index || '').toString()
      if (!idx) return
      this.setData({ scrollIntoView: `idx-${idx}` })
      // 清空，避免下一次点击同一个字母不触发
      setTimeout(() => {
        if (this.data.scrollIntoView === `idx-${idx}`) this.setData({ scrollIntoView: '' })
      }, 60)
    },

    onChangeRole(e) {
      // 透传给父组件：维持现有 changeRole 逻辑与接口
      this.triggerEvent('changeRole', e?.currentTarget?.dataset || {})
    },

    onRemoveMember(e) {
      this.triggerEvent('removeMember', e?.currentTarget?.dataset || {})
    }
  }
})

