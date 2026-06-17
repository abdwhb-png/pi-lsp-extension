/**
 * Tests for lsp_goto_type_definition tool.
 */

import { describe, it, expect, mock } from "bun:test";
import { MockLspClient, createMockLspManager } from "../../helpers/mock-lsp-client.js";

// Mock the pi peer dependencies
mock.module("@earendil-works/pi-coding-agent", () => ({
  truncateHead: (text: string) => ({ content: text }),
  DEFAULT_MAX_LINES: 200,
  DEFAULT_MAX_BYTES: 64000,
}));

mock.module("@earendil-works/pi-tui", () => ({
  Text: { raw: (s: string) => s },
}));

const { createTypeDefinitionTool } = await import("../../../src/tools/type-definition.js");

describe("lsp_goto_type_definition", () => {
  it("returns type definition location when found (single Location)", async () => {
    const client = new MockLspClient();
    client.mockResponse("textDocument/typeDefinition", {
      uri: "file:///mock/project/src/types.ts",
      range: { start: { line: 4, character: 5 }, end: { line: 4, character: 20 } },
    });

    const manager = createMockLspManager({
      clients: new Map([["typescript", client]]),
    });

    const tool = createTypeDefinitionTool(manager as any);
    const result = await tool.execute("call1", {
      path: "src/app.ts",
      line: 10,
      character: 15,
    });

    expect(result.details?.count).toBe(1);
    expect(result.content?.[0]?.text).toContain("Type definition(s):");
    expect(result.content?.[0]?.text).toContain("src/types.ts:5:6");
  });

  it("returns type definition location when found (single LocationLink)", async () => {
    const client = new MockLspClient();
    client.mockResponse("textDocument/typeDefinition", [
      {
        targetUri: "file:///mock/project/src/interfaces.ts",
        targetSelectionRange: { start: { line: 2, character: 0 }, end: { line: 2, character: 15 } },
        targetRange: { start: { line: 2, character: 0 }, end: { line: 6, character: 1 } },
      },
    ]);

    const manager = createMockLspManager({
      clients: new Map([["typescript", client]]),
    });

    const tool = createTypeDefinitionTool(manager as any);
    const result = await tool.execute("call1", {
      path: "src/app.ts",
      line: 5,
      character: 8,
    });

    expect(result.details?.count).toBe(1);
    expect(result.content?.[0]?.text).toContain("src/interfaces.ts:3:1");
  });

  it('returns "No type definition found" when null', async () => {
    const client = new MockLspClient();
    client.mockResponse("textDocument/typeDefinition", null);

    const manager = createMockLspManager({
      clients: new Map([["typescript", client]]),
    });

    const tool = createTypeDefinitionTool(manager as any);
    const result = await tool.execute("call1", {
      path: "src/app.ts",
      line: 1,
      character: 1,
    });

    expect(result.details?.count).toBe(0);
    expect(result.content?.[0]?.text).toContain("No type definition found");
  });

  it("returns error when no LSP server is available", async () => {
    const manager = createMockLspManager({
      clients: new Map(),
    });

    (manager.getUnavailableReason as any) = mock(() => "No LSP configured for .txt");

    const tool = createTypeDefinitionTool(manager as any);
    const result = await tool.execute("call1", {
      path: "README.txt",
      line: 1,
      character: 1,
    });

    expect(result.details?.count).toBe(0);
  });
});