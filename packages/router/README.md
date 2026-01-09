# @deadwisdom/router

A lightweight, Lit-based router with full URLPattern support for building single-page applications.

## Features

- **Lit Integration** - Works as a reactive controller with Lit elements
- **URLPattern Support** - Full support for the [URLPattern API](https://developer.mozilla.org/en-US/docs/Web/API/URLPattern)
- **Browser History** - Automatic integration with the History API
- **Link Interception** - Automatically intercepts clicks on internal links
- **Async Loading** - Support for async data loading with cleanup functions
- **Multiple Patterns** - Define multiple URL patterns per route
- **TypeScript** - Full type definitions included

## Installation

```bash
bun add @deadwisdom/router
```

## Quick Start

```typescript
import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import { WindowRouter } from "@deadwisdom/router";

@customElement("my-app")
class MyApp extends LitElement {
  router = new WindowRouter(this, [
    {
      pattern: "/",
      render: () => html`<home-page></home-page>`,
    },
    {
      pattern: "/about",
      render: () => html`<about-page></about-page>`,
    },
    {
      pattern: "/users/:id",
      render: (params) => html`<user-page userId=${params.id}></user-page>`,
    },
  ]);

  render() {
    return html`
      <nav>
        <a href="/">Home</a>
        <a href="/about">About</a>
        <a href="/users/123">User 123</a>
      </nav>
      <main>${this.router.render()}</main>
    `;
  }
}
```

## API Reference

### WindowRouter

The main router class for browser-based SPAs. Extends `Router` with browser history integration.

```typescript
import { WindowRouter } from "@deadwisdom/router";

const router = new WindowRouter(hostElement, routes);
```

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `url` | `URL` | Current active URL |
| `initialURL` | `URL` | URL when the router was initialized |
| `activeRoute` | `Route \| undefined` | Currently active route |
| `activeParams` | `URLParams \| undefined` | Parameters extracted from the current URL |
| `loading` | `boolean` | Whether a route is currently loading |
| `error` | `Error \| undefined` | Error from the last load operation |
| `routes` | `Route[]` | Array of route configurations |

#### Methods

##### `navigate(url, state?)`

Navigate to a new URL, pushing to browser history.

```typescript
router.navigate("/users/456");
router.navigate("/dashboard", { from: "login" });
```

##### `replace(url, state?)`

Navigate to a new URL, replacing the current history entry.

```typescript
router.replace("/login"); // Won't add to history
```

##### `reload()`

Re-activate the current route (useful after data changes).

```typescript
router.reload();
```

##### `render()`

Render the active route. Call this in your component's render method.

```typescript
render() {
  return html`<main>${this.router.render()}</main>`;
}
```

##### `findRoute(url)`

Find a matching route without activating it.

```typescript
const match = router.findRoute("/users/123");
if (match) {
  console.log(match.route.name);
  console.log(match.params.id); // "123"
}
```

##### `hasChanged()`

Check if the URL has changed from the initial URL.

```typescript
if (router.hasChanged()) {
  console.log("User has navigated away from initial page");
}
```

### Router

Base router class without browser history integration. Useful for nested routers or non-browser environments.

```typescript
import { Router } from "@deadwisdom/router";

const router = new Router(hostElement, routes);
router.activateURL("/some/path");
```

#### Methods

##### `activateURL(url)`

Manually activate a URL.

```typescript
router.activateURL("/users/123");
```

##### `activateRoute(route, params)`

Directly activate a specific route with parameters.

```typescript
const match = router.findRoute("/users/123");
if (match) {
  router.activateRoute(match.route, match.params);
}
```

### Route Configuration

Each route is an object with the following properties:

```typescript
interface Route {
  name?: string;                              // Optional route name
  pattern: RoutePatternValue | RoutePatternValue[];  // URL pattern(s)
  render: (params: URLParams) => any;         // Render function
  load?: (params: URLParams) => Promise<() => void> | void;  // Optional loader
}
```

### matchUrlPattern

Utility function to match a URL against a pattern.

```typescript
import { matchUrlPattern } from "@deadwisdom/router";

const params = matchUrlPattern(
  new URL("https://example.com/users/123"),
  "/users/:id"
);

console.log(params?.id); // "123"
```

## Examples

### Basic Routing

```typescript
import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import { WindowRouter } from "@deadwisdom/router";

@customElement("my-app")
class MyApp extends LitElement {
  router = new WindowRouter(this, [
    {
      name: "home",
      pattern: "/",
      render: () => html`<h1>Welcome Home</h1>`,
    },
    {
      name: "about",
      pattern: "/about",
      render: () => html`<h1>About Us</h1>`,
    },
    {
      name: "contact",
      pattern: "/contact",
      render: () => html`<h1>Contact</h1>`,
    },
  ]);

  render() {
    return html`
      <nav>
        <a href="/">Home</a>
        <a href="/about">About</a>
        <a href="/contact">Contact</a>
      </nav>
      ${this.router.render()}
    `;
  }
}
```

### URL Parameters

Extract dynamic segments from URLs using `:paramName` syntax.

```typescript
const router = new WindowRouter(this, [
  {
    pattern: "/users/:userId",
    render: (params) => html`
      <user-profile userId=${params.userId}></user-profile>
    `,
  },
  {
    pattern: "/posts/:postId/comments/:commentId",
    render: (params) => html`
      <comment-view
        postId=${params.postId}
        commentId=${params.commentId}
      ></comment-view>
    `,
  },
  {
    pattern: "/files/*",
    render: (params) => html`
      <file-browser path=${params[0]}></file-browser>
    `,
  },
]);
```

### Multiple Patterns Per Route

A single route can match multiple URL patterns.

```typescript
const router = new WindowRouter(this, [
  {
    name: "home",
    pattern: ["/", "/home", "/index"],
    render: () => html`<home-page></home-page>`,
  },
  {
    name: "user-profile",
    pattern: ["/users/:id", "/u/:id", "/@:id"],
    render: (params) => html`<user-page userId=${params.id}></user-page>`,
  },
]);
```

### Async Data Loading

Load data before rendering a route. The `load` function can return a cleanup function.

```typescript
const router = new WindowRouter(this, [
  {
    pattern: "/users/:id",
    load: async (params) => {
      // Fetch data before rendering
      const response = await fetch(`/api/users/${params.id}`);
      const user = await response.json();

      // Store data somewhere accessible to render
      this.currentUser = user;

      // Return cleanup function (optional)
      return () => {
        this.currentUser = null;
      };
    },
    render: (params) => html`
      <user-profile .user=${this.currentUser}></user-profile>
    `,
  },
]);
```

### Loading States

Show loading indicators while async routes load.

```typescript
@customElement("my-app")
class MyApp extends LitElement {
  router = new WindowRouter(this, [
    {
      pattern: "/dashboard",
      load: async () => {
        await this.loadDashboardData();
      },
      render: () => html`<dashboard-page></dashboard-page>`,
    },
  ]);

  render() {
    if (this.router.loading) {
      return html`<loading-spinner></loading-spinner>`;
    }

    if (this.router.error) {
      return html`<error-page .error=${this.router.error}></error-page>`;
    }

    return this.router.render();
  }
}
```

### Error Handling

Handle errors that occur during route loading.

```typescript
@customElement("my-app")
class MyApp extends LitElement {
  router = new WindowRouter(this, [
    {
      pattern: "/data/:id",
      load: async (params) => {
        const response = await fetch(`/api/data/${params.id}`);
        if (!response.ok) {
          throw new Error(`Failed to load data: ${response.status}`);
        }
        this.data = await response.json();
      },
      render: () => html`<data-view .data=${this.data}></data-view>`,
    },
  ]);

  render() {
    if (this.router.error) {
      return html`
        <div class="error">
          <h2>Error Loading Page</h2>
          <p>${this.router.error.message}</p>
          <button @click=${() => this.router.reload()}>Retry</button>
        </div>
      `;
    }
    return this.router.render();
  }
}
```

### Programmatic Navigation

Navigate programmatically from event handlers.

```typescript
@customElement("my-app")
class MyApp extends LitElement {
  router = new WindowRouter(this, [/* routes */]);

  handleLogin() {
    // After successful login
    this.router.navigate("/dashboard");
  }

  handleLogout() {
    // Replace history so back button doesn't go to authenticated page
    this.router.replace("/login");
  }

  render() {
    return html`
      <button @click=${this.handleLogin}>Login</button>
      <button @click=${this.handleLogout}>Logout</button>
      ${this.router.render()}
    `;
  }
}
```

### URLPattern Objects

Use full URLPattern objects for advanced matching.

```typescript
const router = new WindowRouter(this, [
  {
    // Match any subdomain
    pattern: new URLPattern({
      hostname: "*.example.com",
      pathname: "/api/*",
    }),
    render: () => html`<api-docs></api-docs>`,
  },
  {
    // Match with query parameters
    pattern: {
      pathname: "/search",
      search: "q=:query",
    },
    render: (params) => html`
      <search-results query=${params.query}></search-results>
    `,
  },
]);
```

### Nested Routers

Use the base `Router` class for nested routing scenarios.

```typescript
@customElement("admin-section")
class AdminSection extends LitElement {
  // Nested router for admin routes
  router = new Router(this, [
    {
      pattern: "/admin",
      render: () => html`<admin-dashboard></admin-dashboard>`,
    },
    {
      pattern: "/admin/users",
      render: () => html`<admin-users></admin-users>`,
    },
    {
      pattern: "/admin/settings",
      render: () => html`<admin-settings></admin-settings>`,
    },
  ]);

  connectedCallback() {
    super.connectedCallback();
    // Manually activate based on current URL
    this.router.activateURL(window.location.pathname);
  }

  render() {
    return html`
      <nav>
        <a href="/admin">Dashboard</a>
        <a href="/admin/users">Users</a>
        <a href="/admin/settings">Settings</a>
      </nav>
      ${this.router.render()}
    `;
  }
}
```

### Dynamic Routes

Generate routes dynamically based on application state.

```typescript
@customElement("my-app")
class MyApp extends LitElement {
  private userRole = "admin";

  router = new WindowRouter(this, () => this.getRoutes());

  getRoutes() {
    const routes = [
      { pattern: "/", render: () => html`<home-page></home-page>` },
      { pattern: "/profile", render: () => html`<profile-page></profile-page>` },
    ];

    // Add admin routes only for admin users
    if (this.userRole === "admin") {
      routes.push({
        pattern: "/admin",
        render: () => html`<admin-page></admin-page>`,
      });
    }

    return routes;
  }

  render() {
    return this.router.render();
  }
}
```

### 404 Not Found

Handle unmatched routes with a catch-all pattern.

```typescript
const router = new WindowRouter(this, [
  { pattern: "/", render: () => html`<home-page></home-page>` },
  { pattern: "/about", render: () => html`<about-page></about-page>` },

  // Catch-all for 404 - must be last!
  {
    pattern: "/*",
    render: () => html`
      <div class="not-found">
        <h1>404 - Page Not Found</h1>
        <a href="/">Go Home</a>
      </div>
    `,
  },
]);
```

### Route Guards

Implement authentication guards with the load function.

```typescript
const requireAuth = async () => {
  const isAuthenticated = await checkAuthStatus();
  if (!isAuthenticated) {
    // Redirect to login
    window.location.href = "/login";
    throw new Error("Not authenticated");
  }
};

const router = new WindowRouter(this, [
  {
    pattern: "/login",
    render: () => html`<login-page></login-page>`,
  },
  {
    pattern: "/dashboard",
    load: requireAuth,
    render: () => html`<dashboard-page></dashboard-page>`,
  },
  {
    pattern: "/settings",
    load: requireAuth,
    render: () => html`<settings-page></settings-page>`,
  },
]);
```

### Preserving Scroll Position

Manage scroll position during navigation.

```typescript
@customElement("my-app")
class MyApp extends LitElement {
  private scrollPositions = new Map<string, number>();

  router = new WindowRouter(this, [/* routes */]);

  connectedCallback() {
    super.connectedCallback();

    // Save scroll position before navigation
    window.addEventListener("beforeunload", () => {
      this.scrollPositions.set(
        this.router.url.pathname,
        window.scrollY
      );
    });
  }

  updated() {
    // Restore scroll position after route change
    const savedPosition = this.scrollPositions.get(
      this.router.url.pathname
    );
    window.scrollTo(0, savedPosition ?? 0);
  }

  render() {
    return this.router.render();
  }
}
```

### Using with matchUrlPattern

The `matchUrlPattern` utility can be used standalone for URL matching logic.

```typescript
import { matchUrlPattern } from "@deadwisdom/router";

// Simple pathname matching
const params1 = matchUrlPattern(
  new URL("https://example.com/users/42"),
  "/users/:id"
);
console.log(params1?.id); // "42"

// With URLPattern object
const params2 = matchUrlPattern(
  new URL("https://api.example.com/v1/data"),
  new URLPattern({ hostname: "api.*", pathname: "/v1/*" })
);

// With URLPatternInit
const params3 = matchUrlPattern(
  new URL("https://example.com/search?q=hello"),
  { pathname: "/search", search: "q=:query" }
);
console.log(params3?.query); // "hello"

// Access full match data
const params4 = matchUrlPattern(
  new URL("https://example.com/test"),
  "/test"
);
console.log(params4?._match); // Full URLPattern match result
```

## Link Behavior

The `WindowRouter` automatically intercepts clicks on anchor tags with `href` attributes pointing to the same origin. This enables SPA-style navigation without full page reloads.

**Links that ARE intercepted:**
```html
<a href="/about">About</a>
<a href="/users/123">User</a>
```

**Links that are NOT intercepted:**
```html
<!-- External links -->
<a href="https://google.com">Google</a>

<!-- Links with target attribute -->
<a href="/page" target="_blank">New Tab</a>

<!-- Modified clicks (Ctrl+click, etc.) -->
<!-- These open in new tabs as expected -->
```

## TypeScript Types

```typescript
import type {
  Route,
  RouteMatch,
  RouteConfig,
  RoutePatternValue,
  URLPatternInput,
  URLParams,
} from "@deadwisdom/router";
```

## Browser Support

This router uses the [URLPattern API](https://developer.mozilla.org/en-US/docs/Web/API/URLPattern) which is supported in:
- Chrome 95+
- Edge 95+
- Safari 18.2+ (with flag)
- Firefox (behind flag)

For broader support, consider using the [urlpattern-polyfill](https://github.com/kenchris/urlpattern-polyfill).

## License

MIT
