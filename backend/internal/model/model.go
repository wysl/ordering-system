package model

import "time"

type ActivityRound struct {
	ID          uint       `gorm:"primarykey" json:"id"`
	Mode        string     `gorm:"not null;index" json:"mode"`
	Title       string     `json:"title"`
	DeadlineAt  *time.Time `json:"deadline_at"`
	Active      bool       `gorm:"not null;default:false;index" json:"active"`
	DeletedAt   *time.Time `gorm:"index" json:"deleted_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	ClosedAt    *time.Time `json:"closed_at"`
	Menus        []Menu        `gorm:"foreignKey:RoundID" json:"menus,omitempty"`
	Orders       []Order       `gorm:"foreignKey:RoundID" json:"orders,omitempty"`
	VoteSessions []VoteSession `gorm:"foreignKey:RoundID" json:"vote_sessions,omitempty"`
}

type ActivityLog struct {
	ID        uint      `gorm:"primarykey" json:"id"`
	Type      string    `gorm:"index" json:"type"`
	Message   string    `json:"message"`
	RoundID   uint      `gorm:"index" json:"round_id"`
	CreatedAt time.Time `json:"created_at"`
}

type Menu struct {
	ID           uint   `gorm:"primarykey" json:"id"`
	RoundID      uint   `gorm:"not null;index" json:"round_id"`
	Name         string `gorm:"not null" json:"name"`
	Spicy        int    `gorm:"default:0" json:"spicy"`              // deprecated, kept for backward compatibility
	SpicyOptions string `gorm:"default:\"\"" json:"spicy_options"`   // ""=no spicy, "2"=single, "1,2,3"=multiple
}

type Person struct {
	ID          uint   `gorm:"primarykey" json:"id"`
	Name        string `gorm:"uniqueIndex;not null" json:"name"`
	OrderExcused bool   `gorm:"default:false" json:"order_excused"`
	VoteExcused  bool   `gorm:"default:false" json:"vote_excused"`
}

type Order struct {
	ID        uint        `gorm:"primarykey" json:"id"`
	RoundID   uint        `gorm:"not null;index;uniqueIndex:idx_round_person" json:"round_id"`
	Person    string      `gorm:"not null;uniqueIndex:idx_round_person" json:"person"`
	Remark    string      `json:"remark"`
	CreatedAt time.Time   `json:"created_at"`
	Items     []OrderItem `gorm:"foreignKey:OrderID" json:"items"`
}

type OrderItem struct {
	ID         uint `gorm:"primarykey" json:"id"`
	OrderID    uint `gorm:"not null;index" json:"order_id"`
	MenuID     uint `gorm:"not null;index" json:"menu_id"`
	Quantity   int  `gorm:"not null" json:"quantity"`
	SpicyLevel int  `gorm:"default:0" json:"spicy_level"`
	Menu       Menu `gorm:"foreignKey:MenuID" json:"menu"`
}

type VoteSession struct {
	ID        uint        `gorm:"primarykey" json:"id"`
	RoundID   uint        `gorm:"not null;index" json:"round_id"`
	Title     string      `json:"title"`
	CreatedAt time.Time   `json:"created_at"`
	Pizzas    []VotePizza `gorm:"foreignKey:VoteSessionID" json:"pizzas"`
	Votes     []Vote      `gorm:"foreignKey:VoteSessionID" json:"votes"`
}

type VotePizza struct {
	ID            uint   `gorm:"primarykey" json:"id"`
	VoteSessionID uint   `json:"vote_session_id"`
	Name          string `json:"name"`
	Servings      int    `json:"servings"`
}

type Vote struct {
	ID            uint      `gorm:"primarykey" json:"id"`
	VoteSessionID uint      `gorm:"not null;index;uniqueIndex:idx_vote_person" json:"vote_session_id"`
	Person        string    `gorm:"not null;uniqueIndex:idx_vote_person" json:"person"`
	PizzaID       uint      `json:"pizza_id"`
	CreatedAt     time.Time `json:"created_at"`
	Pizza         VotePizza `gorm:"foreignKey:PizzaID" json:"pizza"`
}
