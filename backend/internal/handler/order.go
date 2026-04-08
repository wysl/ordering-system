package handler

import (
	"net/http"
	"strings"
	"time"

	"ordering-backend/internal/model"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type OrderHandler struct {
	DB *gorm.DB
}

func getActiveRound(db *gorm.DB, mode string) (*model.ActivityRound, error) {
	var round model.ActivityRound
	q := db.Where("active = ?", true)
	if mode != "" {
		q = q.Where("mode = ?", mode)
	}
	err := q.Order("id desc").First(&round).Error
	if err != nil {
		return nil, err
	}
	if round.DeadlineAt != nil && time.Now().After(*round.DeadlineAt) {
		now := time.Now()
		_ = db.Model(&model.ActivityRound{}).Where("id = ?", round.ID).Updates(map[string]any{"active": false, "closed_at": &now}).Error
		return nil, gorm.ErrRecordNotFound
	}
	return &round, nil
}

func deactivateAllRounds(tx *gorm.DB) error {
	now := time.Now()
	return tx.Model(&model.ActivityRound{}).Where("active = ?", true).Updates(map[string]any{
		"active":    false,
		"closed_at": &now,
	}).Error
}

// GET /api/home-state
func (h *OrderHandler) HomeState(c *gin.Context) {
	var active model.ActivityRound
	err := h.DB.Where("active = ?", true).Order("id desc").First(&active).Error
	if err == gorm.ErrRecordNotFound {
		c.JSON(http.StatusOK, gin.H{"mode": "idle"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询首页状态失败"})
		return
	}

	resp := gin.H{
		"mode":       active.Mode,
		"round_id":   active.ID,
		"title":      active.Title,
		"deadline_at": active.DeadlineAt,
	}
	if active.Mode == "order" {
		var menus []model.Menu
		h.DB.Where("round_id = ?", active.ID).Order("id asc").Find(&menus)
		resp["menu"] = menus
	} else if active.Mode == "vote" {
		var sessions []model.VoteSession
		h.DB.Where("round_id = ?", active.ID).Preload("Pizzas").Order("id asc").Find(&sessions)
		resp["votes"] = sessions
	}
	c.JSON(http.StatusOK, resp)
}

// POST /api/order
func (h *OrderHandler) Create(c *gin.Context) {
	var req struct {
		Person string `json:"person" binding:"required"`
		Remark string `json:"remark"`
		Items  []struct {
			MenuID     uint `json:"menu_id" binding:"required"`
			Quantity   int  `json:"quantity"`
			SpicyLevel int  `json:"spicy_level"`
		} `json:"items" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效请求数据"})
		return
	}

	var person model.Person
	if err := h.DB.Where("name = ?", req.Person).First(&person).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "该人员不在名单中"})
		return
	}

	round, err := getActiveRound(h.DB, "order")
	if err == gorm.ErrRecordNotFound {
		c.JSON(http.StatusBadRequest, gin.H{"error": "当前没有进行中的点餐轮次"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询轮次失败"})
		return
	}
	if round.DeadlineAt != nil && time.Now().After(*round.DeadlineAt) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "本轮点餐已截止"})
		return
	}

	var orderItems []model.OrderItem
	for _, item := range req.Items {
		if item.Quantity <= 0 {
			continue
		}
		var menu model.Menu
		if err := h.DB.Where("id = ? AND round_id = ?", item.MenuID, round.ID).First(&menu).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "菜品不存在或不属于当前轮次"})
			return
		}
		orderItems = append(orderItems, model.OrderItem{MenuID: item.MenuID, Quantity: item.Quantity, SpicyLevel: item.SpicyLevel})
	}
	if len(orderItems) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "至少选择一道菜品"})
		return
	}

	err = h.DB.Transaction(func(tx *gorm.DB) error {
		var oldOrder model.Order
		if err := tx.Where("round_id = ? AND person = ?", round.ID, req.Person).First(&oldOrder).Error; err == nil {
			if err := tx.Where("order_id = ?", oldOrder.ID).Delete(&model.OrderItem{}).Error; err != nil {
				return err
			}
			if err := tx.Delete(&oldOrder).Error; err != nil {
				return err
			}
		}
		order := model.Order{RoundID: round.ID, Person: req.Person, Remark: strings.TrimSpace(req.Remark), Items: orderItems}
		return tx.Create(&order).Error
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "订单创建失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"person": req.Person, "round_id": round.ID})
}

// GET /api/order/mine?person=xxx
func (h *OrderHandler) GetMine(c *gin.Context) {
	person := c.Query("person")
	if person == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供 person 参数"})
		return
	}
	round, err := getActiveRound(h.DB, "order")
	if err == gorm.ErrRecordNotFound {
		c.JSON(http.StatusOK, gin.H{})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败"})
		return
	}
	var order model.Order
	err = h.DB.Where("round_id = ? AND person = ?", round.ID, person).Preload("Items").Preload("Items.Menu").First(&order).Error
	if err == gorm.ErrRecordNotFound {
		c.JSON(http.StatusOK, gin.H{})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败"})
		return
	}
	c.JSON(http.StatusOK, order)
}
