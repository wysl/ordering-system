package handler

import (
	"encoding/csv"
	"fmt"
	"math"
	"os"
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

func (h *AdminHandler) Login(c *gin.Context) {
	var req struct{ Password string `json:"password"` }
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
	h.DB.Order("name asc").Find(&persons)
	var round model.ActivityRound
	q := h.DB.Where("active = ?", true).Order("id desc")
	if modeFilter != "" {
		q = q.Where("mode = ?", modeFilter)
	}
	err := q.First(&round).Error
	if err == gorm.ErrRecordNotFound {
		c.JSON(200, gin.H{"mode": "idle", "total_count": len(persons), "done_count": 0, "pending": namesFromPersons(persons)})
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
		for _, n := range names { doneSet[n] = struct{}{} }
	} else if round.Mode == "vote" {
		var names []string
		h.DB.Raw(`SELECT DISTINCT votes.person FROM votes JOIN vote_sessions ON vote_sessions.id = votes.vote_session_id WHERE vote_sessions.round_id = ?`, round.ID).Scan(&names)
		for _, n := range names { doneSet[n] = struct{}{} }
	}
	pending := make([]string, 0)
	for _, p := range persons {
		if _, ok := doneSet[p.Name]; !ok { pending = append(pending, p.Name) }
	}
	c.JSON(200, gin.H{"mode": round.Mode, "round_id": round.ID, "title": round.Title, "deadline_at": round.DeadlineAt, "total_count": len(persons), "done_count": len(doneSet), "pending": pending})
}

func namesFromPersons(persons []model.Person) []string {
	out := make([]string, 0, len(persons))
	for _, p := range persons { out = append(out, p.Name) }
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
		"active": false,
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
	var round model.ActivityRound
	if err := h.DB.First(&round, id).Error; err != nil {
		c.JSON(404, gin.H{"error": "轮次不存在"})
		return
	}
	_ = h.DB.Transaction(func(tx *gorm.DB) error {
		if round.Mode == "order" {
			var orders []model.Order
			tx.Where("round_id = ?", round.ID).Find(&orders)
			for _, o := range orders { tx.Where("order_id = ?", o.ID).Delete(&model.OrderItem{}) }
			tx.Where("round_id = ?", round.ID).Delete(&model.Order{})
			tx.Where("round_id = ?", round.ID).Delete(&model.Menu{})
		} else {
			var sessions []model.VoteSession
			tx.Where("round_id = ?", round.ID).Find(&sessions)
			for _, s := range sessions {
				tx.Where("vote_session_id = ?", s.ID).Delete(&model.Vote{})
				tx.Where("vote_session_id = ?", s.ID).Delete(&model.VotePizza{})
			}
			tx.Where("round_id = ?", round.ID).Delete(&model.VoteSession{})
		}
		return tx.Delete(&model.ActivityRound{}, round.ID).Error
	})
	c.JSON(200, gin.H{"deleted": true})
}

func (h *AdminHandler) ListRounds(c *gin.Context) {
	var rounds []model.ActivityRound
	h.DB.Order("id desc").Limit(20).Find(&rounds)
	type roundItem struct {
		ID         uint       `json:"id"`
		Mode       string     `json:"mode"`
		Title      string     `json:"title"`
		Active     bool       `json:"active"`
		CreatedAt  time.Time  `json:"created_at"`
		ClosedAt   *time.Time `json:"closed_at"`
		DeadlineAt *time.Time `json:"deadline_at"`
		Count      int64      `json:"count"`
	}
	result := make([]roundItem, 0, len(rounds))
	for _, r := range rounds {
		var count int64
		if r.Mode == "order" {
			h.DB.Model(&model.Order{}).Where("round_id = ?", r.ID).Count(&count)
		} else if r.Mode == "vote" {
			h.DB.Raw(`SELECT COUNT(DISTINCT votes.person) FROM votes JOIN vote_sessions ON vote_sessions.id = votes.vote_session_id WHERE vote_sessions.round_id = ?`, r.ID).Scan(&count)
		}
		result = append(result, roundItem{ID: r.ID, Mode: r.Mode, Title: r.Title, Active: r.Active, CreatedAt: r.CreatedAt, ClosedAt: r.ClosedAt, DeadlineAt: r.DeadlineAt, Count: count})
	}
	c.JSON(200, result)
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
	if round.Mode != "order" {
		c.JSON(400, gin.H{"error": "当前仅支持导出点餐轮次"})
		return
	}
	// temporarily export this round using same logic
	var orders []model.Order
	h.DB.Where("round_id = ?", round.ID).Preload("Items").Preload("Items.Menu").Find(&orders)
	type summaryItem struct { Name string; TotalBySpicy map[int]int; PersonsBySpicy map[int][]string; GrandTotal int }
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
	keys := make([]string, 0, len(summary)); for k := range summary { keys = append(keys, k) }; sort.Strings(keys)
	spicyLabels := map[int]string{0: "不辣", 1: "微辣", 2: "中辣", 3: "重辣"}
	var b strings.Builder
	b.WriteString(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>历史轮次导出</title><style>body{font-family:sans-serif;padding:20px;background:#f5f5f5}.container{max-width:720px;margin:0 auto}table,.card{background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.08)}.card{padding:16px;margin-bottom:12px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{padding:10px;border-bottom:1px solid #eee;text-align:left}</style></head><body><div class="container"><h1>` + round.Title + `</h1><div class="card">创建时间：` + round.CreatedAt.Format("2006-01-02 15:04") + `</div><table><thead><tr><th>菜品</th><th>不辣</th><th>微辣</th><th>中辣</th><th>重辣</th><th>合计</th></tr></thead><tbody>`)
	for _, k := range keys {
		item := summary[k]
		b.WriteString(`<tr><td>` + item.Name + `</td>`)
		for level := 0; level <= 3; level++ { if item.TotalBySpicy[level] == 0 { b.WriteString(`<td>-</td>`) } else { b.WriteString(`<td>` + strconv.Itoa(item.TotalBySpicy[level]) + `</td>`) } }
		b.WriteString(`<td>` + strconv.Itoa(item.GrandTotal) + `</td></tr>`)
	}
	b.WriteString(`</tbody></table><h2>明细</h2>`)
	for _, order := range orders {
		b.WriteString(`<div class="card"><strong>` + order.Person + `</strong><div style="margin-top:8px">`)
		for _, item := range order.Items { b.WriteString(`<div>` + item.Menu.Name + ` × ` + strconv.Itoa(item.Quantity) + ` ` + spicyLabels[item.SpicyLevel] + `</div>`) }
		if strings.TrimSpace(order.Remark) != "" { b.WriteString(`<div style="margin-top:8px;color:#666">备注：` + order.Remark + `</div>`) }
		b.WriteString(`</div></div>`)
	}
	b.WriteString(`</div></body></html>`)
	c.Header("Content-Type", "text/html; charset=utf-8")
	c.String(200, b.String())
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
	f := excelize.NewFile()
	sheet := "订单明细"
	f.SetSheetName("Sheet1", sheet)
	headers := []string{"姓名", "菜品", "数量", "辣度", "备注", "提交时间"}
	for i, htext := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheet, cell, htext)
	}
	spicyLabels := map[int]string{0: "不辣", 1: "微辣", 2: "中辣", 3: "重辣"}
	row := 2
	for _, order := range orders {
		if len(order.Items) == 0 {
			f.SetSheetRow(sheet, fmt.Sprintf("A%d", row), &[]any{order.Person, "", "", "", order.Remark, order.CreatedAt.Format("2006-01-02 15:04:05")})
			row++
			continue
		}
		for _, item := range order.Items {
			f.SetSheetRow(sheet, fmt.Sprintf("A%d", row), &[]any{order.Person, item.Menu.Name, item.Quantity, spicyLabels[item.SpicyLevel], order.Remark, order.CreatedAt.Format("2006-01-02 15:04:05")})
			row++
		}
	}
	f.SetColWidth(sheet, "A", "F", 18)
	c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="round_%d.xlsx"`, round.ID))
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
	c.Header("Content-Type", "text/csv; charset=utf-8")
	switch t {
	case "spicy":
		c.Header("Content-Disposition", `attachment; filename="template_spicy.csv"`)
		c.Data(200, "text/csv; charset=utf-8", []byte("\xEF\xBB\xBF餐品名,辣度\n"))
	case "plain":
		c.Header("Content-Disposition", `attachment; filename="template_plain.csv"`)
		c.Data(200, "text/csv; charset=utf-8", []byte("\xEF\xBB\xBF餐品名\n"))
	case "personnel":
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
				for _, v := range vs.Votes { if v.PizzaID == p.ID { count++ } }
				need := 0
				if p.Servings > 0 { need = int(math.Ceil(float64(count) / float64(p.Servings))) }
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
	type summaryItem struct { Name string; TotalBySpicy map[int]int; PersonsBySpicy map[int][]string; GrandTotal int }
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
	for k := range summary { keys = append(keys, k) }
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
			if count == 0 { continue }
			b.WriteString(`<div><strong>` + spicyLabels[level] + `</strong> ` + strconv.Itoa(count) + ` 份<ul>`)
			for _, p := range item.PersonsBySpicy[level] { b.WriteString(`<li>` + p + `</li>`) }
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
			if count == 0 { b.WriteString(`<td style="text-align:center;color:#ccc">-</td>`) } else { b.WriteString(`<td style="text-align:center">` + strconv.Itoa(count) + `</td>`) }
		}
		b.WriteString(`<td style="text-align:center;font-weight:bold">` + strconv.Itoa(item.GrandTotal) + `</td></tr>`)
	}
	b.WriteString(`</tbody></table>`)
	b.WriteString(`</div><script>function toggle(el){el.nextElementSibling.classList.toggle('open')}</script></body></html>`)
	c.Header("Content-Type", "text/html; charset=utf-8")
	c.String(200, b.String())
}

type csvMenu struct { name string; spicy int }

func parseCSV(content string) []csvMenu {
	r := csv.NewReader(strings.NewReader(content))
	records, _ := r.ReadAll()
	var result []csvMenu
	for i, row := range records {
		if i == 0 || len(row) < 1 { continue }
		name := strings.TrimSpace(row[0])
		if name == "" { continue }
		spicy := 0
		if len(row) > 1 {
			s := strings.TrimSpace(row[1])
			if s != "" { spicy, _ = strconv.Atoi(s) }
		}
		result = append(result, csvMenu{name: name, spicy: spicy})
	}
	return result
}
