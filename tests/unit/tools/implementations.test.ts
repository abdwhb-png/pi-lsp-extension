/**
 * Tests for lsp_find_implementations tool.
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

const { createImplementationTool } = await import("../../../src/tools/implementations.js");

describe("lsp_find_implementations", () => {
  it("returns implementations when found (Location array)", async () => {
    const client = new MockLspClient();
    client.mockResponse("textDocument/implementation", [
      {
        uri: "file:///mock/project/src/concrete-a.ts",
        range: { start: { line: 10, character: 2 }, end: { line: 10, character: 10 } },
      },
      {
        uri: "file:///mock/project/src/concrete-b.ts",
        range: { start: { line: 20, character: 2 }, end: { line: 20, character: 10 } },
      },
    ]);

    const manager = createMockLspManager({
      clients: new Map([["typescript", client]]),
    });

    const tool = createImplementationTool(manager as any);
    const result = await tool.execute("call1", {
      path: "src/interface.ts",
      line: 5,
      character: 10,
    });

    expect(result.details?.count).toBe(2);
    expect(result.content?.[0]?.text).toContain("2 implementation(s) found");
    expect(result.content?.[0]?.text).toContain("concrete-a.ts");
    expect(result.content?.[0]?.text).toContain("concrete-b.ts");
  });

  it("returns implementations when found (LocationLink array)", async () => {
    const client = new MockLspClient();
    client.mockResponse("textDocument/implementation", [
      {
        targetUri: "file:///mock/project/src/impl.ts",
        targetSelectionRange: { start: { line: 15, character: 0 }, end: { line: 15, character: 12 } },
        targetRange: { start: { line: 15, character: 0 }, end: { line: 25, character: 1 } },
      },
    ]);

    const manager = createMockLspManager({
      clients: new Map([["typescript", client]]),
    });

    const tool = createImplementationTool(manager as any);
    const result = await tool.execute("call1", {
      path: "src/base.ts",
      line: 3,
      character: 7,
    });

    expect(result.details?.count).toBe(1);
    expect(result.content?.[0]?.text).toContain("1 implementation(s) found");
  });

  it('returns "No implementations found" when null', async () => {
    const client = new MockLspClient();
    client.mockResponse("textDocument/implementation", null);

    const manager = createMockLspManager({
      clients: new Map([["typescript", client]]),
    });

    const tool = createImplementationTool(manager as any);
    const result = await tool.execute("call1", {
      path: "src/empty.ts",
      line: 1,
      character: 1,
    });

    expect(result.details?.count).toBe(0);
    expect(result.content?.[0]?.text).toContain("No implementations found");
  });

  it("requires line/character or query", async () => {
    const manager = createMockLspManager();
    const tool = createImplementationTool(manager as any);

    const result = await tool.execute("call1", {
      path: "src/test.ts",
    });

    expect(result.details?.count).toBe(0);
    expect(result.content?.[0]?.text).toContain("Either line/character or query is required");
  });
});