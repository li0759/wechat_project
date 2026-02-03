Component({
  properties: {
    // 图片数据数组
    items: {
      type: Array,
      value: [],
      observer: 'onItemsChange'
    },
    // 布局模式
    layoutMode: {
      type: String,
      value: 'masonryHorizontal' // 支持 'masonryHorizontal' 或 'fitRows'（网格布局）
  },
    // masonryHorizontal 配置
    masonryHorizontal: {
      type: Object,
      value: {}
    },
    // 容器宽度
    width: {
      type: String,
      value: '750rpx'
    },
    // 容器高度
    height: {
      type: String,
      value: '420rpx'
    },
    // 图片间距（rpx数
      gutter: {
      type: Number,
      value: 0
    },
    // 过渡时间
    transitionDuration: {
      type: String,
      value: '0.4s'
    },
    // 背景样式
    background: {
      type: String,
      value: ''
    },
    // 背景颜色（支持十六进制和 rgb 格式）
    backgroundColor: {
      type: String,
      value: '#4A1FB8'
    },
    // 分组轮播间隔（仅双层数组生效，单位 ms）
    groupInterval: {
      type: Number,
      value: 6000
    },
    // 是否使用自定义slot
    useCustomSlot: {
      type: Boolean,
      value: false
    },
    // 是否隐藏内部图片（仅保留布局；用于在外层覆盖自定义内容）
    hideImages: {
      type: Boolean,
      value: false
    },
    // 图片样式配置
    imageStyle: {
      type: Object,
      value: {},
      observer: 'parseImageStyle'
      // 支持的属性：
      // borderRadius: 圆角，如 '50%' ?'10rpx'
      // border: 边框，如 '2rpx solid #fff'
      // boxShadow: 阴影，如 '0 4rpx 12rpx rgba(0,0,0,0.2)'
  },
    // 是否显示标签（用于显示姓名等文字）
    showLabel: {
      type: Boolean,
      value: false
    },
    // 标签样式配置
    labelStyle: {
      type: Object,
      value: {},
      observer: 'parseLabelStyle'
      // 支持的属性：
      // fontSize: 字体大小，如 '24rpx'
      // color: 文字颜色，如 '#333'
      // textAlign: 对齐方式，如 'center'
      // lineHeight: 行高，如 '32rpx'
      // fontWeight: 字重，如 'normal' 或 'bold'
  },
    // 标签高度（rpx）
    labelHeight: {
      type: Number,
      value: 32
    },
    // 是否启用自动高度调整（根据 items 数量自动计算容器高度）
    autoHeight: {
      type: Boolean,
      value: false
    },
    // 排序字段（单个字段名或多字段数组）
    sortBy: {
      type: null, // String | Array<String> | null
      value: null,
      observer: 'onSortByChange'
    },
    // 排序方向（升?降序，支持单个布尔值或数组数
      sortAscending: {
      type: null, // Boolean | Array<Boolean>
      value: true
    },
    // 自定义排序值获取函数
    getSortData: {
      type: Object,
      value: {}
      // 格式: { fieldName: (item) => sortValue }
  }
  },

  data: {
    itemsWithPosition: [], // 带位置信息的 items
    defaultAvatarUrl: '', // 默认头像 URL
    containerWidth: 750, // 容器宽度（rpx数
      containerHeight: 420, // 容器高度（rpx数
      computedHeight: '420rpx', // 计算后的容器高度（用于自动高度模式）
    rowHeight: 0, // 行高（rpx数
      rowHeightWithGutter: 0, // 包含间距的行高（rpx数
      gutter: 0, // 间距（rpx数
      rows: 1, // 行数
    rowXs: [], // 每行?X 坐标
    maxX: 0, // 最?X 数
      loadedCount: 0, // 已加载的图片数量
    backgroundColor: '#4A1FB8', // 背景颜色
    horizontalTransitions: [], // 水平过渡区域
    verticalTransitions: [], // 垂直过渡区域
    isGroupMode: false,
    groupedItems: [],
    activeGroupIndex: 0,
    // 图片样式
    imageStyleStr: '', // 编译后的图片样式字符数
      // 标签样式
    labelStyleStr: '', // 编译后的标签样式字符数
      // 排序状数
      currentSortBy: null, // 当前排序字段
    currentSortAscending: true, // 当前排序方向
    isSorting: false, // 是否正在排序中（防止重复触发数
      // 动画控制
    disableTransition: false // 是否禁用过渡动画
  },

  // 内部状态：标记是否正在使用动态接口（addItem/removeItem数
      _isUsingDynamicAPI: false,

  lifetimes: {
    attached() {
      const app = getApp();
      this.setData({
        defaultAvatarUrl: app.globalData.static_url + '/assets/default_avatar.webp'
      });
      this.parseSize();
      this.parseImageStyle();
      this.parseLabelStyle();
      this.initializeItems();
    },
    detached() {
      this.clearGroupTimer();
    }
  },

  methods: {
    /**
     * 解析尺寸字符?
  */
    parseSize() {
      const width = this.parseSizeValue(this.properties.width);
      const height = this.parseSizeValue(this.properties.height);
      const config = this.properties.masonryHorizontal || {};
      // 优先使用 properties.gutter，其次使?config.gutter，最后默认0
    const gutter = this.properties.gutter !== undefined ? this.properties.gutter : (config.gutter !== undefined ? config.gutter : 0);

      this.setData({
        containerWidth: width,
        containerHeight: height,
        computedHeight: this.properties.height,
        gutter,
        backgroundColor: this.properties.backgroundColor,
        horizontalTransitions: [],
        verticalTransitions: []
      });
    },

    /**
     * 解析图片样式配置
     */
    parseImageStyle() {
      const imageStyle = this.properties.imageStyle || {};
      const styles = [];
      
      if (imageStyle.borderRadius) {
        styles.push(`border-radius: ${imageStyle.borderRadius}`);
      }
      if (imageStyle.border) {
        styles.push(`border: ${imageStyle.border}`);
      }
      if (imageStyle.boxShadow) {
        styles.push(`box-shadow: ${imageStyle.boxShadow}`);
      }
      // 支持更多自定义样数
      if (imageStyle.opacity !== undefined) {
        styles.push(`opacity: ${imageStyle.opacity}`);
      }
      
      this.setData({
        imageStyleStr: styles.join('; ')
      });
    },

    /**
     * 解析标签样式配置
     */
    parseLabelStyle() {
      const labelStyle = this.properties.labelStyle || {};
      const styles = [];
      
      if (labelStyle.fontSize) {
        styles.push(`font-size: ${labelStyle.fontSize}`);
      }
      if (labelStyle.color) {
        styles.push(`color: ${labelStyle.color}`);
      }
      if (labelStyle.textAlign) {
        styles.push(`text-align: ${labelStyle.textAlign}`);
      }
      if (labelStyle.lineHeight) {
        styles.push(`line-height: ${labelStyle.lineHeight}`);
      }
      if (labelStyle.fontWeight) {
        styles.push(`font-weight: ${labelStyle.fontWeight}`);
      }
      if (labelStyle.background) {
        styles.push(`background: ${labelStyle.background}`);
      }
      if (labelStyle.padding) {
        styles.push(`padding: ${labelStyle.padding}`);
      }
      
      this.setData({
        labelStyleStr: styles.join('; ')
      });
    },

    /**
     * 计算自动高度（根?items 数量和容器宽度）
     * @param {Number} itemCount - items 数量
     * @param {Number} itemWidth - 单个 item 宽度（rpx?
  * @param {Number} itemHeight - 单个 item 高度（rpx?
  * @returns {Number} 计算后的容器高度（rpx?
  */
    calculateAutoHeight(itemCount, itemWidth, itemHeight) {
      if (!this.properties.autoHeight || itemCount === 0) {
        return this.data.containerHeight;
      }
      
      const { containerWidth, gutter } = this.data;
      const itemWidthWithGutter = itemWidth + gutter;
      
      // 如果显示标签，需要在高度计算中加上标签高数
      const showLabel = this.properties.showLabel;
      const labelHeight = showLabel ? this.properties.labelHeight : 0;
      const totalItemHeight = itemHeight + labelHeight;
      
      // 计算每行能容纳的 item 数量
    const itemsPerRow = Math.floor((containerWidth + gutter) / itemWidthWithGutter);
      const actualItemsPerRow = Math.max(itemsPerRow, 1);
      
      // 计算需要的行数
    const rowsNeeded = Math.ceil(itemCount / actualItemsPerRow);
      
      // 计算容器高度：行?* item总高?含标签 + (行数 - 1) * gutter + 50rpx 预留空间
    const newHeight = rowsNeeded * totalItemHeight + Math.max(0, rowsNeeded - 1) * gutter + 50;
      
      return Math.max(newHeight, totalItemHeight);
    },

    /**
     * 更新容器高度（供外部调用?
  * @param {String} newHeight - 新高度，?'350rpx'
     */
    setHeight(newHeight) {
      const height = this.parseSizeValue(newHeight);
      this.setData({
        containerHeight: height,
        computedHeight: newHeight
      }, () => {
        this.resetLayout();
        this.layoutItems();
      });
    },

    /**
     * 获取当前计算的高度信息（供外部调用）
     * @returns {Object} { height, rowsNeeded, itemsPerRow }
     */
    getHeightInfo() {
      const items = this.data.itemsWithPosition || [];
      if (items.length === 0) {
        return { height: this.data.containerHeight, rowsNeeded: 0, itemsPerRow: 0 };
      }
      
      const firstItem = items[0];
      // 始终使用 ini_width ?ini_height
    const itemWidth = firstItem.ini_width || firstItem.width || 100;
      const itemHeight = firstItem.ini_height || firstItem.height || 100;
      const { containerWidth, gutter } = this.data;
      
      const itemWidthWithGutter = itemWidth + gutter;
      const itemsPerRow = Math.max(Math.floor((containerWidth + gutter) / itemWidthWithGutter), 1);
      const rowsNeeded = Math.ceil(items.length / itemsPerRow);
      const height = this.calculateAutoHeight(items.length, itemWidth, itemHeight);
      
      return { height, rowsNeeded, itemsPerRow };
    },

    /**
     * 解析尺寸值（支持 rpx, px 等单位）
     */
    parseSizeValue(sizeStr) {
      if (typeof sizeStr === 'number') return sizeStr;
      const match = sizeStr && sizeStr.match(/^(\d+(?:\.\d+)?)(rpx|px)?$/);
      if (match) {
        return parseFloat(match[1]);
      }
      return 0;
    },

    /**
     * items 改变时重新初始化
     */
    onItemsChange(newVal, oldVal) {
      // 如果正在使用动态接口（addItem/removeItem），跳过重新初始化
    if (this._isUsingDynamicAPI) {
        return;
      }
      
      // 如果已经?itemsWithPosition，且?items 只是数量变化（可能是动态添加删除），
      // 则只同步数据，不重新初始化，避免全部飞出
    const newItems = Array.isArray(newVal) ? newVal : [];
      const currentItems = this.data.itemsWithPosition || [];
      
      // 如果当前?items，且?items 数量相同，检查是否只是属性变数
      if (currentItems.length > 0 && newItems.length === currentItems.length) {
        const currentIds = new Set(currentItems.map(i => String(i.id)));
        const newIds = new Set(newItems.map(i => String(i.id)));
        
        // 如果 ID 完全相同，说明只是属性变化（?quickActionBtn），需要更新但不重新初始化
    const idsMatch = currentIds.size === newIds.size && 
                         Array.from(currentIds).every(id => newIds.has(id));
        
        if (idsMatch) {          // 更新现有 items 的属性，保持位置信息
    const updatedItems = currentItems.map(currentItem => {
            const newItem = newItems.find(ni => String(ni.id) === String(currentItem.id));
            if (newItem) {
              // 保留位置信息，更新其他属性
  return {
                ...currentItem,
                ...newItem,
                x: currentItem.x,
                y: currentItem.y,
                loaded: currentItem.loaded,
                opacity: currentItem.opacity,
                translateX: currentItem.translateX,
                translateY: currentItem.translateY
              };
            }
            return currentItem;
          });
          
          this.setData({ itemsWithPosition: updatedItems });
          return;
        }
      }
      
      // 如果当前?items，且?items 数量只是 +1 ?-1，可能是动态操数
      // 这种情况下，如果?items 包含了当前所?items ?id，就不重新初始化
    if (currentItems.length > 0 && newItems.length > 0) {
        const diff = Math.abs(newItems.length - currentItems.length);
        
        // 如果只是新增一个或删除一个，检?id 匹配情况
    if (diff <= 1) {
          const currentIds = new Set(currentItems.map(i => String(i.id || (i.user_id ? `club-member-${i.user_id}` : ''))));
          const newIds = new Set(newItems.map(i => String(i.id || (i.user_id ? `club-member-${i.user_id}` : ''))));
          
          // 如果?items 包含了当前所?items ?id（只是新增或删除一个），就不重新初始化
    const allCurrentInNew = Array.from(currentIds).every(id => newIds.has(id));
          const allNewInCurrent = Array.from(newIds).every(id => currentIds.has(id));
          
          if (allCurrentInNew || allNewInCurrent) {
            // 只同步数据，不重新初始化
            return;
          }
        }
      }
      
      this.initializeItems();
    },

    /**
     * 初始?items
     */
    initializeItems() {
      const rawItems = Array.isArray(this.properties.items) ? this.properties.items : [];

      if (!rawItems || rawItems.length === 0) {
        this.clearGroupTimer();
        this.setData({
          itemsWithPosition: [],
          groupedItems: [],
          isGroupMode: false,
          activeGroupIndex: 0,
          loadedCount: 0
        });
        return;
      }

      const isGroupMode = Array.isArray(rawItems[0]);
      const groupedItems = isGroupMode ? rawItems : [rawItems];

      this.clearGroupTimer();

      this.setData({
        isGroupMode,
        groupedItems,
        activeGroupIndex: 0,
      }, () => {
        this.loadGroupItems(0);
        if (isGroupMode && groupedItems.length > 1) {
          this.startGroupTimer();
        }
      });
    },

    /**
     * 加载指定分组合items
     * @param {Number} groupIndex - 分组索引
     * @param {Boolean} withFlyInAnimation - 是否需要飞入动画（分组切换时为 true?
  */
    loadGroupItems(groupIndex = 0, withFlyInAnimation = false) {
      const groupedItems = this.data.groupedItems || [];
      const currentGroup = groupedItems[groupIndex] || [];

      if (currentGroup.length === 0) {
        this.setData({
          itemsWithPosition: [],
          loadedCount: 0,
          activeGroupIndex: groupIndex,
        }, () => {
          // 即使没有 items，也触发 layoutReady 事件
    this.triggerEvent('layoutReady', {
            itemCount: 0,
            height: 0,
            heightStr: '0rpx'
          });
        });
        return;
      }

      const useCustomSlot = this.properties.useCustomSlot || false;
      
      // 预先计算布局位置
    const { containerWidth, gutter } = this.data;
      const firstItemWidth = currentGroup[0]?.ini_width || 100;
      const firstItemHeight = currentGroup[0]?.ini_height || 100;
      const showLabel = this.properties.showLabel;
      const labelHeight = showLabel ? this.properties.labelHeight : 0;
      const totalItemHeight = firstItemHeight + labelHeight;
      const itemWidthWithGutter = firstItemWidth + gutter;
      const itemHeightWithGutter = totalItemHeight + gutter;
      const itemsPerRow = Math.max(Math.floor((containerWidth + gutter) / itemWidthWithGutter), 1);
      
      // 预先计算容器高度，避免后续高度跳数
      const rowsNeeded = Math.ceil(currentGroup.length / itemsPerRow);
      const preComputedHeight = rowsNeeded * totalItemHeight + Math.max(0, rowsNeeded - 1) * gutter + 50;
      const finalHeight = Math.max(preComputedHeight, totalItemHeight);
      
      const itemsWithPosition = currentGroup.map((item, index) => {
        // 计算最终位数
      const row = Math.floor(index / itemsPerRow);
        const col = index % itemsPerRow;
        const x = col * itemWidthWithGutter;
        const y = row * itemHeightWithGutter;
        
        // 分组切换时需要飞入动画：初始状态为透明且偏数
      // 首次加载时不需要飞入动画：直接显示在最终位数
      const needAnimation = withFlyInAnimation || (!useCustomSlot && !this.data.isGroupMode);
        
        return {
          ...item,
          index,
          originalIndex: index, // 保存原始顺序索引，用?resetSort
          x,
          y,
          width: item.ini_width || 100,
          height: item.ini_height || 100,
          loaded: useCustomSlot ? true : false, // 自定义slot不需要等待图片加数
      actualWidth: item.ini_width || 100,
          actualHeight: item.ini_height || 100,
          // 飞入动画：初始透明且向下偏数
      opacity: (useCustomSlot || !needAnimation) ? 1 : 0,
          translateX: 0,
          translateY: (useCustomSlot || !needAnimation) ? 0 : 40,
          _noTransition: !withFlyInAnimation // 分组切换时启用动数
      };
      });

      // 同时设置 items 和容器高度，避免高度跳变
    const heightUpdate = this.properties.autoHeight ? {
        containerHeight: finalHeight,
        computedHeight: `${finalHeight}rpx`
      } : {};

      this.setData({
        itemsWithPosition,
        loadedCount: 0,
        activeGroupIndex: groupIndex,
        ...heightUpdate
      }, () => {
        this.resetLayout();
        this.layoutItems();
        
        // 触发高度变化事件
    if (this.properties.autoHeight) {
          this.triggerEvent('heightChange', {
            height: finalHeight,
            heightStr: `${finalHeight}rpx`,
            itemCount: currentGroup.length,
            rowsNeeded,
            itemsPerRow
          });
        }
        
        // 触发布局就绪事件（占位完成，可以隐藏骨架屏）
    this.triggerEvent('layoutReady', {
          itemCount: currentGroup.length,
          height: finalHeight,
          heightStr: `${finalHeight}rpx`
        });
        
        // 延迟启用动画，确保初始位置已渲染
        setTimeout(() => {
          this.enableTransitions();
        }, 50);
      });
    },
    
    /**
     * 启用所?items 的过渡动?
  */
    enableTransitions() {
      const items = this.data.itemsWithPosition || [];
      if (items.length === 0) return;
      
      // 启用动画并触发飞入效果（设置最终状态）
    const updatedItems = items.map(item => ({
        ...item,
        _noTransition: false,
        opacity: 1,
        translateX: 0,
        translateY: 0
      }));
      
      this.setData({ itemsWithPosition: updatedItems });
    },

    /**
     * 启动分组轮播定时?
  */
    startGroupTimer() {
      const groupedItems = this.data.groupedItems || [];
      if (!this.data.isGroupMode || groupedItems.length <= 1) {
        return;
      }
      this.clearGroupTimer();
      const interval = this.properties.groupInterval || 6000;
      this.groupTimer = setTimeout(() => {
        this.handleGroupTransition();
      }, interval);
    },

    /**
     * 清除定时?
  */
    clearGroupTimer() {
      if (this.groupTimer) {
        clearTimeout(this.groupTimer);
        this.groupTimer = null;
      }
    },

    /**
     * 处理分组切换
     */
    handleGroupTransition() {
      const groupedItems = this.data.groupedItems || [];
      if (!this.data.isGroupMode || groupedItems.length <= 1) {
        return;
      }

      const nextIndex = (this.data.activeGroupIndex + 1) % groupedItems.length;
      const duration = this.getTransitionDurationMs();

      // 先执行飞出动数
      this.triggerLeaveAnimation();

      // 等飞出动画完成后再加载下一数
      setTimeout(() => {
        this.loadGroupItems(nextIndex, true); // 传入 true 表示需要飞入动数
      this.startGroupTimer();
      }, duration);
    },

    /**
     * 执行飞出动画（飞入的反向?
  */
    triggerLeaveAnimation() {
      const itemsWithPosition = this.data.itemsWithPosition || [];
      if (!itemsWithPosition.length) {
        return;
      }

      const updatedItems = itemsWithPosition.map(item => ({
        ...item,
        opacity: 0,
        translateX: -item.x,
        translateY: 40 - item.y,
        _noTransition: false // 确保动画生效
  }));

      this.setData({
        itemsWithPosition: updatedItems
      });
    },

    /**
     * 获取过渡时长（ms?
  */
    getTransitionDurationMs() {
      const duration = this.properties.transitionDuration;
      if (typeof duration === 'number') {
        return duration;
      }
      if (!duration || typeof duration !== 'string') {
        return 400;
      }

      const value = parseFloat(duration);
      if (isNaN(value)) {
        return 400;
      }

      if (duration.endsWith('ms')) {
        return value;
      }

      if (duration.endsWith('s')) {
        return value * 1000;
      }

      return value;
    },

    /**
     * 重置布局（参数masonry-horizontal.js ?_resetLayout?
  */
    resetLayout() {
      const { containerHeight, gutter } = this.data;
      const config = this.properties.masonryHorizontal || {};

      let rowHeight = config.rowHeight || 0;
      if (!rowHeight && this.data.itemsWithPosition.length > 0) {
        const firstItem = this.data.itemsWithPosition[0];
        rowHeight = firstItem.height || 100;
      }

      const rowHeightWithGutter = rowHeight + gutter;
      let rows = Math.floor((containerHeight + gutter) / rowHeightWithGutter);
      rows = Math.max(rows, 1);

      const rowXs = new Array(rows).fill(0);

      this.setData({
        rowHeight,
        rowHeightWithGutter,
        rows,
        rowXs,
        maxX: 0
      });
    },

    /**
     * 对所?items 进行布局
     */
    layoutItems() {
      const layoutMode = this.properties.layoutMode || 'masonryHorizontal';
      
      if (layoutMode === 'fitRows') {
        this.layoutItemsFitRows();
      } else {
        this.layoutItemsMasonryHorizontal();
      }
    },

    /**
     * 网格布局（fitRows? 适合等宽等高?items，如头像组
  * 按行从左到右排列，满一行后换行
     */
    layoutItemsFitRows() {
      const { itemsWithPosition, gutter, containerWidth } = this.data;
      
      if (!itemsWithPosition.length) return;
      
      const firstItem = itemsWithPosition[0];
      // 始终使用 ini_width ?ini_height，确保布局一数
      const itemWidth = firstItem.ini_width || firstItem.width || 100;
      const itemHeight = firstItem.ini_height || firstItem.height || 100;
      
      // 如果显示标签，需要在布局计算中加上标签高数
      const showLabel = this.properties.showLabel;
      const labelHeight = showLabel ? this.properties.labelHeight : 0;
      const totalItemHeight = itemHeight + labelHeight;
      
      const itemWidthWithGutter = itemWidth + gutter;
      const itemHeightWithGutter = totalItemHeight + gutter;
      
      // 计算每行能容纳的 item 数量
    const itemsPerRow = Math.max(Math.floor((containerWidth + gutter) / itemWidthWithGutter), 1);
      
      const updatedItems = itemsWithPosition.map((item, idx) => {
        const row = Math.floor(idx / itemsPerRow);
        const col = idx % itemsPerRow;
        const x = col * itemWidthWithGutter;
        const y = row * itemHeightWithGutter;
        
        return {
          ...item,
          x,
          y
        };
      });

      this.setData({
        itemsWithPosition: updatedItems
      }, () => {
        // 自动高度模式：布局完成后更新容器高数
      if (this.properties.autoHeight && updatedItems.length > 0) {
          this.updateAutoHeight();
        }
      });
    },

    /**
     * 水平瀑布流布局（masonryHorizontal?
  */
    layoutItemsMasonryHorizontal() {
      const { itemsWithPosition, rowHeight, gutter, rows } = this.data;
      const rowXs = [...this.data.rowXs];
      let maxX = 0;

      const updatedItems = itemsWithPosition.map(item => {
        const position = this.getItemLayoutPosition(item, rowXs, rows);

        const setWidth = position.x + item.width + gutter;
        const rowSpan = position.rowSpan;
        const shortRowIndex = position.rowIndex;

        for (let i = 0; i < rowSpan; i++) {
          rowXs[shortRowIndex + i] = setWidth;
        }

        maxX = Math.max(maxX, setWidth);

        return {
          ...item,
          x: position.x,
          y: position.y
        };
      });

      this.setData({
        itemsWithPosition: updatedItems,
        rowXs,
        maxX
      }, () => {
        // 自动高度模式：布局完成后更新容器高数
      if (this.properties.autoHeight && updatedItems.length > 0) {
          this.updateAutoHeight();
        }
      });
    },

    /**
     * 更新自动高度
     */
    updateAutoHeight() {
      const items = this.data.itemsWithPosition || [];
      if (items.length === 0) return;
      
      const firstItem = items[0];
      // 始终使用 ini_width ?ini_height，因为这是用户设置的期望尺寸
    const itemWidth = firstItem.ini_width || firstItem.width || 100;
      const itemHeight = firstItem.ini_height || firstItem.height || 100;
      
      const newHeight = this.calculateAutoHeight(items.length, itemWidth, itemHeight);
      const newHeightStr = `${newHeight}rpx`;
      
      // 更新高度
    this.setData({
        containerHeight: newHeight,
        computedHeight: newHeightStr
      });
      
      // 触发高度变化事件，供外部监听
    this.triggerEvent('heightChange', {
        height: newHeight,
        heightStr: newHeightStr,
        itemCount: items.length,
        ...this.getHeightInfo()
      });
    },

    /**
     * 获取单个 item 的布局位置（参数masonry-horizontal.js ?_getItemLayoutPosition?
  */
    getItemLayoutPosition(item, rowXs, rows) {
      const { rowHeight, rowHeightWithGutter } = this.data;

      const remainder = item.height % rowHeight;
      const mathMethod = remainder && remainder < 1 ? 'round' : 'ceil';
      let rowSpan = Math[mathMethod](item.height / rowHeight);
      rowSpan = Math.min(rowSpan, rows);

      const rowGroup = this.getRowGroup(rowSpan, rowXs, rows);
      const minimumX = Math.min(...rowGroup);
      const shortRowIndex = rowGroup.indexOf(minimumX);
      const y = rowHeightWithGutter * shortRowIndex;

      return {
        x: minimumX,
        y,
        rowSpan,
        rowIndex: shortRowIndex
      };
    },

    /**
     * 获取行组（参数masonry-horizontal.js ?_getRowGroup?
  */
    getRowGroup(rowSpan, rowXs, rows) {
      if (rowSpan < 2) {
        return rowXs;
      }

      const rowGroup = [];
      const groupCount = rows + 1 - rowSpan;

      for (let i = 0; i < groupCount; i++) {
        const groupRowXs = rowXs.slice(i, i + rowSpan);
        rowGroup[i] = Math.max(...groupRowXs);
      }

      return rowGroup;
    },

    /**
     * 图片加载成功
     */
    onImageLoad(e) {
      const { index } = e.currentTarget.dataset;
      const detail = e.detail || {};
      const imgWidth = detail.width || 0;
      const imgHeight = detail.height || 0;

      const item = this.data.itemsWithPosition[index];
      if (!item) return;

      const layoutMode = this.properties.layoutMode || 'masonryHorizontal';
      
      // fitRows 模式：使用固定尺寸，图片加载只更新loaded 状态，不触发重布局
    if (layoutMode === 'fitRows') {
        // 使用路径更新，避免复制整个数数
      this.setData({
          [`itemsWithPosition[${index}].loaded`]: true,
          [`itemsWithPosition[${index}].actualWidth`]: imgWidth,
          [`itemsWithPosition[${index}].actualHeight`]: imgHeight,
          loadedCount: this.data.loadedCount + 1
        });
        return;
      }

      // masonryHorizontal 模式：根据图片实际宽高比调整宽度并重新布局
    const itemsWithPosition = [...this.data.itemsWithPosition];
      let actualWidth = item.ini_width;
      let actualHeight = item.ini_height;

      if (imgWidth && imgHeight) {
        const aspectRatio = imgWidth / imgHeight;
        actualWidth = actualHeight * aspectRatio;
      }

      itemsWithPosition[index] = {
        ...item,
        width: actualWidth,
        height: actualHeight,
        actualWidth: imgWidth,
        actualHeight: imgHeight,
        loaded: true,
        opacity: 1,
        translateX: 0,
        translateY: 0
      };

      this.setData({
        itemsWithPosition,
        loadedCount: this.data.loadedCount + 1
      });

      this.resetLayout();
      this.layoutItems();
    },

    /**
     * 图片加载失败
     */
    onImageError(e) {
      const { index } = e.currentTarget.dataset;

      const item = this.data.itemsWithPosition[index];
      if (!item) return;

      const layoutMode = this.properties.layoutMode || 'masonryHorizontal';
      
      // fitRows 模式：只更新状态，不触发重布局
    if (layoutMode === 'fitRows') {
        this.setData({
          [`itemsWithPosition[${index}].loaded`]: true,
          [`itemsWithPosition[${index}].error`]: true,
          loadedCount: this.data.loadedCount + 1
        });
        return;
      }

      // masonryHorizontal 模式：需要重新布局
    const itemsWithPosition = [...this.data.itemsWithPosition];
      itemsWithPosition[index] = {
        ...item,
        loaded: true,
        error: true,
        opacity: 1,
        translateX: 0,
        translateY: 0
      };

      this.setData({
        itemsWithPosition,
        loadedCount: this.data.loadedCount + 1
      });

      this.resetLayout();
      this.layoutItems();
    },

    /**
     * item 触摸开始- 记录起始位置和时?
  */
    onItemTouchStart(e) {
      const t = e?.touches?.[0] || e?.changedTouches?.[0];
      if (t) {
        this.__itemTouchStartX = t.clientX;
        this.__itemTouchStartY = t.clientY;
        this.__itemTouchStartTime = Date.now();
      }
    },

    /**
     * item 触摸结束 - 判断是否为点击并触发事件
     */
    onItemTouchEnd(e) {
      const { index, id, item } = e.currentTarget.dataset;
      
      // 获取触摸结束坐标 - touchend 事件使用 changedTouches
    const t = e?.changedTouches?.[0] || e?.touches?.[0];
      if (!t) return;
      
      const tapX = t.clientX;
      const tapY = t.clientY;
      
      // 判断是否为拖动操作（移动距离超过阈值或时间过长数
      if (this.__itemTouchStartX !== undefined) {
        const dx = Math.abs(tapX - this.__itemTouchStartX);
        const dy = Math.abs(tapY - this.__itemTouchStartY);
        const dt = Date.now() - (this.__itemTouchStartTime || 0);
        
        // 如果移动距离超过10px或时间超时00ms，认为是拖动而非点击
    if (dx > 10 || dy > 10 || dt > 300) {
          return;
        }
      }
      
      this.triggerEvent('itemtap', { index, id, item, tapX, tapY });
    },

    /**
     * 点击 item 时触发事件（保留用于兼容，但不再使用?
  */
    onItemTap(e) {
      const { index, id, item } = e.currentTarget.dataset;
      // 获取点击坐标 - tap 事件的坐标在 e.detail 数
      let tapX = 0, tapY = 0;
      
      // 优先使用 detail 中的坐标（tap 事件数
      if (e.detail && (e.detail.x !== undefined || e.detail.y !== undefined)) {
        tapX = e.detail.x || 0;
        tapY = e.detail.y || 0;
      } else if (e.touches && e.touches[0]) {
        // 降级：touchstart/touchmove 事件
        tapX = e.touches[0].clientX || e.touches[0].pageX || 0;
        tapY = e.touches[0].clientY || e.touches[0].pageY || 0;
      } else if (e.changedTouches && e.changedTouches[0]) {
        // 降级：touchend 事件
        tapX = e.changedTouches[0].clientX || e.changedTouches[0].pageX || 0;
        tapY = e.changedTouches[0].clientY || e.changedTouches[0].pageY || 0;
      }
      
      this.triggerEvent('itemtap', { index, id, item, tapX, tapY });
    },

    /**
     * 计算图片四边模糊过渡区域（不再需要，因为现在是每个图片都有四边模糊）
     */
    calculateTransitions() {
      this.setData({
        horizontalTransitions: [],
        verticalTransitions: []
      });
    },

    /**
     * 对外暴露：动态添加单击item
     * @param {Object} item - 要添加的 item 对象，格式：{ id, image, ini_width, ini_height, ... }
     * @param {Object} options - 选项
     * @param {Number} options.index - 插入位置（可选，默认追加到末尾）
     */
    addItem(item, options = {}) {
      if (!item || !item.id) {        return;
      }

      const { index } = options;
      const currentItems = [...this.data.itemsWithPosition];
      
      // 检查是否已存在
    const exists = currentItems.some(i => String(i.id) === String(item.id));
      if (exists) {        return;
      }

      // 计算?item ?originalIndex（取当前最?originalIndex + 1数
      const maxOriginalIndex = currentItems.reduce((max, i) => Math.max(max, i.originalIndex || 0), -1);
      
      const useCustomSlot = this.properties.useCustomSlot || false;
      const newItem = {
        ...item,
        index: typeof index === 'number' ? index : currentItems.length,
        originalIndex: maxOriginalIndex + 1, // 保存原始顺序索引
        x: 0,
        y: 0,
        width: item.ini_width || 100,
        height: item.ini_height || 100,
        loaded: true, // 直接显示，不等待图片加载
        actualWidth: item.ini_width || 100,
        actualHeight: item.ini_height || 100,
        opacity: 1, // 直接显示
        translateX: 0,
        translateY: 0
      };

      // 插入或追数
      if (typeof index === 'number' && index >= 0 && index <= currentItems.length) {
        currentItems.splice(index, 0, newItem);
        // 更新后续 items ?index
    for (let i = index + 1; i < currentItems.length; i++) {
          currentItems[i].index = i;
        }
      } else {
        currentItems.push(newItem);
      }

      // 标记正在使用动态接口，避免 onItemsChange 触发重新初始化
    this._isUsingDynamicAPI = true;

      this.setData({
        itemsWithPosition: currentItems,
        loadedCount: useCustomSlot ? currentItems.length : this.data.loadedCount
      }, () => {
        this.resetLayout();
        this.layoutItems();
        // 布局完成后，重置标志
        setTimeout(() => {
          this._isUsingDynamicAPI = false;
        }, 300);
      });
    },

    /**
     * 对外暴露：动态删除单击item
     * @param {String|Number} itemId - 要删除的 item ?id
     */
    removeItem(itemId) {
      if (itemId === undefined || itemId === null) {        return;
      }

      const currentItems = [...this.data.itemsWithPosition];
      const itemIdStr = String(itemId);
      const index = currentItems.findIndex(i => String(i.id) === itemIdStr);

      if (index === -1) {        return;
      }

      // 获取要删除的 item
    const itemToRemove = currentItems[index];
      
      // 标记正在使用动态接口，避免 onItemsChange 触发重新初始化
    this._isUsingDynamicAPI = true;

      // 先执行向下滑出动画（原地向下滑出并淡出）
    const tempItems = [...currentItems];
      tempItems[index] = {
        ...itemToRemove,
        opacity: 0,
        translateX: 0,  // 不水平移数
      translateY: 60  // 向下滑出
  };
      this.setData({ itemsWithPosition: tempItems });

      // 延迟删除，让滑出动画先执数
      const duration = this.getTransitionDurationMs();
      setTimeout(() => {
        // 从数组中移除?item
    const remainingItems = currentItems.filter((_, i) => i !== index);
        
        // 更新后续 items ?index
    for (let i = 0; i < remainingItems.length; i++) {
          remainingItems[i].index = i;
        }

        this.setData({
          itemsWithPosition: remainingItems,
          loadedCount: Math.max(0, this.data.loadedCount - 1)
        }, () => {
          this.resetLayout();
          this.layoutItems();
          // 布局完成后，重置标志
          setTimeout(() => {
            this._isUsingDynamicAPI = false;
          }, 300);
        });
      }, duration);
    },

    // ==================== 排序功能 ====================

    /**
     * sortBy 属性变化时的处理
  */
    onSortByChange(newVal, oldVal) {
      // 避免初始化时触发
    if (oldVal === undefined) return;
      // 避免重复触发
    if (this.data.isSorting) return;
      
      this.sortItems(newVal, this.properties.sortAscending);
    },

    /**
     * 获取 item 的排序?
  * @param {Object} item - item 对象
     * @param {String} key - 排序字段?
  * @returns {*} 排序?
  */
    getSortValue(item, key) {
      // 特殊处理：原始顺数
      if (key === 'original') {
        return item.originalIndex;
      }
      
      // 优先?getSortData 获取自定义函数
      const getSortData = this.properties.getSortData || {};
      if (getSortData[key] && typeof getSortData[key] === 'function') {
        try {
          return getSortData[key](item);
        } catch (e) {          return undefined;
        }
      }
      
      // 否则直接访问 item 字段
      return item[key];
    },

    /**
     * 比较两个?
  * @param {*} valueA - ?A
     * @param {*} valueB - ?B
     * @param {Boolean} ascending - 是否升序
     * @returns {Number} 比较结果 (-1, 0, 1)
     */
    compareValues(valueA, valueB, ascending = true) {
      // 处理 null/undefined/空字符串
    const isEmptyA = valueA === undefined || valueA === null || valueA === '';
      const isEmptyB = valueB === undefined || valueB === null || valueB === '';
      
      if (isEmptyA && isEmptyB) {
        return 0; // 都为空，相等
  }
      if (isEmptyA) {
        return 1; // A 为空，排到末尾（无论升序降序数
      }
      if (isEmptyB) {
        return -1; // B 为空，排到末尾（无论升序降序数
      }
      
      let result = 0;
      
      // 字符串比较（使用 localeCompare 支持中文数
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        result = valueA.localeCompare(valueB, 'zh-CN');
      }
      // 数字比较
      else if (typeof valueA === 'number' && typeof valueB === 'number') {
        result = valueA - valueB;
      }
      // Date 对象比较
      else if (valueA instanceof Date && valueB instanceof Date) {
        result = valueA.getTime() - valueB.getTime();
      }
      // 尝试转换为数字比?
  else {
        const numA = Number(valueA);
        const numB = Number(valueB);
        if (!isNaN(numA) && !isNaN(numB)) {
          result = numA - numB;
        } else {
          // 转为字符串比数
      result = String(valueA).localeCompare(String(valueB), 'zh-CN');
        }
      }
      
      return ascending ? result : -result;
    },

    /**
     * 比较两个 items
     * @param {Object} a - item A
     * @param {Object} b - item B
     * @param {String|Array} sortBy - 排序字段
     * @param {Boolean|Array} sortAscending - 排序方向
     * @returns {Number} 比较结果
     */
    compareItems(a, b, sortBy, sortAscending) {
      // 标准化为数组
    const sortByArr = Array.isArray(sortBy) ? sortBy : [sortBy];
      const ascendingArr = Array.isArray(sortAscending) ? sortAscending : [sortAscending];
      
      for (let i = 0; i < sortByArr.length; i++) {
        const key = sortByArr[i];
        const ascending = ascendingArr[i] !== undefined ? ascendingArr[i] : true;
        
        const valueA = this.getSortValue(a, key);
        const valueB = this.getSortValue(b, key);
        
        const result = this.compareValues(valueA, valueB, ascending);
        
        // 如果不相等，返回结果；否则继续比较下一个字数
      if (result !== 0) {
          return result;
        }
      }
      
      return 0;
    },

    /**
     * 执行排序（核心方法）
     * @param {String|Array} sortBy - 排序字段
     * @param {Boolean|Array} sortAscending - 排序方向
     */
    sortItems(sortBy, sortAscending = true) {
      // 防止重复触发
    if (this.data.isSorting) return;
      
      const currentItems = this.data.itemsWithPosition || [];
      if (currentItems.length === 0) return;
      
      // 如果 sortBy 为空，不执行排序
    if (!sortBy || (Array.isArray(sortBy) && sortBy.length === 0)) {
        return;
      }
      
      this.setData({ isSorting: true });
      
      // 复制数组进行排序
    const sortedItems = [...currentItems].sort((a, b) => {
        return this.compareItems(a, b, sortBy, sortAscending);
      });
      
      // 更新 index 属数
      for (let i = 0; i < sortedItems.length; i++) {
        sortedItems[i].index = i;
      }
      
      // 更新状数
      this.setData({
        itemsWithPosition: sortedItems,
        currentSortBy: sortBy,
        currentSortAscending: sortAscending
      }, () => {
        // 重新布局
    this.resetLayout();
        this.layoutItems();
        
        // 排序完成后重置标志并触发事件
    this.setData({ isSorting: false });
        
        // 触发 sortComplete 事件
    this.triggerEvent('sortComplete', {
          sortBy: sortBy,
          sortAscending: sortAscending,
          items: sortedItems
        });
      });
    },

    /**
     * 对外暴露：排序方式
  * @param {String|Array} sortBy - 排序字段
     * @param {Boolean|Array} sortAscending - 排序方向（可选，默认 true?
  */
    sort(sortBy, sortAscending) {
      const ascending = sortAscending !== undefined ? sortAscending : this.properties.sortAscending;
      this.sortItems(sortBy, ascending);
    },

    /**
     * 对外暴露：随机打开
  */
    shuffle() {
      const currentItems = this.data.itemsWithPosition || [];
      if (currentItems.length <= 1) return;
      
      // Fisher-Yates 洗牌算法
    const shuffled = [...currentItems];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      
      // 更新 index 属数
      for (let i = 0; i < shuffled.length; i++) {
        shuffled[i].index = i;
      }
      
      this.setData({
        itemsWithPosition: shuffled,
        currentSortBy: 'random',
        currentSortAscending: true
      }, () => {
        this.resetLayout();
        this.layoutItems();
        
        // 触发 sortComplete 事件
    this.triggerEvent('sortComplete', {
          sortBy: 'random',
          sortAscending: true,
          items: shuffled
        });
      });
    },

    /**
     * 对外暴露：重置为原始顺序
     */
    resetSort() {
      this.sortItems('original', true);
    },

    /**
     * 快速操作按钮点击事件
  * 触发 quickaction 事件，将 item 数据传递给父组合
  */
    onQuickActionTap(e) {
      const { item } = e.currentTarget.dataset;
      this.triggerEvent('quickaction', { item });
    },

    /**
     * 空操作，用于阻止事件冒泡
     */
    noop() {
      // 什么都不做，只是阻止事件冒数
      }
  }
});
