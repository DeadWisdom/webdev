# Web Awesome Reference Guide

Web Awesome is a modern web component library for building interfaces. It provides 50+ customizable components built on web standards, working with any framework or vanilla JS.

## Installation

### CDN (Recommended)

Create an account at [webawesome.com](https://webawesome.com) and paste your project code into `<head>`:

```html
<!-- Your unique project script from webawesome.com -->
<script src="https://kit.webawesome.com/9d20ef4c155c4947.js"></script>
```

### npm

```bash
npm install @awesome.me/webawesome
```

```javascript
// Import theme and components individually
import '@awesome.me/webawesome/dist/styles/themes/default.css';
import '@awesome.me/webawesome/dist/components/button/button.js';
```

### Self-Hosted Styles

```html
<!-- All-in-one -->
<link rel="stylesheet" href="/dist/styles/webawesome.css" />

<!-- Or separate files -->
<link rel="stylesheet" href="/dist/styles/themes/default.css" />
<link rel="stylesheet" href="/dist/styles/utilities.css" />
```

---

## Quick Start

```html
<wa-button variant="brand">Click Me</wa-button>

<wa-input label="Name" placeholder="Enter your name"></wa-input>

<wa-card>
  <h3 slot="header">Card Title</h3>
  Content goes here
  <wa-button slot="footer">Action</wa-button>
</wa-card>
```

---

## Design Tokens

Design tokens are CSS custom properties that provide consistent styling across components.

### Space

Spacing tokens use `rem` units scaled by `--wa-space-scale` (default: 1):

| Token | Default | ~Pixels |
|-------|---------|---------|
| `--wa-space-3xs` | 0.125rem | 2px |
| `--wa-space-2xs` | 0.25rem | 4px |
| `--wa-space-xs` | 0.5rem | 8px |
| `--wa-space-s` | 0.75rem | 12px |
| `--wa-space-m` | 1rem | 16px |
| `--wa-space-l` | 1.5rem | 24px |
| `--wa-space-xl` | 2rem | 32px |
| `--wa-space-2xl` | 2.5rem | 40px |
| `--wa-space-3xl` | 3rem | 48px |
| `--wa-space-4xl` | 4rem | 64px |

[Full space docs](https://webawesome.com/docs/tokens/space/)

### Color

Colors are organized into scales, foundational tokens, and semantic colors.

**Color Scales** — 10 hues × 11 tints (0-100):
```css
--wa-color-{hue}-{tint}
/* hues: red, orange, yellow, green, cyan, blue, indigo, purple, pink, gray */
/* tints: 0 (black) to 100 (white), in steps of 10 */
```

**Semantic Colors** — Intent-based with role and attention:
```css
--wa-color-{group}-{role}-{attention}
/* groups: brand, neutral, success, warning, danger */
/* roles: fill, border, on */
/* attention: quiet, normal, loud */
```

**Foundational Colors:**
- `--wa-color-surface-raised` / `default` / `lowered` — Background layers
- `--wa-color-text-normal` / `quiet` / `link` — Text colors
- `--wa-color-shadow`, `--wa-color-focus` — Effects

[Full color docs](https://webawesome.com/docs/tokens/color/)

### Component Groups

Shared tokens for consistent styling across related components.

**Form Controls** (`<wa-input>`, `<wa-select>`, `<wa-button>`, etc.):
```css
--wa-form-control-background-color
--wa-form-control-border-color
--wa-form-control-border-width
--wa-form-control-border-radius
--wa-form-control-activated-color
--wa-form-control-height
--wa-form-control-padding-block
--wa-form-control-padding-inline
```

**Panels** (`<wa-card>`, `<wa-dialog>`, `<wa-callout>`):
```css
--wa-panel-border-style
--wa-panel-border-width
--wa-panel-border-radius
```

**Tooltips:**
```css
--wa-tooltip-background-color
--wa-tooltip-content-color
--wa-tooltip-border-radius
--wa-tooltip-font-size
--wa-tooltip-arrow-size
```

[Full component groups docs](https://webawesome.com/docs/tokens/component-groups/)

---

## Layout Utilities

Layout classes for responsive design. Include via `utilities.css`.

### Stack
Vertical flow with consistent spacing. Great for forms and text.

```html
<div class="wa-stack">
  <div>Item 1</div>
  <div>Item 2</div>
</div>
```

[Stack docs](https://webawesome.com/docs/utilities/stack/)

### Grid
Auto-wrapping multi-column layout. Great for card lists.

```html
<div class="wa-grid" style="--min-column-size: 200px;">
  <wa-card>...</wa-card>
  <wa-card>...</wa-card>
</div>
```

[Grid docs](https://webawesome.com/docs/utilities/grid/)

### Cluster
Inline items with flexible wrapping. Great for tags and inline lists.

```html
<div class="wa-cluster wa-gap-xs">
  <wa-tag>Tag 1</wa-tag>
  <wa-tag>Tag 2</wa-tag>
</div>
```

[Cluster docs](https://webawesome.com/docs/utilities/cluster/)

### Split
Distributes items across rows/columns. Great for headers and navs.

```html
<div class="wa-split">
  <div>Left</div>
  <div>Right</div>
</div>
```

Modifiers: `wa-split:row` (default), `wa-split:column`

[Split docs](https://webawesome.com/docs/utilities/split/)

### Flank
One item flanks remaining content. Great for avatars beside text.

```html
<div class="wa-flank">
  <wa-avatar></wa-avatar>
  <div>Content that wraps</div>
</div>
```

Modifiers: `wa-flank:start` (default), `wa-flank:end`

[Flank docs](https://webawesome.com/docs/utilities/flank/)

### Frame
Maintains aspect ratios for images.

```html
<div class="wa-frame:landscape">
  <img src="image.jpg" alt="" />
</div>
```

Variants: `wa-frame:square`, `wa-frame:landscape` (16:9), `wa-frame:portrait` (9:16)

[Frame docs](https://webawesome.com/docs/utilities/frame/)

### Gap Classes

Apply to any layout utility:
`wa-gap-0`, `wa-gap-3xs`, `wa-gap-2xs`, `wa-gap-xs`, `wa-gap-s`, `wa-gap-m` (default), `wa-gap-l`, `wa-gap-xl`, `wa-gap-2xl`, `wa-gap-3xl`

### Alignment Classes

`wa-align-items-start`, `wa-align-items-center`, `wa-align-items-end`, `wa-align-items-stretch`, `wa-align-items-baseline`

---

## Components Index

### Form Controls

| Component | Description | Docs |
|-----------|-------------|------|
| `<wa-input>` | Text input with label, hint, clear, password toggle | [input](https://webawesome.com/docs/components/input/) |
| `<wa-textarea>` | Multi-line text input with auto-resize | [textarea](https://webawesome.com/docs/components/textarea/) |
| `<wa-select>` | Dropdown selection, single or multiple | [select](https://webawesome.com/docs/components/select/) |
| `<wa-checkbox>` | Checkbox with indeterminate state | [checkbox](https://webawesome.com/docs/components/checkbox/) |
| `<wa-radio-group>` | Radio button group with orientation | [radio-group](https://webawesome.com/docs/components/radio-group/) |
| `<wa-switch>` | Toggle switch | [switch](https://webawesome.com/docs/components/switch/) |
| `<wa-slider>` | Range slider | [slider](https://webawesome.com/docs/components/slider/) |
| `<wa-color-picker>` | Color selection tool | [color-picker](https://webawesome.com/docs/components/color-picker/) |
| `<wa-rating>` | Star rating input | [rating](https://webawesome.com/docs/components/rating/) |
| `<wa-combobox>` | Autocomplete input (Pro) | [combobox](https://webawesome.com/docs/components/combobox/) |

### Actions

| Component | Description | Docs |
|-----------|-------------|------|
| `<wa-button>` | Button with variants, sizes, loading state | [button](https://webawesome.com/docs/components/button/) |
| `<wa-button-group>` | Group related buttons | [button-group](https://webawesome.com/docs/components/button-group/) |
| `<wa-dropdown>` | Dropdown menu with items and submenus | [dropdown](https://webawesome.com/docs/components/dropdown/) |
| `<wa-copy-button>` | Copy text to clipboard | [copy-button](https://webawesome.com/docs/components/copy-button/) |

### Feedback & Status

| Component | Description | Docs |
|-----------|-------------|------|
| `<wa-callout>` | Inline message with icon and variants | [callout](https://webawesome.com/docs/components/callout/) |
| `<wa-badge>` | Small status indicator | [badge](https://webawesome.com/docs/components/badge/) |
| `<wa-tag>` | Label or category indicator | [tag](https://webawesome.com/docs/components/tag/) |
| `<wa-spinner>` | Loading indicator | [spinner](https://webawesome.com/docs/components/spinner/) |
| `<wa-progress-bar>` | Horizontal progress indicator | [progress-bar](https://webawesome.com/docs/components/progress-bar/) |
| `<wa-progress-ring>` | Circular progress indicator | [progress-ring](https://webawesome.com/docs/components/progress-ring/) |
| `<wa-skeleton>` | Loading placeholder | [skeleton](https://webawesome.com/docs/components/skeleton/) |
| `<wa-tooltip>` | Hover/focus information popup | [tooltip](https://webawesome.com/docs/components/tooltip/) |

### Organization

| Component | Description | Docs |
|-----------|-------------|------|
| `<wa-card>` | Container with header, body, footer, media | [card](https://webawesome.com/docs/components/card/) |
| `<wa-dialog>` | Modal dialog | [dialog](https://webawesome.com/docs/components/dialog/) |
| `<wa-drawer>` | Slide-in panel | [drawer](https://webawesome.com/docs/components/drawer/) |
| `<wa-details>` | Expandable disclosure | [details](https://webawesome.com/docs/components/details/) |
| `<wa-divider>` | Visual separator | [divider](https://webawesome.com/docs/components/divider/) |
| `<wa-split-panel>` | Resizable split view | [split-panel](https://webawesome.com/docs/components/split-panel/) |
| `<wa-scroller>` | Scrollable container with controls | [scroller](https://webawesome.com/docs/components/scroller/) |

### Navigation

| Component | Description | Docs |
|-----------|-------------|------|
| `<wa-tab-group>` | Tabbed interface | [tab-group](https://webawesome.com/docs/components/tab-group/) |
| `<wa-breadcrumb>` | Navigation breadcrumbs | [breadcrumb](https://webawesome.com/docs/components/breadcrumb/) |
| `<wa-tree>` | Hierarchical tree view | [tree](https://webawesome.com/docs/components/tree/) |

### Imagery

| Component | Description | Docs |
|-----------|-------------|------|
| `<wa-icon>` | SVG icons (2000+ Font Awesome included) | [icon](https://webawesome.com/docs/components/icon/) |
| `<wa-avatar>` | User avatar with fallback | [avatar](https://webawesome.com/docs/components/avatar/) |
| `<wa-carousel>` | Image/content carousel | [carousel](https://webawesome.com/docs/components/carousel/) |
| `<wa-animated-image>` | Animated GIF/WebP with controls | [animated-image](https://webawesome.com/docs/components/animated-image/) |
| `<wa-comparison>` | Before/after image comparison | [comparison](https://webawesome.com/docs/components/comparison/) |
| `<wa-qr-code>` | Generate QR codes | [qr-code](https://webawesome.com/docs/components/qr-code/) |
| `<wa-zoomable-frame>` | Zoomable image container | [zoomable-frame](https://webawesome.com/docs/components/zoomable-frame/) |

### Formatters

| Component | Description | Docs |
|-----------|-------------|------|
| `<wa-format-bytes>` | Format byte values (KB, MB, etc.) | [format-bytes](https://webawesome.com/docs/components/format-bytes/) |
| `<wa-format-date>` | Localized date formatting | [format-date](https://webawesome.com/docs/components/format-date/) |
| `<wa-format-number>` | Localized number formatting | [format-number](https://webawesome.com/docs/components/format-number/) |
| `<wa-relative-time>` | Relative time display ("2 hours ago") | [relative-time](https://webawesome.com/docs/components/relative-time/) |

### Utilities

| Component | Description | Docs |
|-----------|-------------|------|
| `<wa-animation>` | Animate elements with built-in effects | [animation](https://webawesome.com/docs/components/animation/) |
| `<wa-popover>` | Anchored floating content | [popover](https://webawesome.com/docs/components/popover/) |
| `<wa-popup>` | Low-level positioning utility | [popup](https://webawesome.com/docs/components/popup/) |
| `<wa-include>` | Include external HTML | [include](https://webawesome.com/docs/components/include/) |
| `<wa-intersection-observer>` | Detect element visibility | [intersection-observer](https://webawesome.com/docs/components/intersection-observer/) |
| `<wa-mutation-observer>` | Detect DOM changes | [mutation-observer](https://webawesome.com/docs/components/mutation-observer/) |
| `<wa-resize-observer>` | Detect element resizing | [resize-observer](https://webawesome.com/docs/components/resize-observer/) |

---

## Common Patterns

### Form with Validation

```html
<form class="wa-stack">
  <wa-input label="Email" type="email" required></wa-input>
  <wa-textarea label="Message" required></wa-textarea>
  <wa-checkbox required>I agree to terms</wa-checkbox>
  <wa-button type="submit" variant="brand">Submit</wa-button>
</form>
```

### Card Grid

```html
<div class="wa-grid" style="--min-column-size: 280px;">
  <wa-card>
    <img slot="media" src="image.jpg" alt="" />
    <h3 slot="header">Title</h3>
    <p>Description text</p>
    <wa-button slot="footer" variant="brand">Action</wa-button>
  </wa-card>
</div>
```

### Dialog with Actions

```html
<wa-dialog label="Confirm" id="confirm-dialog">
  Are you sure you want to continue?
  <div slot="footer" class="wa-cluster">
    <wa-button data-dialog="close">Cancel</wa-button>
    <wa-button variant="danger" data-dialog="close">Delete</wa-button>
  </div>
</wa-dialog>

<wa-button data-dialog="open confirm-dialog">Open Dialog</wa-button>
```

### Navigation Tabs

```html
<wa-tab-group>
  <wa-tab panel="overview">Overview</wa-tab>
  <wa-tab panel="settings">Settings</wa-tab>

  <wa-tab-panel name="overview">Overview content</wa-tab-panel>
  <wa-tab-panel name="settings">Settings content</wa-tab-panel>
</wa-tab-group>
```

---

## Style Utilities

| Utility | Description | Docs |
|---------|-------------|------|
| Native Styles | Preset styles for native HTML elements | [native](https://webawesome.com/docs/utilities/native/) |
| Color | Color variant utility classes | [color](https://webawesome.com/docs/utilities/color/) |
| FOUCE | Prevent flash of unstyled content | [fouce](https://webawesome.com/docs/utilities/fouce/) |
| Rounding | Border radius utilities | [rounding](https://webawesome.com/docs/utilities/rounding/) |
| Text | Typography utilities | [text](https://webawesome.com/docs/utilities/text/) |
| Visually Hidden | Hide visually, keep accessible | [visually-hidden](https://webawesome.com/docs/utilities/visually-hidden/) |

---

## Resources

- **Documentation:** https://webawesome.com/docs
- **Components:** https://webawesome.com/docs/components
- **Design Tokens:** https://webawesome.com/docs/tokens/
- **Layout Utilities:** https://webawesome.com/docs/layout/
- **Figma Kit:** https://webawesome.com/docs/resources/figma/ (Pro)
