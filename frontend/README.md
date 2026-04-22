# Ordering System Frontend

点餐系统前端，基于 React 19 + Vite 8 + TailwindCSS 4 构建。

## 技术栈

| 依赖 | 版本 | 用途 |
|------|------|------|
| React | 19.2.4 | UI 框架 |
| React Router | 7.14.0 | 路由 |
| Vite | 8.0.4 | 构建工具 |
| TailwindCSS | 4.2.2 | CSS 框架 |
| Axios | 1.14.0 | HTTP 客户端 |

## 项目结构

```
frontend/
├── index.html                 # HTML 入口
├── vite.config.js             # Vite 配置
├── package.json               # 依赖定义
├── public/                    # 静态资源
├── dist/                      # 构建产物
└── src/
    ├── main.jsx               # React 入口
    ├── App.jsx                # 路由配置
    ├── api.js                 # API 封装
    ├── index.css              # TailwindCSS 入口
    └── pages/
        ├── OrderPage.jsx      # 点餐页
        ├── VotePage.jsx       # 投票页
        ├── AdminPage.jsx      # 管理后台主页
        ├── AdminSections.jsx  # 管理后台子组件
        └── adminShared.js     # 管理后台共享工具
```

## 页面功能

| 页面 | 路径 | 功能 |
|------|------|------|
| 点餐页 | `/` | 选择人员、菜品、辣度、提交点餐 |
| 投票页 | `/vote` | 查看投票、提交投票 |
| 管理后台 | `/admin` | 菜单导入、订单汇总、历史轮次、统计、数据库管理 |

### 管理后台子模块

- **点餐管理**: 菜单导入、当前菜品、订单汇总、导出 HTML
- **投票管理**: 创建投票、投票结果、删除投票
- **历史轮次**: 分页列表、详情查看、批量导出、回收站
- **人员管理**: CSV 导入、请假标记、名单刷新
- **统计总览**: 总览卡片、月份店铺、热门菜品 Top10
- **数据库**: 备份/恢复、操作日志、回收站管理

## 本地开发

```bash
# 安装依赖
npm install

# 开发模式（端口 5173）
npm run dev

# 构建生产版本
npm run build

# 预览构建结果
npm run preview
```

## API 配置

`src/api.js` 自动检测当前 hostname，拼接 `:8088` 作为后端地址：

```javascript
baseURL: `http://${window.location.hostname}:8088`
```

生产环境需确保前端与后端在同一域名下，或配置反向代理。

## 更新日志

### 2026-04-22
- 重构 `StatsDashboard` — 月份选择 + 店铺列表 + 热门菜品 Top10
- 新增 `getStatsMonthShops`、`getStatsMonthDishes` API

### 2026-04-14
- 新增历史轮次分页/搜索/筛选
- 新增统计页总览/月度趋势/热门榜
- 新增数据库管理/回收站/日志

### 2026-04-07
- 初始版本
- 点餐页单选逻辑
- 管理后台基础功能