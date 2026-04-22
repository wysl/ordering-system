package handler

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"ordering-backend/internal/model"

	"github.com/gin-gonic/gin"
	"github.com/xuri/excelize/v2"
	"gorm.io/gorm"
)

func (h *AdminHandler) ListActivityLogs(c *gin.Context) {
	logType := strings.TrimSpace(c.Query("type"))
	roundID := strings.TrimSpace(c.Query("round_id"))
	q := h.DB.Model(&model.ActivityLog{})
	if logType != "" {
		q = q.Where("type = ?", logType)
	}
	if roundID != "" {
		if id, err := strconv.Atoi(roundID); err == nil && id > 0 {
			q = q.Where("round_id = ?", id)
		}
	}
	var logs []model.ActivityLog
	q.Order("id desc").Limit(50).Find(&logs)
	c.JSON(200, logs)
}

func (h *AdminHandler) ListTrashRounds(c *gin.Context) {
	var rounds []model.ActivityRound
	h.DB.Where("deleted_at IS NOT NULL").Order("deleted_at desc").Limit(30).Find(&rounds)
	c.JSON(200, rounds)
}

func (h *AdminHandler) RestoreRound(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(400, gin.H{"error": "无效轮次ID"})
		return
	}
	if err := h.DB.Model(&model.ActivityRound{}).Where("id = ?", id).Update("deleted_at", nil).Error; err != nil {
		c.JSON(500, gin.H{"error": "恢复失败"})
		return
	}
	h.DB.Create(&model.ActivityLog{Type: "round_restored", Message: fmt.Sprintf("轮次 #%d 已从回收站恢复", id), RoundID: uint(id)})
	c.JSON(200, gin.H{"restored": true})
}

func (h *AdminHandler) PurgeRound(c *gin.Context) {
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
	if round.DeletedAt == nil {
		c.JSON(400, gin.H{"error": "仅可永久删除回收站中的轮次"})
		return
	}
	if err := h.DB.Transaction(func(tx *gorm.DB) error {
		if round.Mode == "order" {
			var orderIDs []uint
			if err := tx.Model(&model.Order{}).Where("round_id = ?", round.ID).Pluck("id", &orderIDs).Error; err != nil { return err }
			if len(orderIDs) > 0 { if err := tx.Where("order_id IN ?", orderIDs).Delete(&model.OrderItem{}).Error; err != nil { return err } }
			if err := tx.Where("round_id = ?", round.ID).Delete(&model.Order{}).Error; err != nil { return err }
			if err := tx.Where("round_id = ?", round.ID).Delete(&model.Menu{}).Error; err != nil { return err }
		} else {
			var sessionIDs []uint
			if err := tx.Model(&model.VoteSession{}).Where("round_id = ?", round.ID).Pluck("id", &sessionIDs).Error; err != nil { return err }
			if len(sessionIDs) > 0 {
				if err := tx.Where("vote_session_id IN ?", sessionIDs).Delete(&model.Vote{}).Error; err != nil { return err }
				if err := tx.Where("vote_session_id IN ?", sessionIDs).Delete(&model.VotePizza{}).Error; err != nil { return err }
			}
			if err := tx.Where("round_id = ?", round.ID).Delete(&model.VoteSession{}).Error; err != nil { return err }
		}
		if err := tx.Delete(&model.ActivityRound{}, round.ID).Error; err != nil { return err }
		return nil
	}); err != nil {
		c.JSON(500, gin.H{"error": "永久删除失败"})
		return
	}
	h.DB.Create(&model.ActivityLog{Type: "round_purged", Message: fmt.Sprintf("轮次 #%d 已永久删除", id), RoundID: uint(id)})
	c.JSON(200, gin.H{"purged": true})
}

func (h *AdminHandler) EmptyTrash(c *gin.Context) {
	var rounds []model.ActivityRound
	h.DB.Where("deleted_at IS NOT NULL").Find(&rounds)
	purged := 0
	for _, round := range rounds {
		if err := h.DB.Transaction(func(tx *gorm.DB) error {
			if round.Mode == "order" {
				var orderIDs []uint
				if err := tx.Model(&model.Order{}).Where("round_id = ?", round.ID).Pluck("id", &orderIDs).Error; err != nil { return err }
				if len(orderIDs) > 0 { if err := tx.Where("order_id IN ?", orderIDs).Delete(&model.OrderItem{}).Error; err != nil { return err } }
				if err := tx.Where("round_id = ?", round.ID).Delete(&model.Order{}).Error; err != nil { return err }
				if err := tx.Where("round_id = ?", round.ID).Delete(&model.Menu{}).Error; err != nil { return err }
			} else {
				var sessionIDs []uint
				if err := tx.Model(&model.VoteSession{}).Where("round_id = ?", round.ID).Pluck("id", &sessionIDs).Error; err != nil { return err }
				if len(sessionIDs) > 0 {
					if err := tx.Where("vote_session_id IN ?", sessionIDs).Delete(&model.Vote{}).Error; err != nil { return err }
					if err := tx.Where("vote_session_id IN ?", sessionIDs).Delete(&model.VotePizza{}).Error; err != nil { return err }
				}
				if err := tx.Where("round_id = ?", round.ID).Delete(&model.VoteSession{}).Error; err != nil { return err }
			}
			return tx.Delete(&model.ActivityRound{}, round.ID).Error
		}); err == nil {
			purged++
		}
	}
	h.DB.Create(&model.ActivityLog{Type: "trash_emptied", Message: fmt.Sprintf("回收站已清空，共永久删除 %d 个轮次", purged)})
	c.JSON(200, gin.H{"emptied": purged})
}

func (h *AdminHandler) ExportRoundsBatchXLSX(c *gin.Context) {
	idsText := strings.TrimSpace(c.Query("ids"))
	if idsText == "" {
		c.JSON(400, gin.H{"error": "缺少轮次IDs"})
		return
	}
	parts := strings.Split(idsText, ",")
	ids := make([]uint, 0, len(parts))
	for _, p := range parts {
		id, err := strconv.Atoi(strings.TrimSpace(p))
		if err == nil && id > 0 {
			ids = append(ids, uint(id))
		}
	}
	if len(ids) == 0 {
		c.JSON(400, gin.H{"error": "无有效轮次IDs"})
		return
	}
	var rounds []model.ActivityRound
	if err := h.DB.Where("id IN ?", ids).Order("id desc").Find(&rounds).Error; err != nil {
		c.JSON(500, gin.H{"error": "查询轮次失败"})
		return
	}
	f := excelize.NewFile()
	index := f.GetActiveSheetIndex()
	f.SetSheetName(f.GetSheetName(index), "汇总")
	f.SetCellValue("汇总", "A1", "批量导出轮次")
	f.SetCellValue("汇总", "A2", "轮次ID")
	f.SetCellValue("汇总", "B2", "模式")
	f.SetCellValue("汇总", "C2", "标题")
	f.SetCellValue("汇总", "D2", "创建时间")
	for i, round := range rounds {
		row := i + 3
		f.SetCellValue("汇总", fmt.Sprintf("A%d", row), round.ID)
		f.SetCellValue("汇总", fmt.Sprintf("B%d", row), round.Mode)
		f.SetCellValue("汇总", fmt.Sprintf("C%d", row), round.Title)
		f.SetCellValue("汇总", fmt.Sprintf("D%d", row), round.CreatedAt.Format("2006-01-02 15:04:05"))
	}
	buf, err := f.WriteToBuffer()
	if err != nil {
		c.JSON(500, gin.H{"error": "导出失败"})
		return
	}
	filename := fmt.Sprintf("rounds_batch_%s.xlsx", time.Now().Format("20060102_150405"))
	c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Header("Content-Disposition", contentDispositionAttachment(filename))
	c.Data(200, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buf.Bytes())
}
