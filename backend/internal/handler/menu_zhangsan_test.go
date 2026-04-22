package handler

import (
	"testing"
)

func TestIsMenuTitleRowZhangSan(t *testing.T) {
	// 用户场景：A1="张三的店"，B1 空
	row := []string{"张三的店", ""}
	if !isMenuTitleRow(row) {
		t.Fatalf("isMenuTitleRow(['张三的店', '']) = false, want true")
	}
	t.Logf("✅ isMenuTitleRow(['张三的店', '']) = true")
}

func TestParseMenuRowsZhangSan(t *testing.T) {
	// 用户场景：第一行是标题，后面是菜品
	records := [][]string{
		{"张三的店", ""},
		{"宫保鸡丁", "微辣"},
		{"麻婆豆腐", "中辣"},
	}
	title, menus := parseMenuRows(records)
	t.Logf("解析结果: title=%q, menus=%d个", title, len(menus))
	for i, m := range menus {
		t.Logf("  菜品[%d]: name=%q, spicy_options=%q", i, m.name, m.spicy_options)
	}
	if title != "张三的店" {
		t.Fatalf("title = %q, want %q", title, "张三的店")
	}
	if len(menus) != 2 {
		t.Fatalf("len(menus) = %d, want 2", len(menus))
	}
	if menus[0].name != "宫保鸡丁" {
		t.Fatalf("menus[0].name = %q, want %q", menus[0].name, "宫保鸡丁")
	}
}

func TestParseMenuRowsZhangSanWithHeader(t *testing.T) {
	// 用户场景：第一行标题，第二行表头，第三行开始菜品
	records := [][]string{
		{"张三的店"},
		{"餐品名", "辣度"},
		{"宫保鸡丁", "微辣"},
		{"麻婆豆腐", "中辣"},
	}
	title, menus := parseMenuRows(records)
	t.Logf("解析结果: title=%q, menus=%d个", title, len(menus))
	for i, m := range menus {
		t.Logf("  菜品[%d]: name=%q, spicy_options=%q", i, m.name, m.spicy_options)
	}
	if title != "张三的店" {
		t.Fatalf("title = %q, want %q", title, "张三的店")
	}
	if len(menus) != 2 {
		t.Fatalf("len(menus) = %d, want 2", len(menus))
	}
}