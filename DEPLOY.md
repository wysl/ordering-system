# Ordering System 部署指南

本文档说明点餐系统的测试部署和正式生产部署流程。

---

## 一、测试部署（开发环境）

适用于本地开发、局域网测试。

### 1. 后端

```bash
cd backend/

# 编译
go build -o ordering-backend

# 运行（端口 8088）
./ordering-backend
```

### 2. 前端

```bash
cd frontend/

# 安装依赖
npm install

# 开发模式（端口 5173，自动代理到 :8088）
npm run dev

# 或构建后预览
npm run build
npm run preview -- --host 0.0.0.0
```

### 3. 访问

- 前端: `http://<服务器IP>:5173`
- 后端: `http://<服务器IP>:8088`

---

## 二、正式部署（生产环境）

### 方案 A: Nginx 反向代理

#### 1. 后端部署

```bash
cd backend/

# 编译
go build -o ordering-backend

# 使用 systemd 管理服务
# 创建 /etc/systemd/system/ordering-backend.service
```

**systemd 服务配置**:

```ini
[Unit]
Description=Ordering System Backend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/ordering-system/backend
ExecStart=/opt/ordering-system/backend/ordering-backend
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
# 启用并启动
systemctl enable ordering-backend
systemctl start ordering-backend
```

#### 2. 前端构建

```bash
cd frontend/

# 安装依赖
npm install

# 构建生产版本（输出到 dist/）
npm run build
```

将 `dist/` 目录复制到 `/var/www/ordering-system/`。

#### 3. Nginx 配置

```nginx
# /etc/nginx/sites-available/ordering-system.conf

server {
    listen 80;
    server_name ordering.example.com;  # 替换为你的域名

    # 前端静态文件
    root /var/www/ordering-system/dist;
    index index.html;

    # 前端路由（React Router SPA）
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 后端 API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:8088;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE 支持（管理后台实时状态）
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
# 启用站点配置
ln -s /etc/nginx/sites-available/ordering-system.conf /etc/nginx/sites-enabled/

# 测试配置
nginx -t

# 重载 Nginx
systemctl reload nginx
```

---

### 方案 B: Caddy 反向代理

Caddy 自动管理 HTTPS，配置更简洁。

#### 1. 后端部署

同方案 A，使用 systemd 管理。

#### 2. 前端构建

同方案 A，将 `dist/` 复制到 `/var/www/ordering-system/`。

#### 3. Caddy 配置

```caddyfile
# /etc/caddy/Caddyfile

ordering.example.com {
    # 前端静态文件
    root * /var/www/ordering-system/dist
    encode gzip

    # 前端路由（React Router SPA）
    try_files {path} {path}/ /index.html
    file_server

    # 后端 API 反向代理
    reverse_proxy /api/* 127.0.0.1:8088 {
        # SSE 支持
        flush_interval -1
    }
}
```

```bash
# 重载 Caddy
systemctl reload caddy
```

---

## 三、目录结构建议（生产环境）

```
/opt/ordering-system/
├── backend/
│   ├── ordering-backend       # 二进制文件
│   ├── ordering.db            # 数据库
│   └── logs/                  # 日志目录（可选）
└── frontend/
    └── dist/                  # 前端构建产物

/var/www/ordering-system/
└── dist/                      # Nginx/Caddy 静态文件（复制自 frontend/dist）
```

---

## 四、常见问题

### Q1: 前端访问后端 API 失败？

检查：
1. 后端是否正常运行 (`systemctl status ordering-backend`)
2. Nginx/Caddy 反向代理配置是否正确
3. 后端 CORS 配置（当前允许所有来源，生产可收紧）

### Q2: SSE (Server-Sent Events) 不工作？

Nginx 需添加:
```nginx
proxy_buffering off;
proxy_cache off;
```

Caddy 需添加:
```caddyfile
flush_interval -1
```

### Q3: 数据库备份？

```bash
# 手动备份
cp /opt/ordering-system/backend/ordering.db /backup/ordering-$(date +%Y%m%d).db

# 或通过管理后台 API
curl -H "Authorization: Bearer <token>" http://localhost:8088/api/admin/backup -o backup.zip
```

---

## 五、快速启动脚本

```bash
#!/bin/bash
# deploy.sh - 一键部署脚本

set -e

PROJECT_DIR="/opt/ordering-system"
WWW_DIR="/var/www/ordering-system"

# 后端
cd $PROJECT_DIR/backend
go build -o ordering-backend
systemctl restart ordering-backend

# 前端
cd $PROJECT_DIR/frontend
npm install
npm run build
rm -rf $WWW_DIR/dist
cp -r dist $WWW_DIR/

# 重载 Nginx
systemctl reload nginx

echo "部署完成 ✅"
```

---

## 六、更新流程

1. 拉取最新代码: `git pull origin main`
2. 重新编译后端: `go build -o ordering-backend`
3. 重新构建前端: `npm run build`
4. 复制前端 dist: `cp -r dist /var/www/ordering-system/`
5. 重启后端服务: `systemctl restart ordering-backend`
6. 重载 Nginx/Caddy: `systemctl reload nginx` 或 `systemctl reload caddy`