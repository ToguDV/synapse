# Mocha Synapse

## Overview

Mocha Synapse is the design system for Synapse, a local-first block editor built with Electron,
React, and SQLite. It is built on Catppuccin Mocha (dark) and Catppuccin Latte (light): cool
blue-gray surfaces, pastel accents, and a single violet primary. It prioritizes keyboard-driven
workflows, a roomy writing canvas, and compact chrome — fresh at hour one, kind to the eyes at hour
eight.

Every token and component below has a living example in `design/` (`index.html` + `styles.css`).
Open `design/index.html` in a browser and use the Mocha/Latte toggle in the top bar; both flavors
share one token set and one markup, so anything that only works in one theme is a bug.

## Colors

Token-first: components consume semantic tokens from `src/renderer/src/assets/main.css`
(`--canvas`, `--panel`, `--surface`, `--ink`, `--accent`…), never raw palette hexes. Both flavors
define the same token names, so switching themes is a value swap, not a rewrite. The token map below
is drop-in for the current `:root` / `.dark` blocks.

- **Primary** (#cba6f7 Mocha / #8839ef Latte): primary actions, selected states, active indicators,
  focus rings — Mauve
- **Primary Hover** (#b4befe Mocha / mauve −14% Latte): hover and pressed state for primary
  interactions — Lavender
- **Selected** (12% accent Mocha / 8% Latte): selected rows and nav items
- **Accent Soft** (16% / 10%): chips, badges, marks, search matches
- **Canvas** (#1e1e2e / #eff1f5): document, app background — Base
- **Panel** (#181825 / #e6e9ef): sidebar, header, chrome — Mantle
- **Surface** (#313244 / #ffffff): cards, inputs, menus, command palette — Surface 0
- **Surface Raised** (#45475a / #ffffff): tooltips, nested popovers — Surface 1
- **Code** (#11111b / #dce0e8): code blocks, wells — Crust
- **Border** (10% ink / 14% ink): hairlines, input edges, panel edges
- **Border Strong** (18% / 24%): hover edges, dividers
- **Hover** (7% ink / 6% ink): row and control hover wash
- **Hover Strong** (12% / 10%): pressed and dense hover states
- **Text Primary** (#cdd6f4 / #4c4f69): headings, body, titles — Text
- **Text Secondary** (#bac2de / #5c5f77): secondary sentences — Subtext 1
- **Text Muted** (#a6adc8 / #6c6f85): descriptions, metadata, timestamps — Subtext 0
- **Text Faint** (#7f849c / #8c8fa1): placeholders, hints — Overlay 1
- **Text Faintest** (#6c7086 / #9ca0b0): disabled, non-text — Overlay 0
- **Success** (#a6e3a1 / #40a02b): done, passing checks — Green
- **Warning** (#f9e2af / #df8e1d): in progress, attention needed — Yellow
- **Error** (#f38ba8 / #d20f39): errors, destructive actions — Red
- **Info** (#89b4fa / #1e66f5): info, links — Blue

### Accent roles

Each hue owns one job. There is no decorative rainbow.

| Accent   | Mocha   | Latte   | Role                          |
| -------- | ------- | ------- | ----------------------------- |
| Mauve    | #cba6f7 | #8839ef | Primary: active, selected     |
| Lavender | #b4befe | #7287fd | Accent hover, soft glow       |
| Blue     | #89b4fa | #1e66f5 | Info, links                   |
| Sapphire | #74c7ec | #209fb5 | Drag target, secondary info   |
| Sky      | #89dceb | #04a5e5 | Search match, highlights      |
| Teal     | #94e2d5 | #179299 | Syntax, tags                  |
| Green    | #a6e3a1 | #40a02b | Success, done                 |
| Yellow   | #f9e2af | #df8e1d | Warning, in progress          |
| Peach    | #fab387 | #fe640b | Attention, streaks            |
| Red      | #f38ba8 | #d20f39 | Error, destructive            |
| Maroon   | #eba0ac | #e64553 | Error alt, mentions           |
| Pink     | #f5c2e7 | #ea76cb | Tags, callouts                |
| Flamingo | #f2cdcd | #dd7878 | Soft labels                   |
| Rosewater | #f5e0dc | #dc8a78 | Warm neutral, rarely used    |

### Contrast

Measured pairs, not guesses (WCAG 2.1 relative luminance):

| Pair                                    | Ratio  | Verdict  |
| --------------------------------------- | ------ | -------- |
| Mocha · ink on canvas                   | 11.3:1 | AAA      |
| Mocha · muted on canvas                 | 7.4:1  | AAA      |
| Mocha · canvas on accent (primary)      | 8.1:1  | AAA      |
| Mocha · faintest on canvas              | 3.4:1  | Non-text |
| Latte · ink on canvas                   | 7.0:1  | AAA      |
| Latte · subtext on canvas               | 5.5:1  | AA       |
| Latte · white on accent (primary)       | 5.4:1  | AA       |
| Latte · faintest on canvas              | 2.3:1  | Non-text |

## Typography

Inter runs the whole interface; JetBrains Mono marks anything the machine owns. Both are OFL and
self-hosted in the app (offline-first, like the bundled Noto Color Emoji); the `design/` preview
loads them from Google Fonts for convenience.

| Role        | Size · Weight      | Notes                                     |
| ----------- | ------------------ | ----------------------------------------- |
| Display     | 40 · 600 · -0.03em | Landing, hero                             |
| Page title  | 32 · 600 · -0.02em | Auto-fits 36 → 24 in the app              |
| Heading 2   | 24 · 600 · -0.02em | Block headings                            |
| Heading 3   | 20 · 600           |                                           |
| Heading 4   | 16 · 600           |                                           |
| Body        | 16 · 400 · 1.6     | Writing canvas                            |
| UI          | 13 · 500           | Sidebar, buttons, menus, breadcrumbs      |
| Metadata    | 12 · 500           | Timestamps, counts, descriptions          |
| Overline    | 11 · 600 · +0.08em | Uppercase group labels                    |
| Code        | 13 · 400           | JetBrains Mono                            |
| Keyboard    | 11 · 500           | JetBrains Mono in 20px rounded containers |

Type scale: 11, 12, 13, 16, 20, 24, 32, 40. Body copy stays at 16px; chrome stays at 13px.

## Elevation

Depth comes from luminance, not shadows. Five levels carry the whole hierarchy:

| Level    | Token              | Mocha   | Latte   | Used for                       |
| -------- | ------------------ | ------- | ------- | ------------------------------ |
| Floating | `--surface-raised` | #45475a | #ffffff | Tooltips, nested popovers      |
| Raised   | `--surface`        | #313244 | #ffffff | Cards, inputs, menus, palette  |
| Canvas   | `--canvas`         | #1e1e2e | #eff1f5 | Document                       |
| Panel    | `--panel`          | #181825 | #e6e9ef | Sidebar, header, chrome        |
| Deep     | `--code-bg`        | #11111b | #dce0e8 | Code blocks, wells             |

- **Focus ring**: 1px accent border plus a 3px ring at 30% accent (22% in Latte).
- **Accent glow**: `0 0 24px` at 15% accent behind primary buttons and focused elements.
- **Modals**: `0 24px 48px rgba(0,0,0,0.45)` in Mocha, `0 24px 48px rgb(76 79 105 / 0.2)` in Latte,
  over a dimmed backdrop (`rgb(17 17 27 / 0.55)` / `rgb(76 79 105 / 0.3)`) with 4px blur.
- No heavy shadows on dark surfaces, and never pure black: `--code-bg` is the floor.

## Components

- **Buttons**: 32px default, 28px compact, 12px horizontal padding (10px compact), 6px radius,
  13px Inter 500. Primary is solid accent with `--accent-ink` text; hover shifts to
  `--accent-hover` plus the soft glow. Secondary is transparent with a `--border-strong` border;
  ghost is text-only with a hover wash; danger uses the error hue. Disabled sits at 45% opacity.
- **Inputs**: 32px (28px compact), `--surface` background, 1px `--border`, 6px radius, 14px text.
  Focus shows a 1px accent border with the 3px ring. Placeholders use `--faint`.
- **Chips**: 20px tall, 4px radius, 11px Inter 500, tinted 16% of their own hue — never solid.
- **Rows & lists**: 36px list rows, 24–30px tree rows, seamless (no dividers). Hover reveals the
  translucent wash; selected adds a 12% accent background and a 2px left accent border.
- **Todo checkbox**: 16px square, 4px radius — the shape is final. Five states: Backlog (dotted
  outline), Todo (solid outline), In progress (half-filled warning), Done (filled success with
  checkmark), Cancelled (filled faintest with X and line-through).
- **Tooltips**: `--surface-raised`, 1px border, 6px radius, 12px text, 6px 10px padding. The
  keyboard shortcut sits right-aligned in JetBrains Mono. 0ms delay, 100ms fade.
- **Navigation**: 220px sidebar (48px rail collapsed), `--panel` background with a right hairline.
  Nav items are 13px Inter 500, 32px tall, 8px radius; the active item uses the selected wash with
  `--ink` text.
- **Command palette (⌘K)**: centered, 560px, `--surface`, 12px radius, modal shadow and backdrop
  blur. 44px borderless input at 16px, results grouped by Pages / Blocks with 36px rows; the active
  row uses the selected wash plus the 2px left accent border.
- **Slash menu & block menu**: `--surface`, 8px radius, pop shadow, 4px padding, 6px per item,
  28px icon tiles, descriptions in 11px `--faint`. Arrow keys move, Enter runs, Esc closes.
- **Code blocks**: `--code-bg`, 1px border, 8px radius, 13px JetBrains Mono at 1.7 line-height.

## Spacing

- Base unit: 4px.
- Scale: 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- Component padding: buttons 4px 12px, inputs 4px 10px, rows 8px 10px, chips 2px 8px, menus 4px.
- Editor rhythm: blocks 3px 2px with a 640px measure; 16px between blocks, 32px between sections.
- Container: full viewport (sidebar + canvas); page padding 40px 56px; sidebar 220px (48px rail).

## Border Radius

- 4px: chips, inline labels, small badges, checkboxes
- 6px: buttons, inputs, dropdown items, keyboard containers
- 8px: menus, sidebar nav items, cards, code blocks
- 12px: modals, command palette, panels
- 9999px: status circles, avatar circles

## Do's and Don'ts

- Do make every action keyboard-reachable, and surface the shortcut in its tooltip.
- Don't rely on hue alone for status; pair it with an icon, shape, or text.
- Do treat ⌘K as primary navigation, not just a search box.
- Don't paint large areas with pastel; accents stay under 15% of the screen.
- Do build depth from layered surfaces; edges stay quiet and hairlines stay subtle.
- Don't animate longer than 150ms; hover feedback should feel immediate.
- Do keep controls compact (28–36px) so the writing canvas gets the room.
- Don't introduce warm hues outside warning and error semantics.
- Do use mono for code, shortcuts, counts, and identifiers.
- Don't go pure black; pure black clips the pastels.

## Preview

`design/index.html` + `design/styles.css` are a static, dependency-free preview of this document:
palette, typography, elevation, components, and a full editor mock in both flavors. No build step —
open the file directly or serve the folder. It is documentation only and is not packaged with the
app (`electron-builder` ships `out/**` and `package.json`).

The tokens in this document are applied to the app: `src/renderer/src/assets/main.css` defines them
for Latte (`:root`) and Mocha (`.dark`), and `@theme inline` exposes them to the components. Inter
and JetBrains Mono are self-hosted as variable woff2 subsets in `src/renderer/src/assets/fonts/`.

Applied with three conscious deviations: the todo checkbox implements two of its five states (Todo
and Done) because the data model stores a boolean `checked`; the theme control is a three-way
segmented toggle (system / light / dark) that selects directly instead of cycling; and the mock's
block-handle `+` and settings/more buttons were not added, to avoid inventing functionality the app
does not have.
