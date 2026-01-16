# Lit Components Reference Guide

Lit is a lightweight library for building fast, reactive web components. It uses tagged template literals for declarative rendering and provides minimal boilerplate.

## Installation

```bash
bun add lit
```

## Basic Component

```typescript
import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('the-greeting')
export class TheGreeting extends LitElement {
  static styles = css`
    :host {
      display: block;
      padding: 16px;
    }
    .name {
      color: blue;
    }
  `;

  @property() name = 'World';

  render() {
    return html`<p>Hello, <span class="name">${this.name}</span>!</p>`;
  }
}
```

```html
<the-greeting name="Alice"></the-greeting>
```

---

## Properties & Attributes

### @property Decorator

Reactive properties trigger re-renders when changed. By default, they sync with HTML attributes.

```typescript
@property() name: string = '';           // String, syncs to attribute
@property({ type: Number }) count = 0;   // Number, converts from attribute
@property({ type: Boolean }) active = false;  // Boolean
@property({ type: Array }) items: string[] = [];  // Array
@property({ type: Object }) config = {};  // Object

// Attribute options
@property({ attribute: 'full-name' }) fullName = '';  // Custom attribute name
@property({ attribute: false }) data = {};  // No attribute, JS-only
@property({ reflect: true }) status = '';   // Reflect changes back to attribute
```

### @state Decorator

Internal reactive state that doesn't create an attribute.

```typescript
import { state } from 'lit/decorators.js';

@state() private _loading = false;
@state() private _error: Error | null = null;
```

---

## Templates

### Expressions

```typescript
render() {
  return html`
    <!-- Text content -->
    <p>${this.message}</p>

    <!-- Attribute binding -->
    <input type="text" value=${this.value}>

    <!-- Boolean attribute (present/absent) -->
    <button ?disabled=${this.isDisabled}>Submit</button>

    <!-- Property binding (for non-string values) -->
    <the-component .items=${this.itemArray}></the-component>

    <!-- Event listener -->
    <button @click=${this._handleClick}>Click</button>

    <!-- Attribute spread (lit-html directive) -->
    <div ${ref(this._divRef)}></div>
  `;
}
```

### Conditionals

```typescript
render() {
  return html`
    ${this.loading
      ? html`<wa-spinner></wa-spinner>`
      : html`<div>${this.content}</div>`
    }

    ${this.error ? html`<wa-callout variant="danger">${this.error}</wa-callout>` : ''}
  `;
}
```

### Lists

```typescript
render() {
  return html`
    <ul>
      ${this.items.map(item => html`<li>${item.name}</li>`)}
    </ul>
  `;
}
```

Use `repeat()` for efficient keyed updates:

```typescript
import { repeat } from 'lit/directives/repeat.js';

render() {
  return html`
    <ul>
      ${repeat(
        this.items,
        item => item.id,  // Key function
        item => html`<li>${item.name}</li>`
      )}
    </ul>
  `;
}
```

### Slots

```typescript
render() {
  return html`
    <div class="card">
      <header><slot name="header">Default Header</slot></header>
      <main><slot></slot></main>  <!-- Default slot -->
      <footer><slot name="footer"></slot></footer>
    </div>
  `;
}
```

```html
<the-card>
  <h2 slot="header">Title</h2>
  <p>Main content goes in default slot</p>
  <button slot="footer">Action</button>
</the-card>
```

---

## Styling

### Static Styles

```typescript
static styles = css`
  :host {
    display: block;
    --the-color: blue;
  }

  :host([hidden]) {
    display: none;
  }

  :host(:hover) {
    background: #f0f0f0;
  }

  /* Style slotted content */
  ::slotted(p) {
    margin: 0;
  }

  ::slotted(*) {
    color: inherit;
  }
`;
```

### Multiple Style Sheets

```typescript
static styles = [
  baseStyles,  // Imported shared styles
  css`
    /* Component-specific styles */
  `,
];
```

### Dynamic Classes

```typescript
import { classMap } from 'lit/directives/class-map.js';

render() {
  const classes = {
    active: this.active,
    disabled: this.disabled,
    'has-error': this.error != null,
  };
  return html`<div class=${classMap(classes)}>...</div>`;
}
```

### Dynamic Styles

```typescript
import { styleMap } from 'lit/directives/style-map.js';

render() {
  const styles = {
    color: this.color,
    '--size': `${this.size}px`,
  };
  return html`<div style=${styleMap(styles)}>...</div>`;
}
```

---

## Lifecycle

```typescript
export class TheComponent extends LitElement {
  // Called when element added to DOM
  connectedCallback() {
    super.connectedCallback();
    // Setup: add listeners, start timers
  }

  // Called when element removed from DOM
  disconnectedCallback() {
    super.disconnectedCallback();
    // Cleanup: remove listeners, clear timers
  }

  // Called when a property changes, before render
  willUpdate(changedProperties: PropertyValues) {
    if (changedProperties.has('items')) {
      this._sortedItems = this._sortItems(this.items);
    }
  }

  // Called after render completes
  updated(changedProperties: PropertyValues) {
    if (changedProperties.has('open') && this.open) {
      this._focusFirstInput();
    }
  }

  // Called once after first render
  firstUpdated() {
    // One-time DOM setup
  }
}
```

---

## Events

### Dispatching Custom Events

```typescript
private _handleClick() {
  this.dispatchEvent(new CustomEvent('the-event', {
    detail: { value: this.value },
    bubbles: true,
    composed: true,  // Cross shadow DOM boundary
  }));
}
```

### Listening to Events

```typescript
// In template
html`<button @click=${this._onClick}>Click</button>`

// Or in connectedCallback for external events
connectedCallback() {
  super.connectedCallback();
  window.addEventListener('resize', this._onResize);
}

disconnectedCallback() {
  super.disconnectedCallback();
  window.removeEventListener('resize', this._onResize);
}
```

---

## Refs & DOM Access

### Query Decorators

```typescript
import { query, queryAll, queryAsync } from 'lit/decorators.js';

@query('#input') private _input!: HTMLInputElement;
@queryAll('.item') private _items!: NodeListOf<HTMLElement>;
@queryAsync('#lazy') private _lazyEl!: Promise<HTMLElement>;
```

### Ref Directive

```typescript
import { ref, createRef, Ref } from 'lit/directives/ref.js';

private _inputRef: Ref<HTMLInputElement> = createRef();

render() {
  return html`<input ${ref(this._inputRef)}>`;
}

private _focus() {
  this._inputRef.value?.focus();
}
```

---

## Async & Tasks

### Task Controller

Handle async data fetching with built-in loading/error states.

```typescript
import { Task } from '@lit/task';

export class UserProfile extends LitElement {
  @property() userId!: string;

  private _userTask = new Task(this, {
    args: () => [this.userId],
    task: async ([userId]) => {
      const response = await fetch(`/api/users/${userId}`);
      if (!response.ok) throw new Error('Failed to load');
      return response.json();
    },
  });

  render() {
    return this._userTask.render({
      pending: () => html`<wa-spinner></wa-spinner>`,
      complete: (user) => html`<p>${user.name}</p>`,
      error: (e) => html`<wa-callout variant="danger">${e.message}</wa-callout>`,
    });
  }
}
```

---

## Controllers

Reusable logic that hooks into component lifecycle.

```typescript
import { ReactiveController, ReactiveControllerHost } from 'lit';

export class ClockController implements ReactiveController {
  host: ReactiveControllerHost;
  value = new Date();
  private _timer?: number;

  constructor(host: ReactiveControllerHost) {
    this.host = host;
    host.addController(this);
  }

  hostConnected() {
    this._timer = window.setInterval(() => {
      this.value = new Date();
      this.host.requestUpdate();
    }, 1000);
  }

  hostDisconnected() {
    clearInterval(this._timer);
  }
}

// Usage
export class TheClock extends LitElement {
  private _clock = new ClockController(this);

  render() {
    return html`<p>${this._clock.value.toLocaleTimeString()}</p>`;
  }
}
```

---

## Common Directives

```typescript
import { ifDefined } from 'lit/directives/if-defined.js';
import { guard } from 'lit/directives/guard.js';
import { cache } from 'lit/directives/cache.js';
import { until } from 'lit/directives/until.js';
import { live } from 'lit/directives/live.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

render() {
  return html`
    <!-- Only set attribute if value defined -->
    <img src=${ifDefined(this.src)}>

    <!-- Prevent re-render unless deps change -->
    ${guard([this.items], () => this._expensiveRender())}

    <!-- Cache DOM when switching templates -->
    ${cache(this.view === 'a' ? html`<view-a></view-a>` : html`<view-b></view-b>`)}

    <!-- Show placeholder until promise resolves -->
    ${until(this._fetchData(), html`Loading...`)}

    <!-- Sync input value with live DOM value -->
    <input .value=${live(this.value)}>

    <!-- Render raw HTML (use with caution) -->
    ${unsafeHTML(this.htmlContent)}
  `;
}
```

---

## TypeScript Configuration

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "useDefineForClassFields": false
  }
}
```

---

## Patterns

### Form Component

```typescript
@customElement('the-form')
export class TheForm extends LitElement {
  @state() private _formData = { name: '', email: '' };

  private _handleInput(field: string, e: Event) {
    const target = e.target as HTMLInputElement;
    this._formData = { ...this._formData, [field]: target.value };
  }

  private _handleSubmit(e: Event) {
    e.preventDefault();
    this.dispatchEvent(new CustomEvent('submit', {
      detail: this._formData,
      bubbles: true,
    }));
  }

  render() {
    return html`
      <form @submit=${this._handleSubmit} class="wa-stack">
        <wa-input
          label="Name"
          .value=${this._formData.name}
          @input=${(e: Event) => this._handleInput('name', e)}
        ></wa-input>
        <wa-input
          label="Email"
          type="email"
          .value=${this._formData.email}
          @input=${(e: Event) => this._handleInput('email', e)}
        ></wa-input>
        <wa-button type="submit" variant="brand">Submit</wa-button>
      </form>
    `;
  }
}
```

### Context Provider/Consumer

```typescript
import { createContext, provide, consume } from '@lit/context';

// Define context
export const themeContext = createContext<'light' | 'dark'>('theme');

// Provider component
@customElement('theme-provider')
export class ThemeProvider extends LitElement {
  @provide({ context: themeContext })
  @property()
  theme: 'light' | 'dark' = 'light';
}

// Consumer component
@customElement('themed-button')
export class ThemedButton extends LitElement {
  @consume({ context: themeContext, subscribe: true })
  theme!: 'light' | 'dark';

  render() {
    return html`<button class=${this.theme}>Click</button>`;
  }
}
```

---

## Resources

- **Documentation:** https://lit.dev/docs/
- **Playground:** https://lit.dev/playground/
- **Tutorial:** https://lit.dev/tutorials/intro-to-lit/
- **API Reference:** https://lit.dev/docs/api/
