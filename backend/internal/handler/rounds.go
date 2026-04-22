package handler

import (
	"time"

	"ordering-backend/internal/model"

	"gorm.io/gorm"
)

type roundSummary struct {
	ID         uint       `json:"id"`
	Mode       string     `json:"mode"`
	Title      string     `json:"title"`
	Active     bool       `json:"active"`
	CreatedAt  time.Time  `json:"created_at"`
	ClosedAt   *time.Time `json:"closed_at"`
	DeadlineAt *time.Time `json:"deadline_at"`
	Count      int64      `json:"count"`
}

type countRow struct {
	RoundID uint
	Count   int64
}

func loadRoundSummaries(db *gorm.DB, rounds []model.ActivityRound) ([]roundSummary, error) {
	if len(rounds) == 0 {
		return []roundSummary{}, nil
	}

	orderRoundIDs := make([]uint, 0)
	voteRoundIDs := make([]uint, 0)
	for _, r := range rounds {
		switch r.Mode {
		case "order":
			orderRoundIDs = append(orderRoundIDs, r.ID)
		case "vote":
			voteRoundIDs = append(voteRoundIDs, r.ID)
		}
	}

	countByRoundID := map[uint]int64{}

	if len(orderRoundIDs) > 0 {
		var rows []countRow
		if err := db.Model(&model.Order{}).
			Select("round_id, COUNT(*) as count").
			Where("round_id IN ?", orderRoundIDs).
			Group("round_id").
			Scan(&rows).Error; err != nil {
			return nil, err
		}
		for _, row := range rows {
			countByRoundID[row.RoundID] = row.Count
		}
	}

	if len(voteRoundIDs) > 0 {
		var rows []countRow
		if err := db.Table("votes").
			Select("vote_sessions.round_id as round_id, COUNT(DISTINCT votes.person) as count").
			Joins("JOIN vote_sessions ON vote_sessions.id = votes.vote_session_id").
			Where("vote_sessions.round_id IN ?", voteRoundIDs).
			Group("vote_sessions.round_id").
			Scan(&rows).Error; err != nil {
			return nil, err
		}
		for _, row := range rows {
			countByRoundID[row.RoundID] = row.Count
		}
	}

	result := make([]roundSummary, 0, len(rounds))
	for _, r := range rounds {
		result = append(result, roundSummary{
			ID:         r.ID,
			Mode:       r.Mode,
			Title:      r.Title,
			Active:     r.Active,
			CreatedAt:  r.CreatedAt,
			ClosedAt:   r.ClosedAt,
			DeadlineAt: r.DeadlineAt,
			Count:      countByRoundID[r.ID],
		})
	}

	return result, nil
}
