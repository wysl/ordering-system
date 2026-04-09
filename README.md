# 任务简报

## 任务信息
- 名称：ordering-system 结构重构与产品化优化
- 类型：后端架构重构 + 前端体验优化
- 时间：2026-04-08
- 交付路径：
  - `/root/.openclaw/workspace-dev/tasks/ordering-system/backend/`
  - `/root/.openclaw/workspace-dev/tasks/ordering-system/frontend/`

## 需求确认
- 将点餐系统从“删数据切状态”重构为“轮次 + 模式驱动”
- 修复未参与统计不稳定问题
- 优化首页交互逻辑，符合人类习惯
- 优化管理后台信息层级与视觉表现
- 增加当前轮次结束能力

## 交付物清单
- `backend/internal/model/model.go`：新增 `ActivityRound`，为订单/投票挂接轮次
- `backend/internal/handler/order.go`：新增统一首页状态接口与轮次化订单逻辑
- `backend/internal/handler/menu.go`：菜单导入改为开启新点餐轮次
- `backend/internal/handler/vote.go`：投票创建改为开启新投票轮次
- `backend/internal/handler/admin.go`：统一参与状态、导出、结束轮次
- `backend/main.go`：路由更新
- `frontend/src/api.js`：API 升级为基于 home-state / participation-status
- `frontend/src/pages/OrderPage.jsx`：首页流程与视觉重做
- `frontend/src/pages/AdminPage.jsx`：后台状态概览、进度、结束轮次、视觉优化
- `frontend/src/App.jsx`：整体壳层美化

## 技术实现要点
- 引入 `ActivityRound(mode, active)` 作为系统核心状态源
- 首页不再自己推断显示点餐还是投票，统一改为依赖 `/api/home-state`
- 参与统计统一依赖 `/api/admin/participation-status`
- 菜单导入 / 创建投票不再删除历史，而是关闭旧轮次并开启新轮次
- 增加 `POST /api/admin/rounds/end` 支持手动结束当前轮次
- 增加历史轮次与详情接口：`/api/admin/rounds`、`/api/admin/rounds/:id/detail`
- 增加历史轮次导出接口：`/api/admin/rounds/:id/export`、`/api/admin/rounds/:id/export.csv`、`/api/admin/rounds/:id/export.xlsx`
- 增加截止时间 `deadline_at` 支持（点餐 / 投票）
- 点餐支持备注 `remark`
- 增加管理员查询当前轮次某人选择：`/api/admin/lookup/person`
- 前端支持历史轮次筛选 / 搜索、截止时间倒计时自动刷新

## 使用说明
### 启动后端
```bash
cd /root/.openclaw/workspace-dev/tasks/ordering-system/backend
./ordering-backend
```

### 启动前端
```bash
cd /root/.openclaw/workspace-dev/tasks/ordering-system/frontend
npm run dev -- --host 0.0.0.0
```

### 菜单导入说明
- 管理后台支持导入 `CSV` / `XLSX` 菜单文件
- 推荐优先使用后台下载的 `XLSX` 模板
- `A1`：填写店名 / 本轮标题
- `A2` 开始：填写菜品名
- `B2` 开始：可选填写辣度
- 辣度支持留空、`1`、`2`、`3`、`1-3`、`微辣/中辣/重辣` 等写法
- 导入后会自动关闭旧点餐轮次，并开启新的点餐轮次
- 如果当前只有点餐进行中：首页标题显示店名
- 如果点餐和投票同时进行中：首页标题显示 `店名 & 投票标题`
- 最近历史中的点餐标题同样取自导入文件的 `A1`

### 生产部署建议
1. 后端使用 systemd / pm2 / supervisor 常驻 `ordering-backend`
2. 前端使用 `npm run build` 后通过 nginx / caddy 托管 `frontend/dist`
3. 反向代理 `/api` 到 `http://127.0.0.1:8088`
4. 设置环境变量：
   - `ORDERING_ADMIN_PASSWORD=<强密码>`
5. 定期备份：
   - `backend/ordering.db`
   - `backend/ordering.db.bak-*`


### 发布前检查
- 前端构建：`npm run build`
- 后端构建：`go build -o ordering-backend .`
- 核心接口：
  - `/api/home-state`
  - `/api/admin/participation-status`
  - `/api/admin/rounds`
  - `/api/admin/lookup/person`
  - `/api/admin/rounds/:id/export(.csv/.xlsx)`

### 管理密码
- 默认：`admin123`
- 可通过环境变量覆盖：`ORDERING_ADMIN_PASSWORD`
- 生产环境务必改为强密码


## 操作记录与自检
- [x] 后端已编译通过
- [x] 前端已构建通过
- [x] 首页已切换为统一状态驱动
- [x] 后台已增加当前活动概览与结束轮次能力
- [x] 历史轮次与详情已接入
- [x] 截止时间与备注功能已接入
- [x] 历史轮次筛选 / 导出已接入
- [x] Excel / XLSX 导出链路已接入
- [x] 管理员查询体验已增强
- [x] README 已更新

## 备注
- 因 SQLite 对旧表新增非空字段迁移受限，已重建新库
- 旧数据库已备份到：`backend/ordering.db.bak-20260408-0134`

## 发布结论
- 当前版本已具备发布条件
- 已完成真实业务链路联调：导入人员、导入菜单、用户下单、参与统计、按人查询、历史导出
- 建议发布前将默认密码改为强密码，并按上方部署建议配置常驻服务与反向代理

