/**
 * Tests for lsp_find_symbol tool.
 */

import { describe, it, expect, mock } from "bun:test";
import { MockLspClient, createMockLspManager } from "../../helpers/mock-lsp-client.js";

mock.module("@earendil-works/pi-coding-agent", () => ({
  truncateHead: (text: string) => ({ content: text }),
  DEFAULT_MAX_LINES: 200,
  DEFAULT_MAX_BYTES: 64000,
}));

mock.module("@earendil-works/pi-tui", () => ({
  Text: { raw: (s: string) => s },
}));

const { createFindSymbolTool } = await import("../../../src/tools/find-symbol.js");

describe("lsp_find_symbol", () => {
  it("finds symbols across all running servers", async () => {
    const tsClient = new MockLspClient("typescript");
    tsClient.mockResponse("workspace/symbol", [
      {
        name: "calculateTotal",
        kind: 12, // Function
        location: {
          uri: "file:///mock/project/src/math.ts",
          range: { start: { line: 5, character: 0 }, end: { line: 5, character: 14 } },
        },
        containerName: "math",
      },
      {
        name: "calculateDiscount",
        kind: 12,
        location: {
          uri: "file:///mock/project/src/pricing.ts",
          range: { start: { line: 10, character: 0 }, end: { line: 10, character: 17 } },
        },
      },
    ]);

    const pyClient = new MockLspClient("python");
    pyClient.mockResponse("workspace/symbol", [
      {
        name: "calculate_tax",
        kind: 12,
        location: {
          uri: "file:///mock/project/src/tax.py",
          range: { start: { line: 3, character: 4 }, end: { line: 3, character: 17 } },
        },
      },
    ]);

    const manager = createMockLspManager({
      clients: new Map([
        ["typescript", tsClient],
        ["python", pyClient],
      ]),
    });

    const tool = createFindSymbolTool(manager as any);
    const result = await tool.execute("call1", { query: "calculate" });

    expect(result.details?.count).toBe(3);
    expect(result.content?.[0]?.text).toContain("3 symbol(s)");
    expect(result.content?.[0]?.text).toContain("calculateTotal");
    expect(result.content?.[0]?.text).toContain("calculateDiscount");
    expect(result.content?.[0]?.text).toContain("calculate_tax");
  });

  it("filters by language", async () => {
    const tsClient = new MockLspClient("typescript");
    tsClient.mockResponse("workspace/symbol", [
      {
        name: "MyClass",
        kind: 5,
        location: {
          uri: "file:///mock/project/src/classes.ts",
          range: { start: { line: 1, character: 0 }, end: { line: 1, character: 7 } },
        },
      },
    ]);

    const pyClient = new MockLspClient("python");

    const manager = createMockLspManager({
      clients: new Map([
        ["typescript", tsClient],
        ["python", pyClient],
      ]),
    });

    const tool = createFindSymbolTool(manager as any);
    const result = await tool.execute("call1", { query: "MyClass", language: "typescript" });

    expect(result.details?.count).toBe(1);
  });

  it('returns "No symbols found" when no matches', async () => {
    const client = new MockLspClient();
    client.mockResponse("workspace/symbol", []);

    const manager = createMockLspManager({
      clients: new Map([["typescript", client]]),
    });

    const tool = createFindSymbolTool(manager as any);
    const result = await tool.execute("call1", { query: "nonexistent" });

    expect(result.details?.count).toBe(0);
    expect(result.content?.[0]?.text).toContain("No symbols found");
  });

  it("handles servers that don't support workspace/symbol gracefully", async () => {
    const client = new MockLspClient();
    client.mockResponse("workspace/symbol", null);

    const manager = createMockLspManager({
      clients: new Map([["typescript", client]]),
    });

    const tool = createFindSymbolTool(manager as any);
    const result = await tool.execute("call1", { query: "test" });

    expect(result.details?.count).toBe(0);
  });
});