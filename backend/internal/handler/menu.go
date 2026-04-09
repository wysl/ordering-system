package handler

import (
	"encoding/csv"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"ordering-backend/internal/model"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type MenuHandler struct {
	DB *gorm.DB
}

type csvMenu struct {
	name          string
	spicy_options string
}

// parseSpicyOptions converts "1-3" to "1,2,3" or "2" to "2" or "" to ""
func parseSpicyOptions(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "" // no spicy
	}
	if strings.Contains(s, "-") {
		// Range format "1-3" → "1,2,3"
		parts := strings.Split(s, "-")
		if len(parts) != 2 {
			return ""
		}
		start, err1 := strconv.Atoi(strings.TrimSpace(parts[0]))
		end, err2 := strconv.Atoi(strings.TrimSpace(parts[1]))
		if err1 != nil || err2 != nil || start > end || start < 0 || end > 3 {
			return ""
		}
		var opts []string
		for i := start; i <= end; i++ {
			opts = append(opts, strconv.Itoa(i))
		}
		return strings.Join(opts, ",")
	}
	// Single value "2" → "2"
	v, err := strconv.Atoi(s)
	if err != nil || v < 0 || v > 3 {
		return ""
	}
	return strconv.Itoa(v)
}

func parseMenuImport(content string) (string, []csvMenu) {
	r := csv.NewReader(strings.NewReader(content))
	r.FieldsPerRecord = -1
	records, _ := r.ReadAll()
	if len(records) == 0 { return "点餐", nil }
	title := strings.TrimSpace(records[0][0])
	start := 1
	if len(records) > 1 && strings.Contains(strings.Join(records[1], ","), "餐品") {
		start = 2
	} else if strings.Contains(strings.Join(records[0], ","), "餐品") {
		title = "点餐"
		start = 1
	}
	var result []csvMenu
	for i := start; i < len(records); i++ {
		row := records[i]
		if len(row) < 1 { continue }
		name := strings.TrimSpace(row[0])
		if name == "" { continue }
		spicyOpts := ""
		if len(row) > 1 {
			spicyOpts = parseSpicyOptions(row[1])
		}
		result = append(result, csvMenu{name: name, spicy_options: spicyOpts})
	}
	if title == "" { title = "点餐" }
	return title, result
}


// GET /api/menu
func (h *MenuHandler) ListPublic(c *gin.Context) {
	round, err := getActiveRound(h.DB, "order")
	if err == gorm.ErrRecordNotFound {
		c.JSON(http.StatusOK, []model.Menu{})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询菜品失败"})
		return
	}
	var menus []model.Menu
	h.DB.Where("round_id = ?", round.ID).Order("id asc").Find(&menus)
	c.JSON(http.StatusOK, menus)
}

// GET /api/admin/menu
func (h *MenuHandler) ListAdmin(c *gin.Context) {
	round, err := getActiveRound(h.DB, "order")
	if err == gorm.ErrRecordNotFound {
		c.JSON(http.StatusOK, []model.Menu{})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询菜品失败"})
		return
	}
	var menus []model.Menu
	h.DB.Where("round_id = ?", round.ID).Order("id asc").Find(&menus)
	c.JSON(http.StatusOK, menus)
}

// POST /api/admin/menu/import
func (h *MenuHandler) Import(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请上传CSV文件"})
		return
	}
	f, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "文件读取失败"})
		return
	}
	defer f.Close()
	buf, err := io.ReadAll(f)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "文件读取失败"})
		return
	}
	content := decodeCSVContent(buf)
	roundTitle, importMenus := parseMenuImport(content)
	if len(importMenus) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "CSV无有效数据"})
		return
	}

	var roundID uint
	err = h.DB.Transaction(func(tx *gorm.DB) error {
		if err := deactivateRoundsByMode(tx, "order"); err != nil {
			return err
		}
		var deadline *time.Time
		deadlineText := strings.TrimSpace(c.PostForm("deadline_at"))
		if deadlineText != "" {
			if parsed, parseErr := time.Parse(time.RFC3339, deadlineText); parseErr == nil {
				deadline = &parsed
			}
		}
		round := model.ActivityRound{Mode: "order", Title: roundTitle, Active: true, DeadlineAt: deadline}
		if err := tx.Create(&round).Error; err != nil {
			return err
		}
		roundID = round.ID
		menus := make([]model.Menu, 0, len(importMenus))
		for _, m := range importMenus {
			menus = append(menus, model.Menu{RoundID: round.ID, Name: m.name, SpicyOptions: m.spicy_options})
		}
		return tx.Create(&menus).Error
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "导入失败: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"imported": len(importMenus), "round_id": roundID})
}

// DELETE /api/admin/menu/:id
func (h *MenuHandler) Delete(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效ID"})
		return
	}
	var menu model.Menu
	if err := h.DB.First(&menu, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "菜品不存在"})
		return
	}
	h.DB.Where("menu_id = ?", id).Delete(&model.OrderItem{})
	h.DB.Delete(&model.Menu{}, id)
	c.JSON(http.StatusOK, gin.H{"deleted": true})
}
