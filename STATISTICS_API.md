# 统计接口API文档

## 概述
统计接口提供数据导出、数据展示和统计摘要功能，支持导出协会会员信息和活动数据。数据以Excel格式(.xlsx)导出或JSON格式展示。

**注意**: 统计功能会返回所有数据，包括已标记为删除的记录，以确保数据的完整性。

## 权限要求
- 所有接口都需要JWT认证
- 只有超级用户（isSuperUser=true）或管理员（isManager=true）可以访问这些接口

## 接口列表

### 1. 数据导出接口

#### 请求信息
- **URL**: `/api/v1/statistics/export/<export_type>`
- **方法**: GET
- **认证**: 需要JWT Token

#### 路径参数
- `export_type`: 导出类型
  - `user`: 导出协会会员统计数据
  - `event`: 导出活动统计数据

#### 请求示例
```bash
# 导出协会会员数据
curl -H "Authorization: Bearer <your_jwt_token>" \
     "http://localhost:5000/api/v1/statistics/export/user"

# 导出活动数据
curl -H "Authorization: Bearer <your_jwt_token>" \
     "http://localhost:5000/api/v1/statistics/export/event"
```

#### 响应说明

##### 成功响应
- **Content-Type**: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- **文件名**: `user_statistics_YYYYMMDD_HHMMSS.xlsx` 或 `event_statistics_YYYYMMDD_HHMMSS.xlsx`
- **内容**: Excel格式的统计数据
- **样式特性**:
  - 标题行：蓝色背景，白色粗体字体
  - 数据居中对齐
  - 自动调整列宽
  - 工作表名称：统计数据

**字段说明（user导出）**：
| 字段名 | 说明 |
|--------|------|
| 协会名称 | 协会的名称 |
| 总人数 | 协会的总会员数量 |
| 男性人数 | 男性会员数量 |
| 女性人数 | 女性会员数量 |
| 管理员人数 | 协会管理员数量 |
| 普通会员人数 | 普通会员数量 |
| 新会员数量(30天内) | 最近30天加入的会员数量 |
| 老会员数量 | 30天前加入的会员数量 |
| 创建时间 | 协会创建时间 |
| 协会描述 | 协会的描述信息 |

**字段说明（event导出）**：
| 字段名 | 说明 |
|--------|------|
| 活动标题 | 活动的标题 |
| 所属协会 | 主办协会名称 |
| 活动地点 | 活动地点名称 |
| 活动地址 | 活动详细地址 |
| 开始时间 | 活动开始时间 |
| 结束时间 | 活动结束时间 |
| 预算费用 | 活动预算金额 |
| 实际费用 | 活动实际花费 |
| 报名人数 | 报名参加的人数 |
| 签到人数 | 实际签到的人数 |
| 创建时间 | 活动创建时间 |
| 组织者 | 活动组织者姓名 |

##### 错误响应
```json
{
  "code": 4001,
  "message": "不支持的导出类型"
}
```

```json
{
  "code": 4003,
  "message": "无权限访问"
}
```

```json
{
  "code": 4004,
  "message": "用户不存在"
}
```

```json
{
  "code": 5000,
  "message": "服务器未安装Excel支持库"
}
```

```json
{
  "code": 5000,
  "message": "导出失败: <错误详情>"
}
```

### 2. 数据展示接口

#### 请求信息
- **URL**: `/api/v1/statistics/show/<show_type>`
- **方法**: GET
- **认证**: 需要JWT Token

#### 路径参数
- `show_type`: 展示类型
  - `user`: 展示协会会员统计数据
  - `event`: 展示活动统计数据

#### 请求示例
```bash
# 获取协会会员数据
curl -H "Authorization: Bearer <your_jwt_token>" \
     "http://localhost:5000/api/v1/statistics/show/user"

# 获取活动数据
curl -H "Authorization: Bearer <your_jwt_token>" \
     "http://localhost:5000/api/v1/statistics/show/event"
```

#### 成功响应

**用户统计数据响应示例**:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "clubs": [
      {
        "club_id": 1,
        "club_name": "计算机协会",
        "total_count": 15,
        "male_count": 8,
        "female_count": 7,
        "admin_count": 2,
        "normal_count": 13,
        "new_member_count": 3,
        "old_member_count": 12,
        "create_date": "2024-01-15 10:30:00",
        "description": "计算机技术学习交流平台"
      }
    ],
    "total_clubs": 3,
    "total_members": 25
  }
}
```

**活动统计数据响应示例**:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "events": [
      {
        "event_id": 1,
        "title": "编程大赛",
        "club_id": 1,
        "club_name": "计算机协会",
        "location_name": "教学楼A101",
        "location_address": "主校区教学楼A101室",
        "start_time": "2024-03-15 14:00:00",
        "end_time": "2024-03-15 17:00:00",
        "budget": 500,
        "real_cost": 450,
        "total_participants": 20,
        "checked_in_count": 18,
        "create_time": "2024-03-01 09:00:00",
        "organizer_id": 1,
        "organizer_name": "张三"
      }
    ],
    "total_events": 8,
    "total_participants": 156,
    "total_checked_in": 142
  }
}
```

**用户数据字段说明**：
| 字段名 | 说明 |
|--------|------|
| club_id | 协会ID |
| club_name | 协会名称 |
| total_count | 协会总会员数量 |
| male_count | 男性会员数量 |
| female_count | 女性会员数量 |
| admin_count | 协会管理员数量 |
| normal_count | 普通会员数量 |
| new_member_count | 新会员数量(30天内) |
| old_member_count | 老会员数量 |
| create_date | 协会创建时间 |
| description | 协会描述信息 |

**活动数据字段说明**：
| 字段名 | 说明 |
|--------|------|
| event_id | 活动ID |
| title | 活动标题 |
| club_id | 所属协会ID |
| club_name | 所属协会名称 |
| location_name | 活动地点名称 |
| location_address | 活动详细地址 |
| start_time | 活动开始时间 |
| end_time | 活动结束时间 |
| budget | 预算费用 |
| real_cost | 实际费用 |
| total_participants | 报名人数 |
| checked_in_count | 签到人数 |
| create_time | 活动创建时间 |
| organizer_id | 组织者ID |
| organizer_name | 组织者姓名 |

#### 错误响应
```json
{
  "code": 4001,
  "message": "不支持的展示类型"
}
```

```json
{
  "code": 4003,
  "message": "无权限访问"
}
```

```json
{
  "code": 4004,
  "message": "用户不存在"
}
```

```json
{
  "code": 5000,
  "message": "获取数据失败: <错误详情>"
}
```

### 3. 统计摘要接口

#### 请求信息
- **URL**: `/api/v1/statistics/summary`
- **方法**: GET
- **认证**: 需要JWT Token

#### 请求示例
```bash
curl -H "Authorization: Bearer <your_jwt_token>" \
     http://localhost:5000/api/v1/statistics/summary
```

#### 成功响应
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "total_users": 100,
    "total_clubs": 10,
    "total_events": 50,
    "total_members": 200,
    "new_users_30_days": 15,
    "new_clubs_30_days": 2,
    "new_events_30_days": 8
  }
}
```

**字段说明**：
- `total_users`: 总用户数（未删除）
- `total_clubs`: 总协会数（未删除）
- `total_events`: 总活动数
- `total_members`: 总会员数（未删除）
- `new_users_30_days`: 最近30天新增用户数
- `new_clubs_30_days`: 最近30天新增协会数
- `new_events_30_days`: 最近30天新增活动数

#### 错误响应
```json
{
  "code": 4003,
  "message": "无权限访问"
}
```

```json
{
  "code": 4004,
  "message": "用户不存在"
}
```

```json
{
  "code": 5000,
  "message": "获取统计信息失败: <错误详情>"
}
```

## Excel文件特性

### 样式特性
- **标题行样式**: 蓝色背景（#366092），白色粗体字体
- **数据对齐**: 所有数据居中对齐，美观易读
- **自动列宽**: 根据内容自动调整列宽，最大宽度50个字符
- **工作表命名**: 统一命名为"统计数据"

### 文件特性
- **格式**: Excel 2007+格式（.xlsx）
- **编码**: 原生支持中文，无乱码问题
- **兼容性**: 支持Microsoft Excel、WPS、LibreOffice等
- **文件命名**: 自动添加时间戳，格式为`类型_YYYYMMDD_HHMMSS.xlsx`

## 使用示例

### 在浏览器中下载文件
直接访问以下URL会触发Excel文件下载：
```
http://your-domain.com/api/v1/statistics/export/user
http://your-domain.com/api/v1/statistics/export/event
```

### 在JavaScript中使用
```javascript
// 获取统计摘要
async function getStatisticsSummary() {
  const response = await fetch('/api/v1/statistics/summary', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  const data = await response.json();
  return data;
}

// 获取协会会员统计数据
async function getUserStatistics() {
  const response = await fetch('/api/v1/statistics/show/user', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  const data = await response.json();
  return data;
}

// 获取活动统计数据
async function getEventStatistics() {
  const response = await fetch('/api/v1/statistics/show/event', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  const data = await response.json();
  return data;
}

// 下载Excel文件
function downloadExcel(type) {
  const url = `/api/v1/statistics/export/${type}`;
  window.open(url, '_blank');
}

// 通用下载函数
function downloadFile(type) {
  const url = `/api/v1/statistics/export/${type}`;
  
  // 创建临时链接进行下载
  const a = document.createElement('a');
  a.href = url;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// 使用示例
downloadFile('user');   // 下载用户Excel文件
downloadFile('event');  // 下载活动Excel文件
```

### 前端组件示例
```javascript
// 导出组件
function ExportComponent() {
  const [exportType, setExportType] = useState('user');
  const [isLoading, setIsLoading] = useState(false);

  const handleExport = async () => {
    setIsLoading(true);
    try {
      downloadFile(exportType);
    } catch (error) {
      console.error('导出失败:', error);
      alert('导出失败，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="export-component">
      <select 
        value={exportType} 
        onChange={(e) => setExportType(e.target.value)}
        disabled={isLoading}
      >
        <option value="user">协会会员数据</option>
        <option value="event">活动数据</option>
      </select>
      
      <button 
        onClick={handleExport}
        disabled={isLoading}
      >
        {isLoading ? '导出中...' : '导出Excel'}
      </button>
    </div>
  );
}

// 统计数据展示组件
function StatisticsDisplay() {
  const [dataType, setDataType] = useState('user');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = async (type) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/statistics/show/${type}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const result = await response.json();
      if (result.code === 200) {
        setData(result.data);
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(dataType);
  }, [dataType]);

  return (
    <div className="statistics-display">
      <div className="controls">
        <select 
          value={dataType} 
          onChange={(e) => setDataType(e.target.value)}
          disabled={loading}
        >
          <option value="user">协会会员统计</option>
          <option value="event">活动统计</option>
        </select>
        <button onClick={() => fetchData(dataType)} disabled={loading}>
          {loading ? '加载中...' : '刷新数据'}
        </button>
      </div>

      {error && (
        <div className="error-message">
          错误: {error}
        </div>
      )}

      {loading && (
        <div className="loading">加载中...</div>
      )}

      {data && dataType === 'user' && (
        <div className="user-statistics">
          <h3>协会会员统计</h3>
          <div className="summary">
            <p>总协会数: {data.total_clubs}</p>
            <p>总会员数: {data.total_members}</p>
          </div>
          <table className="statistics-table">
            <thead>
              <tr>
                <th>协会名称</th>
                <th>总人数</th>
                <th>男性</th>
                <th>女性</th>
                <th>管理员</th>
                <th>新会员(30天)</th>
                <th>创建时间</th>
              </tr>
            </thead>
            <tbody>
              {data.clubs.map((club) => (
                <tr key={club.club_id}>
                  <td>{club.club_name}</td>
                  <td>{club.total_count}</td>
                  <td>{club.male_count}</td>
                  <td>{club.female_count}</td>
                  <td>{club.admin_count}</td>
                  <td>{club.new_member_count}</td>
                  <td>{club.create_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && dataType === 'event' && (
        <div className="event-statistics">
          <h3>活动统计</h3>
          <div className="summary">
            <p>总活动数: {data.total_events}</p>
            <p>总报名人数: {data.total_participants}</p>
            <p>总签到人数: {data.total_checked_in}</p>
          </div>
          <table className="statistics-table">
            <thead>
              <tr>
                <th>活动标题</th>
                <th>所属协会</th>
                <th>地点</th>
                <th>开始时间</th>
                <th>报名人数</th>
                <th>签到人数</th>
                <th>预算</th>
                <th>实际费用</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((event) => (
                <tr key={event.event_id}>
                  <td>{event.title}</td>
                  <td>{event.club_name}</td>
                  <td>{event.location_name}</td>
                  <td>{event.start_time}</td>
                  <td>{event.total_participants}</td>
                  <td>{event.checked_in_count}</td>
                  <td>{event.budget}</td>
                  <td>{event.real_cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

### 批量下载示例
```javascript
// 批量导出所有数据
async function exportAllData() {
  const types = ['user', 'event'];
  
  for (const type of types) {
    try {
      downloadFile(type);
      // 添加延迟避免同时下载过多文件
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`导出${type}数据失败:`, error);
    }
  }
}
```

## 注意事项

1. **权限控制**: 只有超级用户或管理员可以访问导出接口
2. **文件编码**: Excel文件原生支持中文，无需担心编码问题
3. **数据范围**: 返回所有用户、协会、会员和活动数据，不过滤删除标记
4. **时间统计**: 新老会员统计基于最近30天的时间范围
5. **错误处理**: 所有接口都包含完善的错误处理和返回码
6. **性能考虑**: Excel文件生成需要一定时间，大量数据时请耐心等待
7. **依赖库**: 需要服务器安装openpyxl库
8. **浏览器兼容**: 支持所有现代浏览器的文件下载
9. **文件大小**: Excel文件比纯文本略大，但提供更好的格式化和可读性
10. **数据完整性**: Excel格式能更好地保持数据类型和格式
11. **数据覆盖**: 统计结果包含完整的数据集，便于全面分析 