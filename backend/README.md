# Ordering System Backend

点餐系统后端服务，基于 Go + Gin + SQLite + GORM + JWT 构建。

## 技术栈

| 依赖 | 版本 | 用途 |
|------|------|------|
| Go | 1.25.7 | 运行环境 |
| Gin | 1.12.0 | Web 框架 |
| GORM | 1.31.1 | ORM |
| SQLite | - | 数据库 |
| golang-jwt | 5.3.1 | JWT 认证 |
| excelize | 2.10.1 | Excel 导入导出 |

## 项目结构

```
backend/
├── main.go                    # 入口文件，路由注册
├── ordering.db                # SQLite 数据库文件
├── ordering-backend           # 编译后的二进制文件
├── go.mod / go.sum            # Go 模块依赖
└── internal/
    ├── model/model.go         # 数据模型定义
    ├── middleware/
    │   ├── cors.go            # CORS 中间件
    │   └── jwt.go             # JWT 认证中间件
    └── handler/
        ├── menu.go            # 菜品导入/删除
        ├── order.go           # 点餐/投票提交
        ├── admin.go           # 管理端 API
        ├── vote.go            # 投票相关
        ├── personnel.go       # 人员管理
        └── rounds.go          # 历史轮次管理
```

## API 接口

### 公开接口

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/home-state` | GET | 首页状态（活动类型、标题等） |
| `/api/menu` | GET | 当前菜品列表 |
| `/api/personnel` | GET | 人员名单 |
| `/api/order` | POST | 提交点餐 |
| `/api/order/mine` | GET | 查询我的订单 |
| `/api/votes` | GET | 公开投票列表 |
| `/api/vote` | POST | 提交投票 |
| `/api/vote/:id/result` | GET | 投票结果 |

### 管理接口（需 JWT 认证）

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/admin/login` | POST | 登录（密码固定 `admin123456`） |
| `/api/admin/menu/import` | POST | 导入菜品 CSV/XLSX |
| `/api/admin/menu` | GET/DELETE | 菜品管理 |
| `/api/admin/orders` | GET | 订单列表 |
| `/api/admin/rounds` | GET | 历史轮次（分页/搜索） |
| `/api/admin/rounds/:id/detail` | GET | 轮次详情 |
| `/api/admin/rounds/:id/export` | GET | 导出 HTML |
| `/api/admin/rounds/:id/export.xlsx` | GET | 导出 Excel |
| `/api/admin/stats` | GET | 统计总览 |
| `/api/admin/stats/:month/shops` | GET | 指定月份店铺列表 |
| `/api/admin/stats/:month/dishes` | GET | 指定月份热门菜品 Top10 |
| `/api/admin/backup` | GET | 数据库备份 |
| `/api/admin/restore` | POST | 数据库恢复 |
| `/api/admin/logs` | GET | 操作日志 |

## 本地开发

```bash
# 编译
go build -o ordering-backend

# 运行（端口 8088）
./ordering-backend

# 测试
go test ./internal/handler/...
```

## 配置

- **端口**: `8088`（硬编码）
- **数据库**: `ordering.db`（自动创建/迁移）
- **JWT Secret**: 硬编码 `your-secret-key`
- **CORS**: 允许所有来源（可按需收紧）

## 更新日志

### 2026-04-22
- 新增 `/api/admin/stats/:month/shops` — 月份店铺列表
- 新增 `/api/admin/stats/:month/dishes` — 月份热门菜品 Top10
- 简化 `/api/admin/stats` 返回结构

### 2026-04-14
- 新增历史轮次分页/搜索/筛选
- 新增数据库备份/恢复
- 新增回收站/软删除
- 新增操作日志

### 2026-04-07
- 初始版本
- CSV/XLSX 菜品导入
- 点餐/投票提交
- HTML 导出