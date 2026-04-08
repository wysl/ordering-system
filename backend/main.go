package main

import (
	"log"

	"ordering-backend/internal/handler"
	mw "ordering-backend/internal/middleware"
	"ordering-backend/internal/model"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func main() {
	db, err := gorm.Open(sqlite.Open("ordering.db"), &gorm.Config{})
	if err != nil {
		log.Fatal("数据库连接失败:", err)
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
		log.Fatal("迁移失败:", err)
	}

	menuH := &handler.MenuHandler{DB: db}
	orderH := &handler.OrderHandler{DB: db}
	adminH := &handler.AdminHandler{DB: db}
	voteH := &handler.VoteHandler{DB: db}
	personnelH := &handler.PersonnelHandler{DB: db}

	r := gin.Default()
	r.Use(mw.CORS())

	api := r.Group("/api")
	{
		api.GET("/home-state", orderH.HomeState)
		api.GET("/menu", menuH.ListPublic)
		api.POST("/order", orderH.Create)
		api.GET("/order/mine", orderH.GetMine)
		api.GET("/personnel", personnelH.ListPublic)

		api.GET("/votes", voteH.ListPublicVotes)
		api.POST("/vote", voteH.CastVote)
		api.GET("/vote/:id/result", voteH.GetVoteResult)

		api.POST("/admin/login", adminH.Login)

		admin := api.Group("/admin")
		admin.Use(mw.JWTAuth())
		{
			admin.POST("/menu/import", menuH.Import)
			admin.GET("/menu", menuH.ListAdmin)
			admin.DELETE("/menu/:id", menuH.Delete)
			admin.POST("/personnel/import", personnelH.Import)
			admin.GET("/orders", adminH.ListOrders)
			admin.GET("/participation-status", adminH.GetParticipationStatus)
			admin.POST("/rounds/end", adminH.EndActiveRound)
			admin.GET("/rounds", adminH.ListRounds)
			admin.GET("/rounds/:id/detail", adminH.GetRoundDetail)
			admin.GET("/rounds/:id/export", adminH.ExportRoundHTML)
			admin.GET("/rounds/:id/export.csv", adminH.ExportRoundCSV)
			admin.GET("/rounds/:id/export.xlsx", adminH.ExportRoundXLSX)
			admin.GET("/lookup/person", adminH.LookupPersonCurrent)
			admin.GET("/persons", personnelH.ListPublic)
			admin.GET("/export", adminH.ExportHTML)
			admin.GET("/template/:type", adminH.TemplateDownload)
			admin.POST("/vote", voteH.CreateVoteSession)
			admin.DELETE("/vote/:id", voteH.DeleteVoteSession)
			admin.GET("/votes", voteH.ListVoteSessions)
		}
	}

	log.Println("Server running on :8088")
	r.Run(":8088")
}
