# Notion-Inspired Design System - 订单系统

## 1. Visual Theme & Atmosphere

**Philosophy**: Warm minimalism with editorial clarity
- All-in-one workspace aesthetic
- Clean, uncluttered interfaces
- Soft surfaces with subtle depth
- Content-first approach

## 2. Color Palette & Roles

| Role | Hex | Usage |
|------|-----|-------|
| Background | `#FFFFFF` | Page background |
| Surface | `#F7F6F3` | Cards, panels |
| Surface Hover | `#EFEFED` | Hover states |
| Border | `#E8E7E4` | Dividers, borders |
| Text Primary | `#37352F` | Headings, body |
| Text Secondary | `#787774` | Muted text, labels |
| Text Tertiary | `#9B9A97` | Placeholders |
| Accent | `#2EAADC` | Links, active states |
| Accent Hover | `#1A8CB7` | Hover on accent |
| Success | `#4EAD5B` | Success states |
| Warning | `#D4A726` | Warning states |
| Error | `#EB5757` | Error states |

## 3. Typography Rules

**Font Stack**: 
```
-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif
```

**Hierarchy**:
| Element | Size | Weight | Line Height |
|---------|------|--------|-------------|
| H1 | 30px | 700 | 1.2 |
| H2 | 24px | 600 | 1.3 |
| H3 | 18px | 600 | 1.4 |
| Body | 16px | 400 | 1.5 |
| Small | 14px | 400 | 1.5 |
| Tiny | 12px | 400 | 1.4 |

## 4. Component Stylings

### Buttons

**Primary Button**
- Background: `#2EAADC`
- Text: `#FFFFFF`
- Border Radius: `6px`
- Padding: `8px 16px`
- Hover: `#1A8CB7`

**Secondary Button**
- Background: `#F7F6F3`
- Text: `#37352F`
- Border: `1px solid #E8E7E4`
- Border Radius: `6px`
- Hover: `#EFEFED`

**Ghost Button**
- Background: transparent
- Text: `#787774`
- Hover: `#F7F6F3`

### Cards

- Background: `#FFFFFF`
- Border: `1px solid #E8E7E4`
- Border Radius: `8px`
- Padding: `16px-24px`
- Shadow: none (flat design)
- Hover: border-color `#2EAADC` (for selectable cards)

### Inputs

- Background: `#FFFFFF`
- Border: `1px solid #E8E7E4`
- Border Radius: `6px`
- Padding: `10px 12px`
- Focus: border-color `#2EAADC`, box-shadow `0 0 0 3px rgba(46,170,220,0.15)`

### Tabs

- Active: border-bottom `2px solid #2EAADC`, text `#37352F`
- Inactive: text `#787774`
- Hover: text `#37352F`

## 5. Layout Principles

**Spacing Scale** (8px base):
- xs: 4px
- sm: 8px
- md: 16px
- lg: 24px
- xl: 32px
- 2xl: 48px

**Max Content Width**: 1200px
**Card Gap**: 16px
**Section Gap**: 32px

## 6. Depth & Elevation

- No drop shadows (flat design)
- Border-based separation
- Hover states use subtle background change
- Active/selected uses accent border

## 7. Do's and Don'ts

### Do's
- ✅ Use system fonts
- ✅ Keep 8px spacing grid
- ✅ Use subtle borders instead of shadows
- ✅ Rounded corners 6px-8px
- ✅ Accent color sparingly

### Don'ts
- ❌ No gradients on backgrounds
- ❌ No heavy shadows
- ❌ No rounded-full (too playful)
- ❌ No multiple accent colors

## 8. Responsive Behavior

| Breakpoint | Width |
|------------|-------|
| Mobile | < 640px |
| Tablet | 640px - 1024px |
| Desktop | > 1024px |

- Stack cards vertically on mobile
- Reduce padding on smaller screens
- Touch targets minimum 44px

## 9. Agent Prompt Guide

**Key Colors Quick Reference**:
```
Primary Text: #37352F
Secondary Text: #787774
Accent Blue: #2EAADC
Surface: #F7F6F3
Border: #E8E7E4
```

**Sample Prompt for Redesign**:
```
Redesign this order system with Notion aesthetic:
- Replace orange/amber theme with neutral gray tones
- Use border-based cards instead of shadows
- Add subtle hover states
- Keep the Emoji for food icons but make them smaller
- Use 6px-8px rounded corners consistently
- Flat, minimal aesthetic
```