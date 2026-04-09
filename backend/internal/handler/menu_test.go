package handler

import (
	"bytes"
	"testing"

	"ordering-backend/internal/model"

	"github.com/xuri/excelize/v2"
)

func TestParseSpicyOptions(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{name: "empty", input: "", want: ""},
		{name: "zero means none", input: "0", want: ""},
		{name: "single one", input: "1", want: "1"},
		{name: "single two", input: "2", want: "2"},
		{name: "single three", input: "3", want: "3"},
		{name: "numeric range", input: "1-3", want: "1,2,3"},
		{name: "localized range separator", input: "1～3", want: "1,2,3"},
		{name: "mild", input: "微辣", want: "1"},
		{name: "medium", input: "中辣", want: "2"},
		{name: "hot", input: "重辣", want: "3"},
		{name: "none localized", input: "不辣", want: ""},
		{name: "localized list slash", input: "微辣/中辣", want: "1,2"},
		{name: "localized list ideographic comma", input: "微辣、中辣、重辣", want: "1,2,3"},
		{name: "numeric list", input: "1,2,3", want: "1,2,3"},
		{name: "mixed with zero", input: "0,2,3", want: "2,3"},
		{name: "invalid", input: "特麻", want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := parseSpicyOptions(tt.input); got != tt.want {
				t.Fatalf("parseSpicyOptions(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestParseMenuImport(t *testing.T) {
	content := "午餐点餐\n餐品名,辣度\n宫保鸡丁,微辣/中辣/重辣\n麻婆豆腐,2\n番茄炒蛋,0\n"
	title, menus := parseMenuImport(content)
	if title != "午餐点餐" {
		t.Fatalf("title = %q, want %q", title, "午餐点餐")
	}
	if len(menus) != 3 {
		t.Fatalf("len(menus) = %d, want 3", len(menus))
	}
	if menus[0].spicy_options != "1,2,3" || menus[0].spicy != 0 {
		t.Fatalf("first menu spicy = %+v", menus[0])
	}
	if menus[1].spicy_options != "2" || menus[1].spicy != 2 {
		t.Fatalf("second menu spicy = %+v", menus[1])
	}
	if menus[2].spicy_options != "" || menus[2].spicy != 0 {
		t.Fatalf("third menu spicy = %+v", menus[2])
	}
}

func TestParseMenuRows(t *testing.T) {
	t.Run("use A1 as title and A2 as first dish", func(t *testing.T) {
		records := [][]string{
			{"午餐点餐"},
			{"宫保鸡丁", "微辣/中辣"},
			{"番茄炒蛋", ""},
		}
		title, menus := parseMenuRows(records)
		if title != "午餐点餐" {
			t.Fatalf("title = %q, want %q", title, "午餐点餐")
		}
		if len(menus) != 2 {
			t.Fatalf("len(menus) = %d, want 2", len(menus))
		}
		if menus[0].name != "宫保鸡丁" || menus[0].spicy_options != "1,2" {
			t.Fatalf("first menu = %+v", menus[0])
		}
		if menus[1].name != "番茄炒蛋" || menus[1].spicy_options != "" {
			t.Fatalf("second menu = %+v", menus[1])
		}
		for _, menu := range menus {
			if menu.name == "午餐点餐" {
				t.Fatalf("title row imported as menu: %+v", menus)
			}
		}
	})

	t.Run("use title row even when notes exist in later columns", func(t *testing.T) {
		records := [][]string{
			{"街边小店", "", "填写说明"},
			{"宫保鸡丁", "微辣/中辣"},
			{"番茄炒蛋", ""},
		}
		title, menus := parseMenuRows(records)
		if title != "街边小店" {
			t.Fatalf("title = %q, want %q", title, "街边小店")
		}
		if len(menus) != 2 {
			t.Fatalf("len(menus) = %d, want 2", len(menus))
		}
		if menus[0].name != "宫保鸡丁" || menus[1].name != "番茄炒蛋" {
			t.Fatalf("menus = %+v", menus)
		}
	})

	t.Run("skip legacy header row", func(t *testing.T) {
		records := [][]string{
			{"午餐点餐"},
			{"餐品名", "辣度"},
			{"宫保鸡丁", "微辣/中辣"},
			{"番茄炒蛋", ""},
		}
		title, menus := parseMenuRows(records)
		if title != "午餐点餐" {
			t.Fatalf("title = %q, want %q", title, "午餐点餐")
		}
		if len(menus) != 2 {
			t.Fatalf("len(menus) = %d, want 2", len(menus))
		}
		if menus[0].name != "宫保鸡丁" || menus[0].spicy_options != "1,2" {
			t.Fatalf("first menu = %+v", menus[0])
		}
		if menus[1].name != "番茄炒蛋" || menus[1].spicy_options != "" {
			t.Fatalf("second menu = %+v", menus[1])
		}
	})

	t.Run("skip mixed title and new header row", func(t *testing.T) {
		records := [][]string{
			{"午餐点餐"},
			{"店名", "可选辣度"},
			{"黄焖鸡", "中辣"},
		}
		title, menus := parseMenuRows(records)
		if title != "午餐点餐" {
			t.Fatalf("title = %q, want %q", title, "午餐点餐")
		}
		if len(menus) != 1 {
			t.Fatalf("len(menus) = %d, want 1", len(menus))
		}
		if menus[0].name != "黄焖鸡" || menus[0].spicy_options != "2" {
			t.Fatalf("menu = %+v", menus[0])
		}
	})

	t.Run("treat first row as data without title", func(t *testing.T) {
		records := [][]string{
			{"黄焖鸡", "中辣"},
			{"番茄炒蛋", ""},
		}
		title, menus := parseMenuRows(records)
		if title != "点餐" {
			t.Fatalf("title = %q, want %q", title, "点餐")
		}
		if len(menus) != 2 {
			t.Fatalf("len(menus) = %d, want 2", len(menus))
		}
		if menus[0].name != "黄焖鸡" || menus[0].spicy_options != "2" {
			t.Fatalf("first menu = %+v", menus[0])
		}
	})

	t.Run("skip header-only first row", func(t *testing.T) {
		records := [][]string{
			{"菜品", "辣度"},
			{"鱼香肉丝", "微辣"},
		}
		title, menus := parseMenuRows(records)
		if title != "点餐" {
			t.Fatalf("title = %q, want %q", title, "点餐")
		}
		if len(menus) != 1 || menus[0].name != "鱼香肉丝" || menus[0].spicy_options != "1" {
			t.Fatalf("menus = %+v", menus)
		}
	})
}

func TestParseMenuImportXLSX(t *testing.T) {
	f := excelize.NewFile()
	defer func() { _ = f.Close() }()
	f.SetSheetName(f.GetSheetName(0), "菜单")
	rows := [][]any{
		{"午餐点餐"},
		{"宫保鸡丁", "1-3"},
		{"麻婆豆腐", "2"},
		{"番茄炒蛋", "不辣"},
	}
	for i, row := range rows {
		cell, err := excelize.CoordinatesToCellName(1, i+1)
		if err != nil {
			t.Fatalf("CoordinatesToCellName: %v", err)
		}
		if err := f.SetSheetRow("菜单", cell, &row); err != nil {
			t.Fatalf("SetSheetRow: %v", err)
		}
	}
	buf, err := f.WriteToBuffer()
	if err != nil {
		t.Fatalf("WriteToBuffer: %v", err)
	}
	title, menus, err := parseMenuImportXLSX(buf.Bytes())
	if err != nil {
		t.Fatalf("parseMenuImportXLSX: %v", err)
	}
	if title != "午餐点餐" {
		t.Fatalf("title = %q, want %q", title, "午餐点餐")
	}
	if len(menus) != 3 {
		t.Fatalf("len(menus) = %d, want 3", len(menus))
	}
	if menus[0].spicy_options != "1,2,3" || menus[0].spicy != 0 {
		t.Fatalf("first menu = %+v", menus[0])
	}
	if menus[1].spicy_options != "2" || menus[1].spicy != 2 {
		t.Fatalf("second menu = %+v", menus[1])
	}
	if menus[2].spicy_options != "" || menus[2].spicy != 0 {
		t.Fatalf("third menu = %+v", menus[2])
	}
}

func TestParseMenuImportFileXLSX(t *testing.T) {
	f := excelize.NewFile()
	defer func() { _ = f.Close() }()
	rows := [][]any{{"点餐"}, {"餐品名", "辣度"}, {"鱼香肉丝", "微辣"}}
	for i, row := range rows {
		cell, err := excelize.CoordinatesToCellName(1, i+1)
		if err != nil {
			t.Fatalf("CoordinatesToCellName: %v", err)
		}
		if err := f.SetSheetRow(f.GetSheetName(0), cell, &row); err != nil {
			t.Fatalf("SetSheetRow: %v", err)
		}
	}
	buf, err := f.WriteToBuffer()
	if err != nil {
		t.Fatalf("WriteToBuffer: %v", err)
	}
	title, menus, err := parseMenuImportFile("menu.xlsx", bytes.Clone(buf.Bytes()))
	if err != nil {
		t.Fatalf("parseMenuImportFile: %v", err)
	}
	if title != "点餐" || len(menus) != 1 || menus[0].spicy_options != "1" {
		t.Fatalf("got title=%q menus=%+v", title, menus)
	}
}

func TestNormalizeMenuSpicy(t *testing.T) {
	menu := model.Menu{Spicy: 2}
	normalizeMenuSpicy(&menu)
	if menu.SpicyOptions != "2" {
		t.Fatalf("SpicyOptions = %q, want %q", menu.SpicyOptions, "2")
	}

	menu = model.Menu{Spicy: 3, SpicyOptions: "1,2,3"}
	normalizeMenuSpicy(&menu)
	if menu.SpicyOptions != "1,2,3" {
		t.Fatalf("SpicyOptions = %q, want %q", menu.SpicyOptions, "1,2,3")
	}
}
