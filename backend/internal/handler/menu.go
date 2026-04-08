package handler

import (
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
	content := strings.TrimPrefix(string(buf), "\xEF\xBB\xBF")
	importMenus := parseCSV(content)
	if len(importMenus) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "CSV无有效数据"})
		return
	}

	var roundID uint
	err = h.DB.Transaction(func(tx *gorm.DB) error {
		if err := deactivateAllRounds(tx); err != nil {
			return err
		}
		var deadline *time.Time
		deadlineText := strings.TrimSpace(c.PostForm("deadline_at"))
		if deadlineText != "" {
			if parsed, parseErr := time.Parse(time.RFC3339, deadlineText); parseErr == nil {
				deadline = &parsed
			}
		}
		round := model.ActivityRound{Mode: "order", Title: "点餐轮次", Active: true, DeadlineAt: deadline}
		if err := tx.Create(&round).Error; err != nil {
			return err
		}
		roundID = round.ID
		menus := make([]model.Menu, 0, len(importMenus))
		for _, m := range importMenus {
			menus = append(menus, model.Menu{RoundID: round.ID, Name: m.name, Spicy: m.spicy})
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
