package handler

import (
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"ordering-backend/internal/model"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type VoteHandler struct {
	DB *gorm.DB
}

// CreateVoteSession POST /api/admin/vote
func (h *VoteHandler) CreateVoteSession(c *gin.Context) {
	var req struct {
		Title      string `json:"title" binding:"required"`
		DeadlineAt string `json:"deadline_at"`
		Pizzas []struct {
			Name     string `json:"name" binding:"required"`
			Servings int    `json:"servings" binding:"required"`
		} `json:"pizzas" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效请求"})
		return
	}
	var roundID uint
	err := h.DB.Transaction(func(tx *gorm.DB) error {
		if err := deactivateRoundsByMode(tx, "vote"); err != nil {
			return err
		}
		var deadline *time.Time
		if strings.TrimSpace(req.DeadlineAt) != "" {
			if parsed, parseErr := time.Parse(time.RFC3339, req.DeadlineAt); parseErr == nil {
				deadline = &parsed
			}
		}
		round := model.ActivityRound{Mode: "vote", Title: req.Title, Active: true, DeadlineAt: deadline}
		if err := tx.Create(&round).Error; err != nil {
			return err
		}
		roundID = round.ID
		session := model.VoteSession{RoundID: round.ID, Title: req.Title}
		for _, p := range req.Pizzas {
			session.Pizzas = append(session.Pizzas, model.VotePizza{Name: p.Name, Servings: p.Servings})
		}
		return tx.Create(&session).Error
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建失败: " + err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"round_id": roundID})
}

// DeleteVoteSession DELETE /api/admin/vote/:id
func (h *VoteHandler) DeleteVoteSession(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效ID"})
		return
	}
	var session model.VoteSession
	if err := h.DB.First(&session, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "投票不存在"})
		return
	}
	err = h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("vote_session_id = ?", id).Delete(&model.Vote{}).Error; err != nil {
			return err
		}
		if err := tx.Where("vote_session_id = ?", id).Delete(&model.VotePizza{}).Error; err != nil {
			return err
		}
		if err := tx.Delete(&model.VoteSession{}, id).Error; err != nil {
			return err
		}
		var count int64
		tx.Model(&model.VoteSession{}).Where("round_id = ?", session.RoundID).Count(&count)
		if count == 0 {
			now := gin.H{"active": false}
			return tx.Model(&model.ActivityRound{}).Where("id = ?", session.RoundID).Updates(now).Error
		}
		return nil
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

// ListVoteSessions GET /api/admin/votes
func (h *VoteHandler) ListVoteSessions(c *gin.Context) {
	var round model.ActivityRound
	err := h.DB.Where("active = ? AND mode = ?", true, "vote").Order("id desc").First(&round).Error
	if err == gorm.ErrRecordNotFound {
		c.JSON(http.StatusOK, []any{})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询投票失败"})
		return
	}
	var sessions []model.VoteSession
	h.DB.Where("round_id = ?", round.ID).Preload("Pizzas").Preload("Votes.Pizza").Find(&sessions)

	type pizzaStat struct {
		model.VotePizza
		VoteCount   int      `json:"vote_count"`
		NeedToOrder int      `json:"need_to_order"`
		Voters      []string `json:"voters"`
	}
	type sessionResult struct {
		model.VoteSession
		TotalVoters int         `json:"total_voters"`
		PizzaStats  []pizzaStat `json:"pizza_stats"`
	}
	results := make([]sessionResult, 0, len(sessions))
	for _, s := range sessions {
		sr := sessionResult{VoteSession: s}
		voterSet := map[string]struct{}{}
		for _, p := range s.Pizzas {
			ps := pizzaStat{VotePizza: p}
			for _, v := range s.Votes {
				if v.PizzaID == p.ID {
					ps.VoteCount++
					ps.Voters = append(ps.Voters, v.Person)
					voterSet[v.Person] = struct{}{}
				}
			}
			if p.Servings > 0 {
				ps.NeedToOrder = int(math.Ceil(float64(ps.VoteCount) / float64(p.Servings)))
			}
			sr.PizzaStats = append(sr.PizzaStats, ps)
		}
		sr.TotalVoters = len(voterSet)
		results = append(results, sr)
	}
	c.JSON(http.StatusOK, results)
}

// ListPublicVotes GET /api/votes
func (h *VoteHandler) ListPublicVotes(c *gin.Context) {
	round, err := getActiveRound(h.DB, "vote")
	if err == gorm.ErrRecordNotFound {
		c.JSON(http.StatusOK, []any{})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询投票失败"})
		return
	}
	var sessions []model.VoteSession
	h.DB.Where("round_id = ?", round.ID).Preload("Pizzas").Order("id asc").Find(&sessions)
	c.JSON(http.StatusOK, sessions)
}

// CastVote POST /api/vote
func (h *VoteHandler) CastVote(c *gin.Context) {
	var req struct {
		VoteSessionID uint   `json:"vote_session_id" binding:"required"`
		Person        string `json:"person" binding:"required"`
		PizzaID       uint   `json:"pizza_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效请求"})
		return
	}
	var person model.Person
	if err := h.DB.Where("name = ?", req.Person).First(&person).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "该人员不在名单中"})
		return
	}
	var session model.VoteSession
	if err := h.DB.Preload("Pizzas").First(&session, req.VoteSessionID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "投票不存在"})
		return
	}
	round, err := getActiveRound(h.DB, "vote")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "当前没有进行中的投票轮次"})
		return
	}
	if round.DeadlineAt != nil && time.Now().After(*round.DeadlineAt) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "本轮投票已截止"})
		return
	}
	var pizza model.VotePizza
	if err := h.DB.Where("id = ? AND vote_session_id = ?", req.PizzaID, req.VoteSessionID).First(&pizza).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "披萨选项不存在"})
		return
	}
	vote := model.Vote{VoteSessionID: req.VoteSessionID, Person: req.Person, PizzaID: req.PizzaID}
	if err := h.DB.Create(&vote).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "你已经投过票了"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "投票成功"})
}

// GetVoteResult GET /api/vote/:id/result
func (h *VoteHandler) GetVoteResult(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效ID"})
		return
	}
	var session model.VoteSession
	if err := h.DB.Preload("Pizzas").Preload("Votes.Pizza").First(&session, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "投票不存在"})
		return
	}
	type pizzaResult struct {
		model.VotePizza
		VoteCount   int      `json:"vote_count"`
		NeedToOrder int      `json:"need_to_order"`
		Voters      []string `json:"voters"`
	}
	voterSet := map[string]struct{}{}
	pizzaResults := make([]pizzaResult, 0, len(session.Pizzas))
	for _, p := range session.Pizzas {
		pr := pizzaResult{VotePizza: p}
		for _, v := range session.Votes {
			if v.PizzaID == p.ID {
				pr.VoteCount++
				pr.Voters = append(pr.Voters, v.Person)
				voterSet[v.Person] = struct{}{}
			}
		}
		if p.Servings > 0 {
			pr.NeedToOrder = int(math.Ceil(float64(pr.VoteCount) / float64(p.Servings)))
		}
		pizzaResults = append(pizzaResults, pr)
	}
	c.JSON(http.StatusOK, gin.H{"id": session.ID, "title": session.Title, "created_at": session.CreatedAt, "total_voters": len(voterSet), "pizza_results": pizzaResults})
}
