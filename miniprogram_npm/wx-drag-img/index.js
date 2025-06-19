Component({
  options: {
    multipleSlots: true
  },
  properties: {
    previewSize: {
      type: Number,
      value: 100
    },
    defaultImgList: {
      type: Array,
      value: [],
      observer(newVal) {     
          const imgList = this.getDragImgList([...newVal]);
          this.setUploadPosition(imgList.length);
          this.setData({
            dragImgList: imgList
          });
      }
    },
    maxCount: {
      type: Number,
      value: 9
    },
    columns: {
      type: Number,
      value: 3
    },
    gap: {
      type: Number,
      value: 9
    },
    deleteStyle: {
      type: String,
      value: ""
    }
  },
  data: {
    dragImgList: [],
    containerRes: {
      top: 0,
      left: 0,
      width: 0,
      height: 0
    },
    currentKey: -1,
    currentIndex: -1,
    tranX: 0,
    tranY: 0,
    uploadPosition: {
      tranX: 0,
      tranY: 0
    },
    dragOffsetX: 0,
    dragOffsetY: 0
  },
  lifetimes: {
    ready() {
      this.updateContainerSize();
    }
  },
  methods: {
    updateContainerSize() {
      this.createSelectorQuery()
        .select(".drag-container")
        .boundingClientRect((rect) => {
          if (rect) {
            this.setData({
              "containerRes.width": rect.width,
              "containerRes.height": rect.height
            });
          }
        })
        .exec();
    },
    getElementPosition(selector) {
      return new Promise((resolve) => {
        this.createSelectorQuery()
          .select(selector)
          .boundingClientRect((rect) => {
            if (rect) {
              resolve(rect);
            } else {
              resolve(null);
            }
          })
          .exec();
      });
    },
    async getTouchPosition(e) {
      try {
        const container = await this.getElementPosition(".drag-container");
        if (!container) {
          return { x: 0, y: 0 };
        }
        
        const touch = e.touches[0];
        
        return {
          x: touch.clientX - container.left,
          y: touch.clientY - container.top
        };
      } catch (error) {
        return { x: 0, y: 0 };
      }
    },
    async longPress(e) {
      const index = e.mark.index;
      const { previewSize } = this.data;     
      const touchPos = await this.getTouchPosition(e);
      
      const item = this.data.dragImgList[index];
      
      const offsetX = touchPos.x - (item.tranX + previewSize/2);
      const offsetY = touchPos.y - (item.tranY + previewSize/2);
      
      this.setData({
        dragOffsetX: offsetX,
        dragOffsetY: offsetY,
        currentIndex: index,
        tranX: touchPos.x - previewSize/2 - offsetX,
        tranY: touchPos.y - previewSize/2 - offsetY
      });

    },
    async touchMove(e) {
      if (this.data.currentIndex < 0) return;
      
      const { previewSize } = this.data;
      const { dragOffsetX, dragOffsetY } = this.data;
      
      const touchPos = await this.getTouchPosition(e);
      
      const moveX = touchPos.x - previewSize/2 - dragOffsetX;
      const moveY = touchPos.y - previewSize/2 - dragOffsetY;
      
      this.setData({
        tranX: moveX,
        tranY: moveY
      });
      
      const centerX = moveX + previewSize/2;
      const centerY = moveY + previewSize/2;
      
      const currentKey = e.mark.key;
      const targetKey = this.getTargetKey(centerX, centerY);
      
      if (currentKey !== targetKey && this.data.currentKey !== currentKey) {
        this.data.currentKey = currentKey;
        this.swapImages(currentKey, targetKey);
      }

    },
    getTargetKey(x, y) {
      const {dragImgList, previewSize, columns, gap} = this.data;
      
      const cellSize = previewSize + gap;
      
      const col = Math.floor(x / cellSize);
      const row = Math.floor(y / cellSize);
      
      const safeCol = Math.max(0, Math.min(col, columns - 1));
      const maxRow = Math.ceil(dragImgList.length / columns) - 1;
      const safeRow = Math.max(0, Math.min(row, maxRow));
      
      const targetKey = safeRow * columns + safeCol;
      
      return Math.min(targetKey, dragImgList.length - 1);
    },
    touchEnd() {
      this.setData({
        tranX: 0,
        tranY: 0,
        currentIndex: -1,
        dragOffsetX: 0,
        dragOffsetY: 0
      });
      this.data.currentKey = -1;
    },
    swapImages(fromKey, toKey) {
      const images = this.data.dragImgList;
      
      images.forEach(img => {
        if (fromKey < toKey) {
          if (img.key > fromKey && img.key <= toKey) {
            img.key--;
          } else if (img.key === fromKey) {
            img.key = toKey;
          }
        } else {
          if (img.key >= toKey && img.key < fromKey) {
            img.key++;
          } else if (img.key === fromKey) {
            img.key = toKey;
          }
        }
      });
      
      this.updatePositions(images);
      this.updateLabels(images);
      
      this.setData({
        dragImgList: images
      });
    },
    isNewImage(src) {
      return src.startsWith('http://tmp/') || src.startsWith('wxfile://');
    },
    updateLabels(imgList) {
      imgList.forEach(img => {
        const isCover = img.key === 0;
        const isNew = this.isNewImage(img.src);
        if (isCover) {
          img.label = isNew ? '封面 新增' : '封面 已有';
        } else {
          img.label = isNew ? '新增' : '已有';
        }
      });
      
      return imgList;
    },
    updatePositions(imgList) {
      const {previewSize, columns, gap} = this.data;
      
      imgList.forEach(img => {
        img.tranX = (previewSize + gap) * (img.key % columns);
        img.tranY = Math.floor(img.key / columns) * (previewSize + gap);
      });
      
      this.setData({
        dragImgList: imgList
      });
      
      this.triggerImageUpdate(imgList);
      return imgList;
    },
    triggerImageUpdate(imgList) {
      const sortedImages = [...imgList]
        .sort((a, b) => a.key - b.key)
        .map(img => img.src);
      this.triggerEvent("updateImageList", {
        list: sortedImages
      });
    },
    async uploadImage() {
      let {dragImgList, maxCount} = this.data;
      
      const res = await wx.chooseMedia({
        count: maxCount - dragImgList.length,
        mediaType: ["image"]
      });
      
      if (!res || !res.tempFiles || !res.tempFiles.length) return;
      
      const newImages = this.getDragImgList(
        res.tempFiles.map(file => file.tempFilePath), 
        false
      );
      
      const updatedList = dragImgList.concat(newImages);
      
      this.setUploadPosition(updatedList.length);
      
      this.setData({
        dragImgList: updatedList
      });
      
      this.triggerImageUpdate(updatedList);

    },
    getContainerSize(count) {
      const {columns, previewSize, maxCount, gap} = this.data;
      
      const totalItems = count >= maxCount ? count : count + 1;
      const rows = Math.ceil(totalItems / columns);
      
      return {
        width: columns * previewSize + (columns - 1) * gap,
        height: rows * previewSize + (rows - 1) * gap
      };
    },
    getDragImgList(images, isInitial = true) {
      const {dragImgList, previewSize, columns, gap} = this.data;
      
      const newImgList = images.map((src, index) => {
        const key = (isInitial ? 0 : dragImgList.length) + index;
        
        return {
          tranX: (previewSize + gap) * (key % columns),
          tranY: Math.floor(key / columns) * (previewSize + gap),
          src: src,
          id: `img_${Date.now()}_${index}`,
          key: key,
          loading: false
        };
      });
      
      return this.updateLabels(newImgList);
    },
    setUploadPosition(count) {
      const {previewSize, columns, gap} = this.data;
      
      const position = {
        tranX: (count % columns) * (previewSize + gap),
        tranY: Math.floor(count / columns) * (previewSize + gap)
      };
      
      const containerSize = this.getContainerSize(count);
      
      this.setData({
        uploadPosition: position,
        "containerRes.width": containerSize.width,
        "containerRes.height": containerSize.height
      });
    },
    deleteImg(e) {
      const key = e.mark.key;
      const images = this.data.dragImgList.filter(img => img.key !== key);
      
      images.forEach(img => {
        if (img.key > key) {
          img.key--;
        }
      });
      
      this.updateLabels(images);
      
      const {previewSize, columns, gap} = this.data;
      images.forEach(img => {
        img.tranX = (previewSize + gap) * (img.key % columns);
        img.tranY = Math.floor(img.key / columns) * (previewSize + gap);
      });
      
      this.setData({
        dragImgList: images
      });
      
      this.setUploadPosition(images.length);
      
      this.triggerImageUpdate(images);
    },
    updateImageUrl(tmpUrl, newUrl) {
      const {dragImgList} = this.data;
      
      const updatedList = dragImgList.map(img => {
        if (img.src === tmpUrl) {
          img.src = newUrl;
          img.loading = false;
        }
        return img;
      });
      
      this.setData({
        dragImgList: updatedList
      });
      
      return updatedList;
    },
    updateImageLabel(tmpUrl) {
        const {dragImgList} = this.data;
        
        const updatedList = dragImgList.map(img => {
            const isCover = img.key === 0;
          if (img.src === tmpUrl && isCover) {
            img.label = '封面 已有';
          }
          if (img.src === tmpUrl && !isCover) {
            img.label = '已有';
          }
          return img;
        });
        
        this.setData({
          dragImgList: updatedList
        });
        
        return updatedList;
    },
    setImageLoading(tmpUrl) {
      const {dragImgList} = this.data;
      
      const updatedList = dragImgList.map(img => {
        if (img.src === tmpUrl) {
          img.loading = true;
        }
        return img;
      });
      
      this.setData({
        dragImgList: updatedList
      });
      
      return updatedList;
    },
    delImageLoading(tmpUrl) {
        const {dragImgList} = this.data;
        
        const updatedList = dragImgList.map(img => {
          if (img.src === tmpUrl) {
            img.loading = false;
          }
          return img;
        });
        
        this.setData({
          dragImgList: updatedList
        });
        
        return updatedList;
      }
  }
});