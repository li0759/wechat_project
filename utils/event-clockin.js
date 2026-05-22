const app = getApp();

function uploadSignature(tempFilePath) {
  const token = wx.getStorageSync('token');
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${app.globalData.request_url}/file/upload_file`,
      filePath: tempFilePath,
      name: 'file',
      header: {
        Authorization: `Bearer ${token}`,
      },
      success(res) {
        try {
          const data = JSON.parse(res.data);
          if (String(data.Flag) === '4000' && data.data && data.data.file_id) {
            resolve(data.data.file_id);
            return;
          }
          reject(new Error(data.message || '签名上传失败'));
        } catch (err) {
          reject(new Error('解析上传响应失败'));
        }
      },
      fail(err) {
        reject(err || new Error('签名上传失败'));
      },
    });
  });
}

function submitClockIn(eventId, clockimgId) {
  const token = wx.getStorageSync('token');
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${app.globalData.request_url}/event/clockin/${eventId}`,
      method: 'POST',
      header: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { clockimg_id: clockimgId },
      success(res) {
        const body = res.data || {};
        if (String(body.Flag) === '4000') {
          resolve(body);
          return;
        }
        reject(new Error(body.message || '打卡失败'));
      },
      fail(err) {
        reject(err || new Error('打卡失败'));
      },
    });
  });
}

async function clockInWithSignature(eventId, tempFilePath) {
  const fileId = await uploadSignature(tempFilePath);
  return submitClockIn(eventId, fileId);
}

module.exports = {
  uploadSignature,
  submitClockIn,
  clockInWithSignature,
};
