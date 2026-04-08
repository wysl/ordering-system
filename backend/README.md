# 任务简报 - Ordering System Backend

## 任务信息
- **名称**: 点餐系统后端
- **类型**: Go 后端开发 (Gin + SQLite + GORM)
- **时间**: 2026-04-07
- **交付物路径**: `/root/.openclaw/workspace-dev/tasks/ordering-system/backend/`

## 交付物清单
| 文件 | 用途 |
|------|------|
| `main.go` | 入口文件，路由注册，启动服务 |
| `internal/model/model.go` | 数据模型：Menu, Order, OrderItem |
| `internal/middleware/auth.go` | JWT 认证中间件 |
| `internal/middleware/cors.go` | CORS 中间件 (允许 localhost:5173) |
| `internal/handler/menu.go` | 菜品相关接口处理 |
| `internal/handler/order.go` | 订单相关接口处理 |
| `internal/handler/admin.go` | 管理端接口处理 (登录/导出/CSV解析) |
| `go.mod` / `go.sum` | Go 模块依赖 |
| `ordering-backend` | 编译好的二进制文件 |

## API 接口
- `GET /api/menu` — 公开菜品列表
- `POST /api/order` — 提交订单 `{person, items: [{menu_id, quantity}]}`
- `POST /api/admin/login` — 登录，密码固定 `admin123`，返回 JWT token
- `POST /api/admin/menu/import` — CSV 导入菜品 (multipart file)
- `GET /api/admin/menu` — 管理端菜品列表
- `DELETE /api/admin/menu/:id` — 删除菜品（已关联订单则拒绝）
- `GET /api/admin/orders` — 获取所有订单（含 items 和 menu 详情）
- `GET /api/admin/export` — 导出 HTML 汇总（餐品名+总数+展开查看点餐人）

## 技术实现要点
- **CORS**: 允许 `http://localhost:5173`，支持 OPTIONS 预检
- **JWT**: 使用 `golang-jwt/jwt/v5`，token 有效期无限制（简单场景）
- **数据库**: SQLite + GORM 自动迁移，外键关联自动预加载
- **HTML 导出**: 生成简洁响应式 HTML，点击展开详情，红色数量徽章
- **CSV 解析**: 第一行为 header 自动跳过，辣度为空默认为 0
- **端口**: 8088，路由前缀 `/api`

## 使用说明
```bash
cd /root/.openclaw/workspace-dev/tasks/ordering-system/backend/
./ordering-backend
# 服务运行在 :8088
```

## 操作记录与自检
- [x] go build 成功
- [x] 所有 API 路由已实现
- [x] CORS 配置正确
- [x] JWT 中间件保护 admin 接口
- [x] CSV 解析含 header 跳过逻辑
- [x] HTML 导出含展开/折叠功能
- [x] 菜品删除检查订单关联
