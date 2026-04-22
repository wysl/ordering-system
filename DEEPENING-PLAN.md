# 深化任务简报

## 任务信息
- 名称：ordering-system 体感深化优化
- 类型：管理员效率提升 + 下单体验强化 + 历史可管理性增强
- 时间：2026-04-14
- 交付路径：
  - `/root/.openclaw/workspace-dev/tasks/ordering-system/backend/`
  - `/root/.openclaw/workspace-dev/tasks/ordering-system/frontend/`

## 本轮目标
围绕“体感好、易感知”的方向，直接补齐以下六项：
1. 历史轮次分页 + 搜索 + 日期筛选
2. 当前轮次总览卡片强化
3. 未下单人员高亮 / 催单视图 / 一键复制
4. 下单页固定摘要条强化
5. 提交成功反馈强化
6. 危险操作确认体验增强

## 实施顺序
### Phase 1
- 后端 rounds 列表接口支持分页/关键词/日期
- 后端 participation 状态补 summary 字段
- 前端 Admin 历史区块支持分页/筛选

### Phase 2
- 前端当前活动总览卡片增强
- 未参与名单高亮与一键复制催单
- 下单页底部摘要条增强

### Phase 3
- 删除轮次前显示影响范围
- 提交成功反馈更明确
- 文档与构建验证
