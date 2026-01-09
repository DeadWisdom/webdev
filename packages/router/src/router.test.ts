import { test, expect, describe } from "bun:test";
import { matchUrlPattern } from "./router";

describe("matchUrlPattern", () => {
  test("matches simple pathname patterns", () => {
    const url = new URL("https://example.com/users");
    const result = matchUrlPattern(url, "/users");
    expect(result).toBeDefined();
  });

  test("extracts named parameters", () => {
    const url = new URL("https://example.com/users/123");
    const result = matchUrlPattern(url, "/users/:id");
    expect(result).toBeDefined();
    expect(result?.id).toBe("123");
  });

  test("extracts multiple parameters", () => {
    const url = new URL("https://example.com/users/123/posts/456");
    const result = matchUrlPattern(url, "/users/:userId/posts/:postId");
    expect(result).toBeDefined();
    expect(result?.userId).toBe("123");
    expect(result?.postId).toBe("456");
  });

  test("returns undefined for non-matching patterns", () => {
    const url = new URL("https://example.com/products");
    const result = matchUrlPattern(url, "/users");
    expect(result).toBeUndefined();
  });

  test("works with URLPattern objects", () => {
    const url = new URL("https://example.com/items/abc");
    const pattern = new URLPattern({ pathname: "/items/:id" });
    const result = matchUrlPattern(url, pattern);
    expect(result).toBeDefined();
    expect(result?.id).toBe("abc");
  });

  test("works with URLPatternInit objects", () => {
    const url = new URL("https://example.com/api/data");
    const result = matchUrlPattern(url, { pathname: "/api/:resource" });
    expect(result).toBeDefined();
    expect(result?.resource).toBe("data");
  });

  test("handles wildcard patterns", () => {
    const url = new URL("https://example.com/files/path/to/file.txt");
    const result = matchUrlPattern(url, "/files/*");
    expect(result).toBeDefined();
  });

  test("includes _match property with full match data", () => {
    const url = new URL("https://example.com/test/value");
    const result = matchUrlPattern(url, "/test/:param");
    expect(result).toBeDefined();
    expect(result?._match).toBeDefined();
  });
});
