package handler

import (
	"testing"
)

func TestIsMenuHeaderRowEdgeCases(t *testing.T) {
	tests := []struct {
		name     string
		row      []string
		want     bool
		reason   string
	}{
		{"标准表头_餐品辣度", []string{"餐品", "辣度"}, true, "标准表头"},
		{"标准表头_菜品辣度", []string{"菜品", "辣度"}, true, "标准表头"},
		{"张三的店_辣度", []string{"张三的店", "辣度"}, false, "B1=辣度 但 A1不是表头关键词"},
		{"张三的店_可选辣度", []string{"张三的店", "可选辣度"}, false, "B1包含辣度 但 A1不是表头关键词"},
		{"张三的店_空", []string{"张三的店", ""}, false, "单列标题"},
		{"张三的店_备注", []string{"张三的店", "备注"}, false, "B1不包含辣度"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isMenuHeaderRow(tt.row)
			t.Logf("row=%v, got=%v, want=%v, reason=%s", tt.row, got, tt.want, tt.reason)
			if got != tt.want {
				t.Errorf("isMenuHeaderRow(%v) = %v, want %v", tt.row, got, tt.want)
			}
		})
	}
}

func TestIsMenuTitleRowEdgeCases(t *testing.T) {
	tests := []struct {
		name   string
		row    []string
		want   bool
	}{
		{"张三的店_空", []string{"张三的店", ""}, true},
		{"张三的店_备注", []string{"张三的店", "备注"}, false}, // B1有内容，不视为标题
		{"张三的店_辣度", []string{"张三的店", "辣度"}, true}, // B1包含辣度视为标题行
		{"餐品_辣度", []string{"餐品", "辣度"}, false}, // 是表头，不是标题
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isMenuTitleRow(tt.row)
			t.Logf("row=%v, got=%v, want=%v", tt.row, got, tt.want)
			if got != tt.want {
				t.Errorf("isMenuTitleRow(%v) = %v, want %v", tt.row, got, tt.want)
			}
		})
	}
}