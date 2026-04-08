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

func deactivateRoundsByMode(tx *gorm.DB, mode string) error {
	now := time.Now()
	q := tx.Model(&model.ActivityRound{}).Where("active = ?", true)
	if mode != "" {
		q = q.Where("mode = ?", mode)
	}
	return q.Updates(map[string]any{"active": false, "closed_at": &now}).Error
}

// GET /api/home-state
func (h *OrderHandler) HomeState(c *gin.Context) {
	orderRound, _ := getActiveRound(h.DB, "order")
	voteRound, _ := getActiveRound(h.DB, "vote")

	if orderRound == nil && voteRound == nil {
		c.JSON(http.StatusOK, gin.H{"mode": "idle"})
		return
	}

	resp := gin.H{}
	titles := []string{}
	modes := []string{}

	if orderRound != nil {
		var menus []model.Menu
		h.DB.Where("round_id = ?", orderRound.ID).Order("id asc").Find(&menus)
		resp["order"] = gin.H{
			"round_id":    orderRound.ID,
			"title":       orderRound.Title,
			"deadline_at": orderRound.DeadlineAt,
			"menu":        menus,
		}
		titles = append(titles, orderRound.Title)
		modes = append(modes, "点餐")
	}

	if voteRound != nil {
		var sessions []model.VoteSession
		h.DB.Where("round_id = ?", voteRound.ID).Preload("Pizzas").Order("id asc").Find(&sessions)
		resp["vote"] = gin.H{
			"round_id":    voteRound.ID,
			"title":       voteRound.Title,
			"deadline_at": voteRound.DeadlineAt,
			"votes":       sessions,
		}
		titles = append(titles, voteRound.Title)
		modes = append(modes, "投票")
	}

	resp["title"] = strings.Join(titles, " & ")
	resp["mode"] = "进行中 · " + strings.Join(modes, " & ")
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "当前没有进行中的点餐"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询活动失败"})
		return
	}

	var orderItems []model.OrderItem
	for _, item := range req.Items {
		if item.Quantity <= 0 {
			continue
		}
		var menu model.Menu
		if err := h.DB.Where("id = ? AND round_id = ?", item.MenuID, round.ID).First(&menu).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "菜品不存在或不属于当前点餐"})
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
			if err := tx.Where("order_id = ?", oldOrder.ID).Delete(&model.OrderItem{}).Error; err != nil { return err }
			if err := tx.Delete(&oldOrder).Error; err != nil { return err }
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
