package handler

import (
	"encoding/csv"
	"io"
	"net/http"
	"strings"

	"ordering-backend/internal/model"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type PersonnelHandler struct {
	DB *gorm.DB
}

// POST /api/admin/personnel/import — CSV导入(覆盖模式)
func (h *PersonnelHandler) Import(c *gin.Context) {
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

	// Read all bytes properly
	buf, err := io.ReadAll(f)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "文件读取失败"})
		return
	}
	content := string(buf)
	// Strip BOM if present
	content = strings.TrimPrefix(content, "\xEF\xBB\xBF")

	reader := csv.NewReader(strings.NewReader(content))

	// 跳过 header
	if _, err := reader.Read(); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "CSV格式错误"})
		return
	}

	// 先清空
	h.DB.Exec("DELETE FROM people")

	var persons []model.Person
	lineNum := 1
	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			lineNum++
			continue
		}
		if len(record) < 1 {
			lineNum++
			continue
		}
		name := strings.TrimSpace(record[0])
		if name == "" {
			lineNum++
			continue
		}
		persons = append(persons, model.Person{Name: name})
		lineNum++
	}

	if len(persons) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "CSV中无有效人员数据"})
		return
	}

	if err := h.DB.Create(&persons).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "导入失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"imported": len(persons)})
}

// GET /api/personnel — 返回所有人员列表
func (h *PersonnelHandler) ListPublic(c *gin.Context) {
	var persons []model.Person
	h.DB.Order("name ASC").Find(&persons)
	c.JSON(http.StatusOK, persons)
}
