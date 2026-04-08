# 任务简报

## 任务信息
- **名称:** 点餐系统前端 V3 — 单选 + 人员下拉 + 人员导入
- **类型:** 前端修改
- **完成时间:** 2026-04-07

## 交付物清单
| 文件 | 说明 |
|------|------|
| `src/api.js` | 新增 3 个 API: getPersonnel, importPersonnel, getMyOrder |
| `src/pages/OrderPage.jsx` | 选餐页面大改：姓名下拉、单选逻辑、已有订单加载 |
| `src/pages/AdminPage.jsx` | 管理页面新增人员导入区域 |

## 修改要点
- **api.js**: 新增 `getPersonnel()`, `getMyOrder(person)`, `importPersonnel(file)` 三个 API 调用
- **OrderPage**: 姓名输入框 → select 下拉（从 /api/personnel 加载）；多选/数量增减 → 单选（点击高亮，再点取消）；辣度选择仅对选中且含辣度的菜品显示；提交按钮文字根据是否有已有订单显示 "提交选择" 或 "修改选择"
- **AdminPage**: 在 CSV 菜单导入卡片后新增人员导入卡片，accept=.csv，调用 /api/admin/personnel/import
- **投票功能未改动**

## 自检
- [x] `npm run build` 通过（278ms，77 modules）
- [x] TailwindCSS 样式保持一致
- [x] vote 相关代码未改动
