/**
 * Tests for lsp_workspace_diagnostics tool.
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

const { createWorkspaceDiagnosticsTool } = await import("../../../src/tools/workspace-diagnostics.js");

describe("lsp_workspace_diagnostics", () => {
  it("aggregates diagnostics from all running servers", async () => {
    const tsClient = new MockLspClient("typescript");
    tsClient.setDiagnostics("file:///mock/project/src/app.ts", [
      {
        severity: 1, // Error
        message: "Type 'string' is not assignable to type 'number'",
        range: { start: { line: 5, character: 10 }, end: { line: 5, character: 20 } },
        source: "typescript",
      },
      {
        severity: 2, // Warning
        message: "Unused variable 'x'",
        range: { start: { line: 3, character: 6 }, end: { line: 3, character: 7 } },
        source: "eslint",
      },
    ]);

    const pyClient = new MockLspClient("python");
    pyClient.setDiagnostics("file:///mock/project/src/utils.py", [
      {
        severity: 1, // Error
        message: "SyntaxError: invalid syntax",
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } },
      },
    ]);

    const manager = createMockLspManager({
      clients: new Map([
        ["typescript", tsClient],
        ["python", pyClient],
      ]),
    });

    const tool = createWorkspaceDiagnosticsTool(manager as any);
    const result = await tool.execute("call1", {});

    expect(result.details?.errors).toBe(2);
    expect(result.details?.warnings).toBe(1);
    expect(result.details?.files).toBe(2);
    expect(result.content?.[0]?.text).toContain("2 error(s)");
    expect(result.content?.[0]?.text).toContain("1 warning(s)");
    expect(result.content?.[0]?.text).toContain("## typescript");
    expect(result.content?.[0]?.text).toContain("## python");
  });

  it("filters by severity", async () => {
    const client = new MockLspClient("typescript");
    client.setDiagnostics("file:///mock/project/src/app.ts", [
      {
        severity: 1, // Error
        message: "Type error",
        range: { start: { line: 1, character: 1 }, end: { line: 1, character: 2 } },
      },
      {
        severity: 2, // Warning
        message: "Unused variable",
        range: { start: { line: 2, character: 1 }, end: { line: 2, character: 2 } },
      },
    ]);

    const manager = createMockLspManager({
      clients: new Map([["typescript", client]]),
    });

    const tool = createWorkspaceDiagnosticsTool(manager as any);
    const result = await tool.execute("call1", { severity: "error" });

    // Errors are still counted in details from unfiltered diagnostics
    expect(result.details?.errors).toBe(1);
    expect(result.details?.warnings).toBe(1);
    // But only errors are displayed
    expect(result.content?.[0]?.text).toContain("Type error");
    expect(result.content?.[0]?.text).not.toContain("Unused variable");
  });

  it("filters by language", async () => {
    const tsClient = new MockLspClient("typescript");
    tsClient.setDiagnostics("file:///mock/project/src/app.ts", [
      {
        severity: 1,
        message: "TS error",
        range: { start: { line: 1, character: 1 }, end: { line: 1, character: 2 } },
      },
    ]);

    const pyClient = new MockLspClient("python");
    pyClient.setDiagnostics("file:///mock/project/src/main.py", [
      {
        severity: 1,
        message: "Python error",
        range: { start: { line: 1, character: 1 }, end: { line: 1, character: 2 } },
      },
    ]);

    const manager = createMockLspManager({
      clients: new Map([
        ["typescript", tsClient],
        ["python", pyClient],
      ]),
    });

    const tool = createWorkspaceDiagnosticsTool(manager as any);
    const result = await tool.execute("call1", { language: "python" });

    expect(result.content?.[0]?.text).toContain("Python error");
    expect(result.content?.[0]?.text).not.toContain("TS error");
  });

  it("returns clean message when no diagnostics", async () => {
    const client = new MockLspClient("typescript");

    const manager = createMockLspManager({
      clients: new Map([["typescript", client]]),
    });

    const tool = createWorkspaceDiagnosticsTool(manager as any);
    const result = await tool.execute("call1", {});

    expect(result.details?.count).toBe(0);
    expect(result.content?.[0]?.text).toContain("All clean");
  });

  it("shows helpful message when no servers are running", async () => {
    const manager = createMockLspManager({
      clients: new Map(),
    });

    const tool = createWorkspaceDiagnosticsTool(manager as any);
    const result = await tool.execute("call1", {});

    expect(result.content?.[0]?.text).toContain("No LSP servers are running");
  });
});