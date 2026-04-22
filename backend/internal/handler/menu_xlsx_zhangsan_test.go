package handler

import (
	"testing"

	"github.com/xuri/excelize/v2"
)

func TestParseMenuImportXLSX_ZhangSan(t *testing.T) {
	// 模拟用户可能的 Excel 格式
	t.Run("A1标题_B1空", func(t *testing.T) {
		f := excelize.NewFile()
		defer func() { _ = f.Close() }()
		// Row 1: A1="张三的店", B1 空
		f.SetCellValue("Sheet1", "A1", "张三的店")
		f.SetCellValue("Sheet1", "B1", "") // 明确设置为空
		// Row 2: 菜品
		f.SetCellValue("Sheet1", "A2", "宫保鸡丁")
		f.SetCellValue("Sheet1", "B2", "微辣")
		// Row 3
		f.SetCellValue("Sheet1", "A3", "麻婆豆腐")
		f.SetCellValue("Sheet1", "B3", "中辣")

		buf, err := f.WriteToBuffer()
		if err != nil {
			t.Fatalf("WriteToBuffer: %v", err)
		}
		title, menus, err := parseMenuImportXLSX(buf.Bytes())
		if err != nil {
			t.Fatalf("parseMenuImportXLSX: %v", err)
		}
		t.Logf("解析结果: title=%q, menus=%d个", title, len(menus))
		for i, m := range menus {
			t.Logf("  菜品[%d]: name=%q, spicy_options=%q", i, m.name, m.spicy_options)
		}
		if title != "张三的店" {
			t.Fatalf("title = %q, want %q", title, "张三的店")
		}
	})

	t.Run("A1标题_无B列", func(t *testing.T) {
		f := excelize.NewFile()
		defer func() { _ = f.Close() }()
		// Row 1: 只有 A1
		f.SetCellValue("Sheet1", "A1", "张三的店")
		// Row 2: 菜品（只有名称，无辣度）
		f.SetCellValue("Sheet1", "A2", "宫保鸡丁")
		f.SetCellValue("Sheet1", "A3", "麻婆豆腐")

		buf, err := f.WriteToBuffer()
		if err != nil {
			t.Fatalf("WriteToBuffer: %v", err)
		}
		title, menus, err := parseMenuImportXLSX(buf.Bytes())
		if err != nil {
			t.Fatalf("parseMenuImportXLSX: %v", err)
		}
		t.Logf("解析结果: title=%q, menus=%d个", title, len(menus))
		for i, m := range menus {
			t.Logf("  菜品[%d]: name=%q", i, m.name)
		}
		if title != "张三的店" {
			t.Fatalf("title = %q, want %q", title, "张三的店")
		}
	})

	t.Run("A1标题_B1有内容_当作菜品", func(t *testing.T) {
		f := excelize.NewFile()
		defer func() { _ = f.Close() }()
		// Row 1: A1="张三的店", B1="xxx"（有内容，不包含辣度）
		f.SetCellValue("Sheet1", "A1", "张三的店")
		f.SetCellValue("Sheet1", "B1", "说明") // B1 有内容
		// Row 2: 菜品
		f.SetCellValue("Sheet1", "A2", "宫保鸡丁")
		f.SetCellValue("Sheet1", "B2", "微辣")
		// Row 3: 第二道菜
		f.SetCellValue("Sheet1", "A3", "麻婆豆腐")
		f.SetCellValue("Sheet1", "B3", "中辣")

		buf, err := f.WriteToBuffer()
		if err != nil {
			t.Fatalf("WriteToBuffer: %v", err)
		}
		title, menus, err := parseMenuImportXLSX(buf.Bytes())
		if err != nil {
			t.Fatalf("parseMenuImportXLSX: %v", err)
		}
		t.Logf("解析结果: title=%q, menus=%d个", title, len(menus))
		for i, m := range menus {
			t.Logf("  菜品[%d]: name=%q, spicy_options=%q", i, m.name, m.spicy_options)
		}
		// 当 B1 有内容但不包含辣度时，第一行被视为菜品，标题为默认 "点餐"
		if title != "点餐" {
			t.Fatalf("title = %q, want %q（因为B1有内容，第一行被视为菜品）", title, "点餐")
		}
		if len(menus) != 3 {
			t.Fatalf("len(menus) = %d, want 3（张三的店 + 宫保鸡丁 + 麻婆豆腐）", len(menus))
		}
	})

	t.Run("A1标题_A2表头", func(t *testing.T) {
		f := excelize.NewFile()
		defer func() { _ = f.Close() }()
		// Row 1: A1="张三的店", B1 空
		f.SetCellValue("Sheet1", "A1", "张三的店")
		// Row 2: 表头
		f.SetCellValue("Sheet1", "A2", "菜品")
		f.SetCellValue("Sheet1", "B2", "辣度")
		// Row 3: 菜品
		f.SetCellValue("Sheet1", "A3", "宫保鸡丁")
		f.SetCellValue("Sheet1", "B3", "微辣")

		buf, err := f.WriteToBuffer()
		if err != nil {
			t.Fatalf("WriteToBuffer: %v", err)
		}
		title, menus, err := parseMenuImportXLSX(buf.Bytes())
		if err != nil {
			t.Fatalf("parseMenuImportXLSX: %v", err)
		}
		t.Logf("解析结果: title=%q, menus=%d个", title, len(menus))
		for i, m := range menus {
			t.Logf("  菜品[%d]: name=%q, spicy_options=%q", i, m.name, m.spicy_options)
		}
		if title != "张三的店" {
			t.Fatalf("title = %q, want %q", title, "张三的店")
		}
		if len(menus) != 1 {
			t.Fatalf("len(menus) = %d, want 1（表头被跳过）", len(menus))
		}
	})
}