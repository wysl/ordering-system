package handler

import (
	"archive/zip"
	"bytes"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"ordering-backend/internal/model"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/xuri/excelize/v2"
	"gorm.io/gorm"

	mw "ordering-backend/internal/middleware"
)

type AdminHandler struct {
	DB *gorm.DB
}

type roundListItem struct {
	model.ActivityRound
	Count int `json:"count"`
}

type roundListResponse struct {
	Items      []roundListItem `json:"items"`
	Page       int             `json:"page"`
	PageSize   int             `json:"page_size"`
	Total      int64           `json:"total"`
	TotalPages int             `json:"total_pages"`
}

func contentDispositionAttachment(filename string) string {
	safe := strings.NewReplacer("\r", "", "\n", "", "\"", "'").Replace(strings.TrimSpace(filename))
	if safe == "" {
		safe = "export.html"
	}
	return fmt.Sprintf(`attachment; filename="%s"; filename*=UTF-8''%s`, safe, url.PathEscape(safe))
}

func (h *AdminHandler) Login(c *gin.Context) {
	var req struct {
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "无效请求"})
		return
	}
	password := os.Getenv("ORDERING_ADMIN_PASSWORD")
	if password == "" {
		password = "admin123"
	}
	if req.Password != password {
		c.JSON(401, gin.H{"error": "密码错误"})
		return
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"role": "admin"})
	tokenStr, _ := token.SignedString(mw.JWTSecret)
	c.JSON(200, gin.H{"token": tokenStr})
}

func (h *AdminHandler) ListOrders(c *gin.Context) {
	round, err := getActiveRound(h.DB, "order")
	if err == gorm.ErrRecordNotFound {
		c.JSON(200, []model.Order{})
		return
	}
	if err != nil {
		c.JSON(500, gin.H{"error": "查询失败"})
		return
	}
	var orders []model.Order
	h.DB.Where("round_id = ?", round.ID).Preload("Items").Preload("Items.Menu").Order("created_at desc").Find(&orders)
	c.JSON(200, orders)
}

func (h *AdminHandler) GetParticipationStatus(c *gin.Context) {
	modeFilter := strings.TrimSpace(c.Query("mode"))
	var persons []model.Person
	if modeFilter == "order" {
		h.DB.Where("order_excused = ?", false).Order("name asc").Find(&persons)
	} else if modeFilter == "vote" {
		h.DB.Where("vote_excused = ?", false).Order("name asc").Find(&persons)
	} else {
		h.DB.Order("name asc").Find(&persons)
	}
	var round model.ActivityRound
	q := h.DB.Where("active = ?", true).Order("id desc")
	if modeFilter != "" {
		q = q.Where("mode = ?", modeFilter)
	}
	err := q.First(&round).Error
	if err == gorm.ErrRecordNotFound {
		c.JSON(200, gin.H{"mode": "idle", "total_count": len(persons), "done_count": 0, "pending": namesFromPersons(persons), "summary": gin.H{"pending_count": len(persons), "completion_rate": 0}})
		return
	}
	if err != nil {
		c.JSON(500, gin.H{"error": "查询参与状态失败"})
		return
	}
	doneSet := map[string]struct{}{}
	if round.Mode == "order" {
		var names []string
		h.DB.Raw("SELECT DISTINCT person FROM orders WHERE round_id = ?", round.ID).Scan(&names)
		for _, n := range names {
			doneSet[n] = struct{}{}
		}
	} else if round.Mode == "vote" {
		var names []string
		h.DB.Raw(`SELECT DISTINCT votes.person FROM votes JOIN vote_sessions ON vote_sessions.id = votes.vote_session_id WHERE vote_sessions.round_id = ?`, round.ID).Scan(&names)
		for _, n := range names {
			doneSet[n] = struct{}{}
		}
	}
	pending := make([]string, 0)
	for _, p := range persons {
		if _, ok := doneSet[p.Name]; !ok {
			pending = append(pending, p.Name)
		}
	}
	completionRate := 0
	if len(persons) > 0 {
		completionRate = int(math.Round(float64(len(doneSet)) * 100 / float64(len(persons))))
	}
	c.JSON(200, gin.H{
		"mode":       round.Mode,
		"round_id":   round.ID,
		"title":      round.Title,
		"deadline_at": round.DeadlineAt,
		"total_count": len(persons),
		"done_count": len(doneSet),
		"pending":    pending,
		"summary": gin.H{
			"pending_count":    len(pending),
			"completion_rate": completionRate,
			"done_count":      len(doneSet),
			"total_count":     len(persons),
		},
	})
}

func namesFromPersons(persons []model.Person) []string {
	out := make([]string, 0, len(persons))
	for _, p := range persons {
		out = append(out, p.Name)
	}
	return out
}

func (h *AdminHandler) EndActiveRound(c *gin.Context) {
	modeFilter := strings.TrimSpace(c.Query("mode"))
	now := time.Now()
	q := h.DB.Model(&model.ActivityRound{}).Where("active = ?", true)
	if modeFilter != "" {
		q = q.Where("mode = ?", modeFilter)
	}
	res := q.Updates(map[string]any{
		"active":    false,
		"closed_at": &now,
	})
	if res.Error != nil {
		c.JSON(500, gin.H{"error": "结束轮次失败"})
		return
	}
	c.JSON(200, gin.H{"ended": res.RowsAffected > 0})
}

func (h *AdminHandler) DeleteRound(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(400, gin.H{"error": "无效轮次ID"})
		return
	}
	previewOnly := c.Query("preview") == "1"
	var round model.ActivityRound
	if err := h.DB.First(&round, id).Error; err != nil {
		c.JSON(404, gin.H{"error": "轮次不存在"})
		return
	}
	impact := gin.H{"orders": 0, "order_items": 0, "menus": 0, "vote_sessions": 0, "votes": 0, "vote_pizzas": 0}
	if round.Mode == "order" {
		var ordersCount int64
		var orderItemsCount int64
		var menusCount int64
		h.DB.Model(&model.Order{}).Where("round_id = ?", round.ID).Count(&ordersCount)
		h.DB.Model(&model.OrderItem{}).Joins("JOIN orders ON orders.id = order_items.order_id").Where("orders.round_id = ?", round.ID).Count(&orderItemsCount)
		h.DB.Model(&model.Menu{}).Where("round_id = ?", round.ID).Count(&menusCount)
		impact["orders"] = ordersCount
		impact["order_items"] = orderItemsCount
		impact["menus"] = menusCount
	} else {
		var sessionCount int64
		var votesCount int64
		var pizzasCount int64
		h.DB.Model(&model.VoteSession{}).Where("round_id = ?", round.ID).Count(&sessionCount)
		h.DB.Model(&model.Vote{}).Joins("JOIN vote_sessions ON vote_sessions.id = votes.vote_session_id").Where("vote_sessions.round_id = ?", round.ID).Count(&votesCount)
		h.DB.Model(&model.VotePizza{}).Joins("JOIN vote_sessions ON vote_sessions.id = vote_pizzas.vote_session_id").Where("vote_sessions.round_id = ?", round.ID).Count(&pizzasCount)
		impact["vote_sessions"] = sessionCount
		impact["votes"] = votesCount
		impact["vote_pizzas"] = pizzasCount
	}
	if previewOnly {
		c.JSON(200, gin.H{"round": round, "impact": impact})
		return
	}
	now := time.Now()
	if err := h.DB.Model(&model.ActivityRound{}).Where("id = ?", round.ID).Updates(map[string]any{"deleted_at": &now, "active": false}).Error; err != nil {
		c.JSON(500, gin.H{"error": "删除轮次失败"})
		return
	}
	h.DB.Create(&model.ActivityLog{Type: "round_deleted", Message: fmt.Sprintf("轮次 #%d 已移入回收站", round.ID), RoundID: round.ID})
	c.JSON(200, gin.H{"deleted": true, "soft_deleted": true})
}

func (h *AdminHandler) ListRounds(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "5"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 5
	}
	if pageSize > 50 {
		pageSize = 50
	}
	keyword := strings.TrimSpace(c.Query("keyword"))
	date := strings.TrimSpace(c.Query("date"))
	q := h.DB.Model(&model.ActivityRound{}).Where("deleted_at IS NULL")
	if keyword != "" {
		like := "%" + keyword + "%"
		q = q.Where("title LIKE ? OR CAST(id AS TEXT) LIKE ?", like, like)
	}
	if date != "" {
		q = q.Where("date(created_at) = ?", date)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		c.JSON(500, gin.H{"error": "查询历史轮次失败"})
		return
	}
	var rounds []model.ActivityRound
	if err := q.Order("id desc").Offset((page-1)*pageSize).Limit(pageSize).Find(&rounds).Error; err != nil {
		c.JSON(500, gin.H{"error": "查询历史轮次失败"})
		return
	}
	result, err := loadRoundSummaries(h.DB, rounds)
	if err != nil {
		c.JSON(500, gin.H{"error": "统计历史轮次失败"})
		return
	}
	items := make([]roundListItem, 0, len(result))
	for _, item := range result {
		items = append(items, roundListItem{ActivityRound: model.ActivityRound{ID: item.ID, Mode: item.Mode, Title: item.Title, Active: item.Active, CreatedAt: item.CreatedAt, ClosedAt: item.ClosedAt, DeadlineAt: item.DeadlineAt}, Count: int(item.Count)})
	}
	c.JSON(200, roundListResponse{Items: items, Page: page, PageSize: pageSize, Total: total, TotalPages: int(math.Ceil(float64(total) / float64(pageSize)))})
}

func (h *AdminHandler) GetRoundDetail(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(400, gin.H{"error": "无效轮次ID"})
		return
	}
	var round model.ActivityRound
	if err := h.DB.First(&round, id).Error; err != nil {
		c.JSON(404, gin.H{"error": "轮次不存在"})
		return
	}
	if round.Mode == "order" {
		var orders []model.Order
		h.DB.Where("round_id = ?", round.ID).Preload("Items").Preload("Items.Menu").Order("created_at desc").Find(&orders)
		menuTotals := map[string]int{}
		for _, o := range orders {
			for _, item := range o.Items {
				menuTotals[item.Menu.Name] += item.Quantity
			}
		}
		c.JSON(200, gin.H{"round": round, "orders": orders, "menu_totals": menuTotals})
		return
	}
	var sessions []model.VoteSession
	h.DB.Where("round_id = ?", round.ID).Preload("Pizzas").Preload("Votes.Pizza").Find(&sessions)
	pizzaTotals := map[string]int{}
	for _, s := range sessions {
		for _, v := range s.Votes {
			pizzaTotals[v.Pizza.Name]++
		}
	}
	c.JSON(200, gin.H{"round": round, "vote_sessions": sessions, "pizza_totals": pizzaTotals})
}

func (h *AdminHandler) ExportRoundHTML(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(400, gin.H{"error": "无效轮次ID"})
		return
	}
	var round model.ActivityRound
	if err := h.DB.First(&round, id).Error; err != nil {
		c.JSON(404, gin.H{"error": "轮次不存在"})
		return
	}

	if round.Mode == "order" {
		// Order mode export logic
		var orders []model.Order
		h.DB.Where("round_id = ?", round.ID).Preload("Items").Preload("Items.Menu").Find(&orders)
		// Get menu title from first order's first item
		var menuTitle string = "点餐"
		if len(orders) > 0 && len(orders[0].Items) > 0 && orders[0].Items[0].Menu.ID != 0 {
			menuTitle = orders[0].Items[0].Menu.Name
		} else {
			// Fallback: query menus directly for this round
			var firstMenu model.Menu
			if err := h.DB.Where("round_id = ?", round.ID).Order("id asc").First(&firstMenu).Error; err == nil {
				menuTitle = firstMenu.Name
			}
		}
		type summaryItem struct {
			Name           string
			TotalBySpicy   map[int]int
			PersonsBySpicy map[int][]string
			GrandTotal     int
		}
		summary := map[string]*summaryItem{}
		for _, order := range orders {
			for _, item := range order.Items {
				key := item.Menu.Name
				if _, ok := summary[key]; !ok {
					summary[key] = &summaryItem{Name: item.Menu.Name, TotalBySpicy: map[int]int{}, PersonsBySpicy: map[int][]string{}}
				}
				s := summary[key]
				s.TotalBySpicy[item.SpicyLevel] += item.Quantity
				s.GrandTotal += item.Quantity
				s.PersonsBySpicy[item.SpicyLevel] = append(s.PersonsBySpicy[item.SpicyLevel], order.Person)
			}
		}
		keys := make([]string, 0, len(summary))
		for k := range summary {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		spicyLabels := map[int]string{0: "不辣", 1: "微辣", 2: "中辣", 3: "重辣"}
		var b strings.Builder
		b.WriteString(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>历史轮次导出</title><style>body{font-family:sans-serif;padding:20px;background:#f5f5f5}.container{max-width:720px;margin:0 auto}table,.card{background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.08)}.card{padding:16px;margin-bottom:12px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{padding:10px;border-bottom:1px solid #eee;text-align:left}</style></head><body><div class="container"><h1>` + round.Title + `</h1><div class="card">创建时间：` + round.CreatedAt.Format("2006-01-02 15:04") + `</div><table><thead><tr><th>菜品</th><th>不辣</th><th>微辣</th><th>中辣</th><th>重辣</th><th>合计</th></tr></thead><tbody>`)
		for _, k := range keys {
			item := summary[k]
			b.WriteString(`<tr><td>` + item.Name + `</td>`)
			for level := 0; level <= 3; level++ {
				if item.TotalBySpicy[level] == 0 {
					b.WriteString(`<td>-</td>`)
				} else {
					b.WriteString(`<td>` + strconv.Itoa(item.TotalBySpicy[level]) + `</td>`)
				}
			}
			b.WriteString(`<td>` + strconv.Itoa(item.GrandTotal) + `</td></tr>`)
		}
		b.WriteString(`</tbody></table><h2>明细</h2>`)
		for _, order := range orders {
			b.WriteString(`<div class="card"><strong>` + order.Person + `</strong><div style="margin-top:8px">`)
			for _, item := range order.Items {
				b.WriteString(`<div>` + item.Menu.Name + ` × ` + strconv.Itoa(item.Quantity) + ` ` + spicyLabels[item.SpicyLevel] + `</div>`)
			}
			if strings.TrimSpace(order.Remark) != "" {
				b.WriteString(`<div style="margin-top:8px;color:#666">备注：` + order.Remark + `</div>`)
			}
			b.WriteString(`</div></div>`)
		}
		b.WriteString(`</div></body></html>`)
		c.Header("Content-Type", "text/html; charset=utf-8")
		c.Header("Content-Disposition", contentDispositionAttachment(menuTitle+".html"))
		c.String(200, b.String())
		return
	} else if round.Mode == "vote" {
		// Vote mode export logic
		var voteSessions []model.VoteSession
		h.DB.Where("round_id = ?", round.ID).Preload("Pizzas").Preload("Votes").Find(&voteSessions)
		// Get vote title from first vote session
		var voteTitle string = "投票"
		if len(voteSessions) > 0 {
			voteTitle = voteSessions[0].Title
		}
		var b strings.Builder
		b.WriteString(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>` + round.Title + `</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:20px;background:#f5f5f5}.container{max-width:720px;margin:0 auto}.card{background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.08);padding:16px;margin-bottom:12px}.item{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee}.item:last-child{border-bottom:0}</style></head><body><div class="container"><h1 style="text-align:center">` + round.Title + `</h1>`)
		for _, vs := range voteSessions {
			b.WriteString(`<div class="card"><div style="font-weight:700;margin-bottom:8px">` + vs.Title + `</div>`)
			for _, p := range vs.Pizzas {
				count := 0
				for _, v := range vs.Votes {
					if v.PizzaID == p.ID {
						count++
					}
				}
				need := 0
				if p.Servings > 0 {
					need = int(math.Ceil(float64(count) / float64(p.Servings)))
				}
				b.WriteString(`<div class="item"><div>` + p.Name + `</div><div>` + fmt.Sprintf(`%d 票 / 需订 %d 个`, count, need) + `</div></div>`)
			}
			b.WriteString(`</div>`)
		}
		b.WriteString(`</div></body></html>`)
		c.Header("Content-Type", "text/html; charset=utf-8")
		c.Header("Content-Disposition", contentDispositionAttachment(voteTitle+".html"))
		c.String(200, b.String())
		return
	} else {
		c.JSON(400, gin.H{"error": "不支持的轮次类型"})
		return
	}
}

func (h *AdminHandler) ExportRoundCSV(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(400, gin.H{"error": "无效轮次ID"})
		return
	}
	var round model.ActivityRound
	if err := h.DB.First(&round, id).Error; err != nil {
		c.JSON(404, gin.H{"error": "轮次不存在"})
		return
	}
	if round.Mode != "order" {
		c.JSON(400, gin.H{"error": "当前仅支持导出点餐轮次CSV"})
		return
	}
	var orders []model.Order
	h.DB.Where("round_id = ?", round.ID).Preload("Items").Preload("Items.Menu").Order("created_at desc").Find(&orders)
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="round_%d.csv"`, round.ID))
	c.Writer.Write([]byte("\xEF\xBB\xBF"))
	writer := csv.NewWriter(c.Writer)
	_ = writer.Write([]string{"姓名", "菜品", "数量", "辣度", "备注", "提交时间"})
	spicyLabels := map[int]string{0: "不辣", 1: "微辣", 2: "中辣", 3: "重辣"}
	for _, order := range orders {
		if len(order.Items) == 0 {
			_ = writer.Write([]string{order.Person, "", "", "", order.Remark, order.CreatedAt.Format("2006-01-02 15:04:05")})
			continue
		}
		for _, item := range order.Items {
			_ = writer.Write([]string{order.Person, item.Menu.Name, strconv.Itoa(item.Quantity), spicyLabels[item.SpicyLevel], order.Remark, order.CreatedAt.Format("2006-01-02 15:04:05")})
		}
	}
	writer.Flush()
}

func (h *AdminHandler) ExportRoundXLSX(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(400, gin.H{"error": "无效轮次ID"})
		return
	}
	var round model.ActivityRound
	if err := h.DB.First(&round, id).Error; err != nil {
		c.JSON(404, gin.H{"error": "轮次不存在"})
		return
	}
	if round.Mode != "order" {
		c.JSON(400, gin.H{"error": "当前仅支持导出点餐轮次XLSX"})
		return
	}
	var orders []model.Order
	h.DB.Where("round_id = ?", round.ID).Preload("Items").Preload("Items.Menu").Order("created_at desc").Find(&orders)

	// Get excused persons
	var excusedPersons []model.Person
	h.DB.Where("excused = ?", true).Order("name asc").Find(&excusedPersons)

	f := excelize.NewFile()
	defer func() { _ = f.Close() }()

	// ===== Sheet 1: 汇总 =====
	summarySheet := "汇总"
	f.SetSheetName("Sheet1", summarySheet)

	f.SetCellValue(summarySheet, "A1", round.Title)
	f.SetCellValue(summarySheet, "A2", "创建时间："+round.CreatedAt.Format("2006-01-02 15:04"))
	if round.ClosedAt != nil {
		f.SetCellValue(summarySheet, "A3", "结束时间："+round.ClosedAt.Format("2006-01-02 15:04"))
	}

	// Aggregate per-dish counts
	type dishStats struct {
		name          string
		total         int
		spicyBreakdown map[int]int
	}
	dishMap := make(map[string]*dishStats)
	for _, order := range orders {
		for _, item := range order.Items {
			name := item.Menu.Name
			if dishMap[name] == nil {
				dishMap[name] = &dishStats{name: name, spicyBreakdown: make(map[int]int)}
			}
			dishMap[name].total += item.Quantity
			dishMap[name].spicyBreakdown[item.SpicyLevel] += item.Quantity
		}
	}

	dishes := make([]*dishStats, 0, len(dishMap))
	for _, d := range dishMap {
		dishes = append(dishes, d)
	}
	sort.Slice(dishes, func(i, j int) bool { return dishes[i].total > dishes[j].total })

	spicyLabels := map[int]string{0: "不辣", 1: "微辣", 2: "中辣", 3: "重辣"}
	summaryHeaderRow := 5
	sumHeaders := []string{"菜品", "不辣", "微辣", "中辣", "重辣", "合计"}
	boldStyle, _ := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}})
	for i, h := range sumHeaders {
		cell, _ := excelize.CoordinatesToCellName(i+1, summaryHeaderRow)
		f.SetCellValue(summarySheet, cell, h)
		f.SetCellStyle(summarySheet, cell, cell, boldStyle)
	}

	for i, d := range dishes {
		row := summaryHeaderRow + 1 + i
		f.SetCellValue(summarySheet, fmt.Sprintf("A%d", row), d.name)
		for level := 0; level <= 3; level++ {
			col := level + 2
			cell, _ := excelize.CoordinatesToCellName(col, row)
			cnt := d.spicyBreakdown[level]
			if cnt > 0 {
				f.SetCellValue(summarySheet, cell, cnt)
			} else {
				f.SetCellValue(summarySheet, cell, "-")
			}
		}
		f.SetCellValue(summarySheet, fmt.Sprintf("F%d", row), d.total)
	}

	// Add bar chart
	if len(dishes) > 0 {
		chartStart := summaryHeaderRow + 1
		chartEnd := summaryHeaderRow + len(dishes)
		catRange := fmt.Sprintf("%s!$A$%d:$A$%d", summarySheet, chartStart, chartEnd)
		valRange := fmt.Sprintf("%s!$F$%d:$F$%d", summarySheet, chartStart, chartEnd)
		_ = f.AddChart(summarySheet, "H5", &excelize.Chart{
			Type:   excelize.Col,
			Series: []excelize.ChartSeries{{Name: "数量", Categories: catRange, Values: valRange}},
			Format: excelize.GraphicOptions{OffsetX: 10, OffsetY: 10},
			Legend: excelize.ChartLegend{Position: "none"},
			Title:  []excelize.RichTextRun{{Text: "菜品热度分布", Font: &excelize.Font{Bold: true}}},
			PlotArea: excelize.ChartPlotArea{ShowCatName: true, ShowVal: true},
		})
	}

	f.SetColWidth(summarySheet, "A", "A", 28)
	f.SetColWidth(summarySheet, "B", "G", 12)

	// ===== Sheet 2: 明细 =====
	detailSheet := "明细"
	f.NewSheet(detailSheet)
	detailHeaders := []string{"姓名", "菜品", "数量", "辣度", "备注", "提交时间"}
	for i, htext := range detailHeaders {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(detailSheet, cell, htext)
		f.SetCellStyle(detailSheet, cell, cell, boldStyle)
	}
	row := 2
	for _, order := range orders {
		if len(order.Items) == 0 {
			f.SetSheetRow(detailSheet, fmt.Sprintf("A%d", row), &[]any{order.Person, "", "", "", order.Remark, order.CreatedAt.Format("2006-01-02 15:04:05")})
			row++
			continue
		}
		for _, item := range order.Items {
			f.SetSheetRow(detailSheet, fmt.Sprintf("A%d", row), &[]any{order.Person, item.Menu.Name, item.Quantity, spicyLabels[item.SpicyLevel], order.Remark, order.CreatedAt.Format("2006-01-02 15:04:05")})
			row++
		}
	}
	f.SetColWidth(detailSheet, "A", "F", 18)

	// ===== Sheet 3: 请假记录 =====
	excusedSheet := "请假记录"
	f.NewSheet(excusedSheet)
	f.SetCellValue(excusedSheet, "A1", "姓名")
	f.SetCellStyle(excusedSheet, "A1", "A1", boldStyle)
	for i, p := range excusedPersons {
		f.SetCellValue(excusedSheet, fmt.Sprintf("A%d", i+2), p.Name)
	}
	f.SetColWidth(excusedSheet, "A", "A", 20)

	filename := fmt.Sprintf("round_%d_export_%s.xlsx", round.ID, time.Now().Format("20060102"))
	c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Header("Content-Disposition", contentDispositionAttachment(filename))
	_ = f.Write(c.Writer)
}

func (h *AdminHandler) LookupPersonCurrent(c *gin.Context) {
	person := strings.TrimSpace(c.Query("person"))
	if person == "" {
		c.JSON(400, gin.H{"error": "缺少 person 参数"})
		return
	}
	var round model.ActivityRound
	if err := h.DB.Where("active = ?", true).Order("id desc").First(&round).Error; err != nil {
		c.JSON(200, gin.H{"mode": "idle", "person": person})
		return
	}
	if round.Mode == "order" {
		var order model.Order
		if err := h.DB.Where("round_id = ? AND person = ?", round.ID, person).Preload("Items").Preload("Items.Menu").First(&order).Error; err != nil {
			c.JSON(200, gin.H{"mode": "order", "person": person, "found": false})
			return
		}
		c.JSON(200, gin.H{"mode": "order", "person": person, "found": true, "order": order})
		return
	}
	var votes []model.Vote
	h.DB.Joins("JOIN vote_sessions ON vote_sessions.id = votes.vote_session_id").Where("vote_sessions.round_id = ? AND votes.person = ?", round.ID, person).Preload("Pizza").Find(&votes)
	c.JSON(200, gin.H{"mode": "vote", "person": person, "found": len(votes) > 0, "votes": votes})
}

func (h *AdminHandler) TemplateDownload(c *gin.Context) {
	t := c.Param("type")
	switch t {
	case "spicy":
		f := excelize.NewFile()
		defer func() { _ = f.Close() }()
		sheet := f.GetSheetName(0)
		f.SetSheetName(sheet, "菜单模板")
		sheet = "菜单模板"
		rows := [][]any{
			{"午餐点餐"},
			{"宫保鸡丁", "1-3"},
			{"麻婆豆腐", "2"},
			{"番茄炒蛋", ""},
			{"口水鸡", "微辣/中辣/重辣"},
		}
		for i, row := range rows {
			cell, _ := excelize.CoordinatesToCellName(1, i+1)
			f.SetSheetRow(sheet, cell, &row)
		}
		_ = f.SetCellValue(sheet, "D1", "填写说明")
		_ = f.SetCellValue(sheet, "D2", "A1 填店名/本轮标题")
		_ = f.SetCellValue(sheet, "D3", "A2 开始填菜品名")
		_ = f.SetCellValue(sheet, "D4", "B2 开始选填辣度")
		_ = f.SetCellValue(sheet, "D5", "支持 1-3、1-3、微辣/中辣/重辣")
		f.SetColWidth(sheet, "A", "B", 28)
		f.SetColWidth(sheet, "D", "D", 30)
		c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
		c.Header("Content-Disposition", `attachment; filename="template_menu.xlsx"`)
		_ = f.Write(c.Writer)
	case "plain":
		f := excelize.NewFile()
		defer func() { _ = f.Close() }()
		sheet := f.GetSheetName(0)
		f.SetSheetName(sheet, "菜单模板")
		sheet = "菜单模板"
		rows := [][]any{
			{"午餐点餐"},
			{"宫保鸡丁"},
			{"麻婆豆腐"},
			{"番茄炒蛋"},
		}
		for i, row := range rows {
			cell, _ := excelize.CoordinatesToCellName(1, i+1)
			f.SetSheetRow(sheet, cell, &row)
		}
		_ = f.SetCellValue(sheet, "C1", "填写说明")
		_ = f.SetCellValue(sheet, "C2", "A1 填店名/本轮标题")
		_ = f.SetCellValue(sheet, "C3", "A2 开始填菜品名")
		f.SetColWidth(sheet, "A", "A", 28)
		f.SetColWidth(sheet, "C", "C", 30)
		c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
		c.Header("Content-Disposition", `attachment; filename="template_plain.xlsx"`)
		_ = f.Write(c.Writer)
	case "personnel":
		c.Header("Content-Type", "text/csv; charset=utf-8")
		c.Header("Content-Disposition", `attachment; filename="template_personnel.csv"`)
		c.Data(200, "text/csv; charset=utf-8", []byte("\xEF\xBB\xBF姓名\n"))
	default:
		c.JSON(400, gin.H{"error": "类型无效，支持 spicy / plain / personnel"})
	}
}

func (h *AdminHandler) ExportHTML(c *gin.Context) {
	mode := strings.TrimSpace(c.Query("mode"))
	if mode == "vote" {
		round, err := getActiveRound(h.DB, "vote")
		if err == gorm.ErrRecordNotFound {
			c.JSON(400, gin.H{"error": "当前没有进行中的投票"})
			return
		}
		if err != nil {
			c.JSON(500, gin.H{"error": "查询投票失败"})
			return
		}
		var voteSessions []model.VoteSession
		h.DB.Where("round_id = ?", round.ID).Preload("Pizzas").Preload("Votes").Find(&voteSessions)
		var b strings.Builder
		b.WriteString(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>` + round.Title + `</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:20px;background:#f5f5f5}.container{max-width:720px;margin:0 auto}.card{background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.08);padding:16px;margin-bottom:12px}.item{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee}.item:last-child{border-bottom:0}</style></head><body><div class="container"><h1 style="text-align:center">` + round.Title + `</h1>`)
		for _, vs := range voteSessions {
			b.WriteString(`<div class="card"><div style="font-weight:700;margin-bottom:8px">` + vs.Title + `</div>`)
			for _, p := range vs.Pizzas {
				count := 0
				for _, v := range vs.Votes {
					if v.PizzaID == p.ID {
						count++
					}
				}
				need := 0
				if p.Servings > 0 {
					need = int(math.Ceil(float64(count) / float64(p.Servings)))
				}
				b.WriteString(`<div class="item"><div>` + p.Name + `</div><div>` + fmt.Sprintf(`%d 票 / 需订 %d 个`, count, need) + `</div></div>`)
			}
			b.WriteString(`</div>`)
		}
		b.WriteString(`</div></body></html>`)
		c.Header("Content-Type", "text/html; charset=utf-8")
		c.String(200, b.String())
		return
	}

	round, err := getActiveRound(h.DB, "order")
	if err == gorm.ErrRecordNotFound {
		c.JSON(400, gin.H{"error": "当前没有进行中的点餐轮次"})
		return
	}
	if err != nil {
		c.JSON(500, gin.H{"error": "查询轮次失败"})
		return
	}
	var orders []model.Order
	h.DB.Where("round_id = ?", round.ID).Preload("Items").Preload("Items.Menu").Find(&orders)
	type summaryItem struct {
		Name           string
		TotalBySpicy   map[int]int
		PersonsBySpicy map[int][]string
		GrandTotal     int
	}
	summary := map[string]*summaryItem{}
	for _, order := range orders {
		for _, item := range order.Items {
			key := item.Menu.Name
			if _, ok := summary[key]; !ok {
				summary[key] = &summaryItem{Name: item.Menu.Name, TotalBySpicy: map[int]int{}, PersonsBySpicy: map[int][]string{}}
			}
			s := summary[key]
			s.TotalBySpicy[item.SpicyLevel] += item.Quantity
			s.GrandTotal += item.Quantity
			s.PersonsBySpicy[item.SpicyLevel] = append(s.PersonsBySpicy[item.SpicyLevel], order.Person)
		}
	}
	keys := make([]string, 0, len(summary))
	for k := range summary {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	spicyLabels := map[int]string{0: "不辣", 1: "微辣", 2: "中辣", 3: "重辣"}
	var b strings.Builder
	b.WriteString(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>` + round.Title + `</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:20px;background:#f5f5f5}.container{max-width:720px;margin:0 auto}h1,h2{text-align:center}.card,table{background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.1)}.card{margin-bottom:12px;overflow:hidden}.card-header{display:flex;justify-content:space-between;padding:16px;cursor:pointer}.card-detail{display:none;padding:0 16px 16px;border-top:1px solid #eee}.card-detail.open{display:block}.total-badge{background:#ff6b6b;color:#fff;padding:4px 12px;border-radius:20px}table{width:100%;border-collapse:collapse;margin:16px 0}.vote-card{background:#fff;border-radius:12px;margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,.1);padding:16px}.vote-item{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f0f0}</style></head><body><div class="container"><h1>` + round.Title + `</h1>`)
	grandTotal := 0
	for _, k := range keys {
		item := summary[k]
		grandTotal += item.GrandTotal
		b.WriteString(`<div class="card"><div class="card-header" onclick="toggle(this)"><div>` + item.Name + `</div><div><span class="total-badge">` + strconv.Itoa(item.GrandTotal) + `</span></div></div><div class="card-detail">`)
		for level := 0; level <= 3; level++ {
			count := item.TotalBySpicy[level]
			if count == 0 {
				continue
			}
			b.WriteString(`<div><strong>` + spicyLabels[level] + `</strong> ` + strconv.Itoa(count) + ` 份<ul>`)
			for _, p := range item.PersonsBySpicy[level] {
				b.WriteString(`<li>` + p + `</li>`)
			}
			b.WriteString(`</ul></div>`)
		}
		b.WriteString(`</div></div>`)
	}
	b.WriteString(`<div style="text-align:center;padding:16px;font-size:18px;font-weight:bold;color:#ff6b6b">共 ` + strconv.Itoa(grandTotal) + ` 份</div>`)
	b.WriteString(`<h2>📊 辣度速查表</h2><table><thead><tr><th style="text-align:left;padding:10px">菜品</th><th>不辣</th><th>微辣</th><th>中辣</th><th>重辣</th><th>合计</th></tr></thead><tbody>`)
	for _, k := range keys {
		item := summary[k]
		b.WriteString(`<tr><td style="padding:10px">` + item.Name + `</td>`)
		for level := 0; level <= 3; level++ {
			count := item.TotalBySpicy[level]
			if count == 0 {
				b.WriteString(`<td style="text-align:center;color:#ccc">-</td>`)
			} else {
				b.WriteString(`<td style="text-align:center">` + strconv.Itoa(count) + `</td>`)
			}
		}
		b.WriteString(`<td style="text-align:center;font-weight:bold">` + strconv.Itoa(item.GrandTotal) + `</td></tr>`)
	}
	b.WriteString(`</tbody></table>`)
	b.WriteString(`</div><script>function toggle(el){el.nextElementSibling.classList.toggle('open')}</script></body></html>`)
	c.Header("Content-Type", "text/html; charset=utf-8")
	c.String(200, b.String())
}

// POST /api/admin/persons/bulk-excuse
func (h *AdminHandler) BulkExcuse(c *gin.Context) {
	var req struct {
		Names  []string `json:"names"`
		Action string   `json:"action"`
		Mode   string   `json:"mode"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "无效请求"})
		return
	}
	if len(req.Names) == 0 {
		c.JSON(400, gin.H{"error": "名单不能为空"})
		return
	}
	excuse := req.Action == "excuse"
	field := "order_excused"
	if req.Mode == "vote" {
		field = "vote_excused"
	}
	if err := h.DB.Model(&model.Person{}).Where("name IN ?", req.Names).Update(field, excuse).Error; err != nil {
		c.JSON(500, gin.H{"error": "更新失败"})
		return
	}
	c.JSON(200, gin.H{"updated": len(req.Names), "excused": excuse, "mode": req.Mode})
}

// GET /api/admin/persons/excused
func (h *AdminHandler) ListExcused(c *gin.Context) {
	mode := strings.TrimSpace(c.Query("mode"))
	var persons []model.Person
	if mode == "order" {
		h.DB.Where("order_excused = ?", true).Order("name asc").Find(&persons)
	} else if mode == "vote" {
		h.DB.Where("vote_excused = ?", true).Order("name asc").Find(&persons)
	} else {
		h.DB.Where("order_excused = ? OR vote_excused = ?", true, true).Order("name asc").Find(&persons)
	}
	c.JSON(200, persons)
}

// GET /api/admin/stream — SSE endpoint for real-time participation status
func (h *AdminHandler) StreamStatus(c *gin.Context) {
	modeFilter := strings.TrimSpace(c.Query("mode"))

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("Access-Control-Allow-Origin", "*")
	c.Header("X-Accel-Buffering", "no")

	flush := func() {
		if flusher, ok := c.Writer.(http.Flusher); ok {
			flusher.Flush()
		}
	}

	sendStatus := func() {
		var persons []model.Person
		h.DB.Where("excused = ?", false).Order("name asc").Find(&persons)

		var round model.ActivityRound
		q := h.DB.Where("active = ?", true).Order("id desc")
		if modeFilter != "" {
			q = q.Where("mode = ?", modeFilter)
		}
		err := q.First(&round).Error

		doneSet := map[string]struct{}{}
		if err == nil {
			if round.Mode == "order" {
				var names []string
				h.DB.Raw("SELECT DISTINCT person FROM orders WHERE round_id = ?", round.ID).Scan(&names)
				for _, n := range names {
					doneSet[n] = struct{}{}
				}
			} else if round.Mode == "vote" {
				var names []string
				h.DB.Raw(`SELECT DISTINCT votes.person FROM votes JOIN vote_sessions ON vote_sessions.id = votes.vote_session_id WHERE vote_sessions.round_id = ?`, round.ID).Scan(&names)
				for _, n := range names {
					doneSet[n] = struct{}{}
				}
			}
		}

		pending := make([]string, 0)
		for _, p := range persons {
			if _, ok := doneSet[p.Name]; !ok {
				pending = append(pending, p.Name)
			}
		}
		completionRate := 0
		if len(persons) > 0 {
			completionRate = int(math.Round(float64(len(doneSet)) * 100 / float64(len(persons))))
		}

		mode := "idle"
		if err == nil {
			mode = round.Mode
		}

		payload := gin.H{
			"mode":            mode,
			"total_count":     len(persons),
			"done_count":     len(doneSet),
			"pending":         pending,
			"completion_rate": completionRate,
			"timestamp":       time.Now().Unix(),
		}
		if err == nil {
			payload["round_id"] = round.ID
			payload["title"] = round.Title
			payload["deadline_at"] = round.DeadlineAt
		}

		data, _ := json.Marshal(payload)
		c.Writer.Write([]byte("data: "))
		c.Writer.Write(data)
		c.Writer.Write([]byte("\n\n"))
		flush()
	}

	// Send initial status immediately
	sendStatus()

	// Keep-alive tick
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	clientGone := c.Request.Context().Done()
	for {
		select {
		case <-clientGone:
			return
		case <-ticker.C:
			sendStatus()
		}
	}
}

// GET /api/admin/stats — aggregated statistics
func (h *AdminHandler) GetStats(c *gin.Context) {
	var totalRounds int64
	h.DB.Model(&model.ActivityRound{}).Count(&totalRounds)

	var totalOrders int64
	h.DB.Model(&model.Order{}).Count(&totalOrders)

	var totalPeople int64
	h.DB.Model(&model.Person{}).Count(&totalPeople)

	var excusedCount int64
	h.DB.Model(&model.Person{}).Where("excused = ?", true).Count(&excusedCount)

	// Participation rate
	var avgParticipation float64
	h.DB.Raw(`
		SELECT AVG(
			CASE
				WHEN r.mode = 'order' THEN
					CAST((SELECT COUNT(DISTINCT person) FROM orders WHERE round_id = r.id) AS REAL) /
					NULLIF((SELECT COUNT(*) FROM persons WHERE excused = 0), 0) * 100
				WHEN r.mode = 'vote' THEN
					CAST((SELECT COUNT(DISTINCT votes.person) FROM votes JOIN vote_sessions vs ON vs.id = votes.vote_session_id WHERE vs.round_id = r.id) AS REAL) /
					NULLIF((SELECT COUNT(*) FROM persons WHERE excused = 0), 0) * 100
				ELSE 0
			END
		) FROM activity_rounds r WHERE r.active = 0
	`).Scan(&avgParticipation)

	// Available months (last 12 months with order rounds)
	var availableMonths []struct {
		Month string `json:"month"`
	}
	h.DB.Raw(`
		SELECT DISTINCT strftime('%Y-%m', created_at) as month
		FROM activity_rounds
		WHERE created_at >= date('now', '-12 months') AND mode = 'order'
		ORDER BY month DESC
	`).Scan(&availableMonths)

	c.JSON(200, gin.H{
		"total_rounds":       totalRounds,
		"total_orders":       totalOrders,
		"total_people":       totalPeople,
		"available_months":   availableMonths,
		"participation_rate": int(math.Round(avgParticipation)),
		"excused_count":      excusedCount,
	})
}

// GET /api/admin/backup — stream SQLite DB as downloadable zip
func (h *AdminHandler) BackupDB(c *gin.Context) {
	dbPath := "ordering.db"
	if _, err := os.Stat(dbPath); os.IsNotExist(err) {
		c.JSON(404, gin.H{"error": "数据库文件不存在"})
		return
	}

	buf := new(bytes.Buffer)
	w := zip.NewWriter(buf)

	defer w.Close()

	f, err := w.Create("ordering.db")
	if err != nil {
		c.JSON(500, gin.H{"error": "创建备份失败"})
		return
	}

	src, err := os.Open(dbPath)
	if err != nil {
		c.JSON(500, gin.H{"error": "读取数据库失败"})
		return
	}
	defer src.Close()

	if _, err := io.Copy(f, src); err != nil {
		c.JSON(500, gin.H{"error": "备份写入失败"})
		return
	}

	if err := w.Close(); err != nil {
		c.JSON(500, gin.H{"error": "压缩失败"})
		return
	}

	timestamp := time.Now().Format("20060102_150405")
	filename := fmt.Sprintf("ordering_backup_%s.db", timestamp)

	c.Header("Content-Type", "application/zip")
	c.Header("Content-Disposition", contentDispositionAttachment(filename))
	c.Data(200, "application/zip", buf.Bytes())
}

func (h *AdminHandler) RestoreDB(c *gin.Context) {
	var req struct {
		Confirm bool `json:"confirm"`
	}
	if err := c.ShouldBindJSON(&req); err == nil {
		if !req.Confirm {
			c.JSON(400, gin.H{"error": "需要确认才能恢复数据库"})
			return
		}
	} else {
		// Try header-based confirmation
		confirmHeader := c.GetHeader("X-Restore-Confirm")
		if confirmHeader != "true" {
			c.JSON(400, gin.H{"error": "需要确认才能恢复数据库，请设置 X-Restore-Confirm: true 或发送 {confirm: true} JSON body"})
			return
		}
	}

	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(400, gin.H{"error": "请上传数据库文件"})
		return
	}

	if !strings.HasSuffix(file.Filename, ".db") && !strings.HasSuffix(file.Filename, ".sqlite") && !strings.HasSuffix(file.Filename, ".sqlite3") {
		c.JSON(400, gin.H{"error": "仅支持 .db / .sqlite / .sqlite3 文件"})
		return
	}

	// Verify it's a valid SQLite file by reading header
	f, err := file.Open()
	if err != nil {
		c.JSON(500, gin.H{"error": "无法读取上传文件"})
		return
	}
	header := make([]byte, 16)
	if _, err := f.Read(header); err != nil {
		f.Close()
		c.JSON(500, gin.H{"error": "文件读取失败"})
		return
	}
	f.Close()

	// SQLite magic header
	if string(header[:16]) != "SQLite format 3\x00" {
		c.JSON(400, gin.H{"error": "无效的 SQLite 数据库文件"})
		return
	}

	// Close existing connections by replacing the DB file
	dbPath := "ordering.db"
	backupPath := dbPath + ".bak." + time.Now().Format("20060102_150405")
	if _, err := os.Stat(dbPath); err == nil {
		os.Rename(dbPath, backupPath)
	}

	// Save uploaded file
	if err := c.SaveUploadedFile(file, dbPath); err != nil {
		// Try to restore backup
		if _, err2 := os.Stat(backupPath); err2 == nil {
			os.Rename(backupPath, dbPath)
		}
		c.JSON(500, gin.H{"error": "文件保存失败: " + err.Error()})
		return
	}

	c.JSON(200, gin.H{
		"restored":  true,
		"backup":     filepath.Base(backupPath),
		"notice":     "数据库已恢复，请刷新页面或重启服务以加载新数据",
	})
}

// Helper: JSON marshal without import cycle
func jsonMarshal(v any) ([]byte, error) {
	var buf bytes.Buffer
	encoder := json.NewEncoder(&buf)
	encoder.SetEscapeHTML(false)
	err := encoder.Encode(v)
	return buf.Bytes(), err
}

// GET /api/admin/stats/:month/shops — shops (round titles) for a specific month
func (h *AdminHandler) GetStatsMonthShops(c *gin.Context) {
	month := c.Param("month")
	if len(month) != 7 || month[4] != '-' {
		c.JSON(400, gin.H{"error": "月份格式应为 YYYY-MM"})
		return
	}

	var shops []struct {
		RoundID   uint   `json:"round_id"`
		Title     string `json:"title"`
		OrderCount int    `json:"order_count"`
		CreatedAt string `json:"created_at"`
	}

	// Query order rounds for the month
	var rounds []model.ActivityRound
	h.DB.Where("mode = ? AND strftime('%Y-%m', created_at) = ?", "order", month).Order("id asc").Find(&rounds)

	for _, r := range rounds {
		var count int64
		h.DB.Model(&model.Order{}).Where("round_id = ?", r.ID).Count(&count)
		shops = append(shops, struct {
			RoundID   uint   `json:"round_id"`
			Title     string `json:"title"`
			OrderCount int    `json:"order_count"`
			CreatedAt string `json:"created_at"`
		}{
			RoundID:   r.ID,
			Title:     r.Title,
			OrderCount: int(count),
			CreatedAt: r.CreatedAt.Format("2006-01-02 15:04"),
		})
	}

	c.JSON(200, gin.H{"month": month, "shops": shops})
}

// GET /api/admin/stats/:month/dishes — top 10 dishes for a specific month
func (h *AdminHandler) GetStatsMonthDishes(c *gin.Context) {
	month := c.Param("month")
	if len(month) != 7 || month[4] != '-' {
		c.JSON(400, gin.H{"error": "月份格式应为 YYYY-MM"})
		return
	}

	var topDishes []struct {
		Name  string `json:"name"`
		Count int    `json:"count"`
	}

	// Query dishes ordered in the month
	start := month + "-01"
	end := month + "-31"

	// Find round IDs for the month
	var roundIDs []uint
	h.DB.Model(&model.ActivityRound{}).
		Where("mode = ? AND date(created_at) >= ? AND date(created_at) <= ?", "order", start, end).
		Pluck("id", &roundIDs)

	if len(roundIDs) == 0 {
		c.JSON(200, gin.H{"month": month, "dishes": []any{}})
		return
	}

	// Query order items for these rounds
	var orderIDs []uint
	h.DB.Model(&model.Order{}).Where("round_id IN ?", roundIDs).Pluck("id", &orderIDs)

	if len(orderIDs) == 0 {
		c.JSON(200, gin.H{"month": month, "dishes": []any{}})
		return
	}

	// Sum quantities by menu name
	var menuIDs []uint
	h.DB.Model(&model.OrderItem{}).Where("order_id IN ?", orderIDs).Pluck("menu_id", &menuIDs)

	// Get menu names and quantities
	var menuQuantities []struct {
		MenuID    uint `json:"menu_id"`
		Quantity  int  `json:"quantity"`
	}
	h.DB.Model(&model.OrderItem{}).Select("menu_id, SUM(quantity) as quantity").Where("order_id IN ?", orderIDs).Group("menu_id").Find(&menuQuantities)

	// Get menu names
	for _, mq := range menuQuantities {
		var menu model.Menu
		if err := h.DB.First(&menu, mq.MenuID).Error; err == nil {
			topDishes = append(topDishes, struct {
				Name  string `json:"name"`
				Count int    `json:"count"`
			}{Name: menu.Name, Count: mq.Quantity})
		}
	}

	// Sort by count descending
	sort.Slice(topDishes, func(i, j int) bool {
		return topDishes[i].Count > topDishes[j].Count
	})

	// Limit to top 10
	if len(topDishes) > 10 {
		topDishes = topDishes[:10]
	}

	c.JSON(200, gin.H{"month": month, "dishes": topDishes})
}
