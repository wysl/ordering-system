package handler

import (
	"testing"
	"time"

	"ordering-backend/internal/model"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupRoundsTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(
		&model.ActivityRound{},
		&model.Menu{},
		&model.Order{},
		&model.OrderItem{},
		&model.VoteSession{},
		&model.VotePizza{},
		&model.Vote{},
		&model.Person{},
	); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return db
}

func TestLoadRoundSummaries(t *testing.T) {
	db := setupRoundsTestDB(t)
	now := time.Now()

	orderRound := model.ActivityRound{Mode: "order", Title: "午饭", Active: false, CreatedAt: now.Add(-2 * time.Hour)}
	voteRound := model.ActivityRound{Mode: "vote", Title: "披萨", Active: false, CreatedAt: now.Add(-1 * time.Hour)}
	idleRound := model.ActivityRound{Mode: "order", Title: "空轮次", Active: false, CreatedAt: now}

	for _, round := range []*model.ActivityRound{&orderRound, &voteRound, &idleRound} {
		if err := db.Create(round).Error; err != nil {
			t.Fatalf("create round: %v", err)
		}
	}

	orders := []model.Order{
		{RoundID: orderRound.ID, Person: "A"},
		{RoundID: orderRound.ID, Person: "B"},
	}
	for _, order := range orders {
		if err := db.Create(&order).Error; err != nil {
			t.Fatalf("create order: %v", err)
		}
	}

	voteSession := model.VoteSession{RoundID: voteRound.ID, Title: "今晚吃啥"}
	if err := db.Create(&voteSession).Error; err != nil {
		t.Fatalf("create vote session: %v", err)
	}
	pizzas := []model.VotePizza{
		{VoteSessionID: voteSession.ID, Name: "玛格丽特", Servings: 4},
		{VoteSessionID: voteSession.ID, Name: "海鲜", Servings: 4},
	}
	for _, pizza := range pizzas {
		if err := db.Create(&pizza).Error; err != nil {
			t.Fatalf("create pizza: %v", err)
		}
	}
	votes := []model.Vote{
		{VoteSessionID: voteSession.ID, Person: "A", PizzaID: pizzas[0].ID},
		{VoteSessionID: voteSession.ID, Person: "B", PizzaID: pizzas[1].ID},
		{VoteSessionID: voteSession.ID, Person: "C", PizzaID: pizzas[0].ID},
	}
	for _, vote := range votes {
		if err := db.Create(&vote).Error; err != nil {
			t.Fatalf("create vote: %v", err)
		}
	}

	rounds := []model.ActivityRound{orderRound, voteRound, idleRound}
	summaries, err := loadRoundSummaries(db, rounds)
	if err != nil {
		t.Fatalf("loadRoundSummaries: %v", err)
	}
	if len(summaries) != 3 {
		t.Fatalf("unexpected summary length: %d", len(summaries))
	}

	got := map[uint]int64{}
	for _, item := range summaries {
		got[item.ID] = item.Count
	}

	if got[orderRound.ID] != 2 {
		t.Fatalf("order round count = %d, want 2", got[orderRound.ID])
	}
	if got[voteRound.ID] != 3 {
		t.Fatalf("vote round count = %d, want 3 distinct persons", got[voteRound.ID])
	}
	if got[idleRound.ID] != 0 {
		t.Fatalf("idle round count = %d, want 0", got[idleRound.ID])
	}
}
