package handler

import (
	"bytes"
	"encoding/csv"
	"io"
	"net/http"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"ordering-backend/internal/model"

	"github.com/gin-gonic/gin"
	"github.com/xuri/excelize/v2"
	"gorm.io/gorm"
)

type MenuHandler struct {
	DB *gorm.DB
}

type csvMenu struct {
	name          string
	spicy_options string
	spicy         int
}

func normalizeMenuSpicy(menu *model.Menu) {
	if menu == nil {
		return
	}
	if menu.SpicyOptions == "" && menu.Spicy > 0 {
		menu.SpicyOptions = strconv.Itoa(menu.Spicy)
	}
}

func spicyOptionsToLegacyValue(spicyOptions string) int {
	if spicyOptions == "" || strings.Contains(spicyOptions, ",") {
		return 0
	}
	v, err := strconv.Atoi(spicyOptions)
	if err != nil || v < 1 || v > 3 {
		return 0
	}
	return v
}

func parseSpicyToken(token string) (int, bool) {
	normalized := strings.TrimSpace(token)
	normalized = strings.NewReplacer("（", "", "）", "", "(", "", ")", "", "级", "", "档", "", "度", "", "辣", "").Replace(normalized)
	if normalized == "" {
		switch strings.TrimSpace(token) {
		case "不辣", "无辣", "不吃辣", "清淡", "免辣":
			return 0, true
		case "微辣":
			return 1, true
		case "中辣":
			return 2, true
		case "重辣", "特辣", "超辣":
			return 3, true
		}
	}
	switch normalized {
	case "不", "无", "不吃", "清淡", "免":
		return 0, true
	case "微":
		return 1, true
	case "中":
		return 2, true
	case "重", "特", "超":
		return 3, true
	}
	v, err := strconv.Atoi(normalized)
	if err != nil || v < 0 || v > 3 {
		return 0, false
	}
	return v, true
}

func normalizeSpicyLevels(levels []int) string {
	if len(levels) == 0 {
		return ""
	}
	uniq := make(map[int]struct{}, len(levels))
	filtered := make([]int, 0, len(levels))
	for _, level := range levels {
		if level <= 0 || level > 3 {
			continue
		}
		if _, ok := uniq[level]; ok {
			continue
		}
		uniq[level] = struct{}{}
		filtered = append(filtered, level)
	}
	if len(filtered) == 0 {
		return ""
	}
	sort.Ints(filtered)
	parts := make([]string, 0, len(filtered))
	for _, level := range filtered {
		parts = append(parts, strconv.Itoa(level))
	}
	return strings.Join(parts, ",")
}

// parseSpicyOptions converts legacy and localized spicy input into canonical csv values.
func parseSpicyOptions(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "" // no spicy
	}

	rangeSeparators := strings.NewReplacer("—", "-", "–", "-", "～", "-", "~", "-", "至", "-")
	s = strings.TrimSpace(rangeSeparators.Replace(s))
	if strings.Contains(s, "-") {
		parts := strings.Split(s, "-")
		if len(parts) == 2 {
			start, ok1 := parseSpicyToken(parts[0])
			end, ok2 := parseSpicyToken(parts[1])
			if ok1 && ok2 && start <= end {
				levels := make([]int, 0, end-start+1)
				for i := start; i <= end; i++ {
					levels = append(levels, i)
				}
				return normalizeSpicyLevels(levels)
			}
		}
	}

	listSeparators := strings.NewReplacer("/", ",", "、", ",", "，", ",", "；", ",", ";", ",", "|", ",")
	parts := strings.Split(listSeparators.Replace(s), ",")
	if len(parts) > 1 {
		levels := make([]int, 0, len(parts))
		for _, part := range parts {
			level, ok := parseSpicyToken(part)
			if !ok {
				return ""
			}
			levels = append(levels, level)
		}
		return normalizeSpicyLevels(levels)
	}

	level, ok := parseSpicyToken(s)
	if !ok || level == 0 {
		return ""
	}
	return strconv.Itoa(level)
}

func normalizeMenuHeaderCell(s string) string {
	return strings.TrimSpace(strings.NewReplacer(" ", "", "　", "").Replace(s))
}

func isMenuHeaderRow(row []string) bool {
	if len(row) == 0 {
		return false
	}
	first := normalizeMenuHeaderCell(row[0])
	if first == "" {
		return false
	}
	second := ""
	if len(row) > 1 {
		second = normalizeMenuHeaderCell(row[1])
	}
	switch first {
	case "餐品", "餐品名", "店名", "菜品", "菜名", "名称":
		return true
	}
	if strings.Contains(first, "餐品") || strings.Contains(first, "菜品") || strings.Contains(first, "菜名") {
		return true
	}
	return second != "" && strings.Contains(second, "辣度")
}

func isMenuTitleRow(row []string) bool {
	if len(row) == 0 || isMenuHeaderRow(row) {
		return false
	}
	if strings.TrimSpace(row[0]) == "" {
		return false
	}
	if len(row) == 1 {
		return true
	}
	if strings.TrimSpace(row[1]) != "" {
		return false
	}
	for _, cell := range row[2:] {
		if strings.TrimSpace(cell) != "" {
			return true
		}
	}
	return false
}

func parseMenuRows(records [][]string) (string, []csvMenu) {
	if len(records) == 0 {
		return "点餐", nil
	}
	title := "点餐"
	start := 0
	if isMenuTitleRow(records[0]) {
		title = strings.TrimSpace(records[0][0])
		start = 1
	}
	var result []csvMenu
	for i := start; i < len(records); i++ {
		row := records[i]
		if len(row) < 1 || isMenuHeaderRow(row) {
			continue
		}
		name := strings.TrimSpace(row[0])
		if name == "" {
			continue
		}
		spicyOpts := ""
		if len(row) > 1 {
			spicyOpts = parseSpicyOptions(row[1])
		}
		result = append(result, csvMenu{name: name, spicy_options: spicyOpts, spicy: spicyOptionsToLegacyValue(spicyOpts)})
	}
	if title == "" {
		title = "点餐"
	}
	return title, result
}

func parseMenuImport(content string) (string, []csvMenu) {
	r := csv.NewReader(strings.NewReader(content))
	r.FieldsPerRecord = -1
	records, _ := r.ReadAll()
	return parseMenuRows(records)
}

func parseMenuImportXLSX(buf []byte) (string, []csvMenu, error) {
	f, err := excelize.OpenReader(bytes.NewReader(buf))
	if err != nil {
		return "", nil, err
	}
	defer func() { _ = f.Close() }()
	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		return "点餐", nil, nil
	}
	records, err := f.GetRows(sheets[0])
	if err != nil {
		return "", nil, err
	}
	parsedTitle, parsedMenus := parseMenuRows(records)
	return parsedTitle, parsedMenus, nil
}

func parseMenuImportFile(filename string, buf []byte) (string, []csvMenu, error) {
	if strings.EqualFold(filepath.Ext(filename), ".xlsx") {
		return parseMenuImportXLSX(buf)
	}
	parsedTitle, parsedMenus := parseMenuImport(decodeCSVContent(buf))
	return parsedTitle, parsedMenus, nil
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
	for i := range menus {
		normalizeMenuSpicy(&menus[i])
	}
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
	for i := range menus {
		normalizeMenuSpicy(&menus[i])
	}
	c.JSON(http.StatusOK, menus)
}

// POST /api/admin/menu/import
func (h *MenuHandler) Import(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请上传CSV/XLSX文件"})
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
	roundTitle, importMenus, err := parseMenuImportFile(file.Filename, buf)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "文件解析失败"})
		return
	}
	if len(importMenus) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "文件无有效数据"})
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
			menus = append(menus, model.Menu{RoundID: round.ID, Name: m.name, SpicyOptions: m.spicy_options, Spicy: m.spicy})
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
