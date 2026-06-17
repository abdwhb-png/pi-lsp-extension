/**
 * Tests for lsp_status tool.
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

const { createLspStatusTool } = await import("../../../src/tools/lsp-status.js");

describe("lsp_status", () => {
  it("returns status for all configured servers", async () => {
    const tsClient = new MockLspClient("typescript");
    tsClient.setDiagnostics("file:///mock/project/src/app.ts", [
      { severity: 1, message: "Error", range: { start: { line: 1, character: 0 }, end: { line: 1, character: 1 } } },
      { severity: 2, message: "Warning", range: { start: { line: 2, character: 0 }, end: { line: 2, character: 1 } } },
    ]);

    const pyClient = new MockLspClient("python");

    const manager = createMockLspManager({
      clients: new Map([
        ["typescript", tsClient],
        ["python", pyClient],
      ]),
    });

    const tool = createLspStatusTool(manager as any);
    const result = await tool.execute("call1", {});

    expect(result.details?.totalServers).toBe(2);
    expect(result.details?.runningServers).toBe(2);
    expect(result.details?.totalDiagnostics).toBe(2);

    const text = result.content?.[0]?.text ?? "";
    expect(text).toContain("typescript");
    expect(text).toContain("python");
    expect(text).toContain("running");
    expect(text).toContain("2 diagnostics");
  });

  it("reports stopped servers correctly", async () => {
    // A disposed client is not running
    const deadClient = new MockLspClient("rust");
    deadClient.disposed = true;
    deadClient.initialized = false;

    const tsClient = new MockLspClient("typescript");

    const manager = createMockLspManager({
      clients: new Map([
        ["typescript", tsClient],
        ["rust", deadClient],
      ]),
    });

    const tool = createLspStatusTool(manager as any);
    const result = await tool.execute("call1", {});

    expect(result.details?.runningServers).toBe(1);
    expect(result.details?.totalServers).toBe(2);
    expect(result.content?.[0]?.text).toContain("stopped");
  });

  it("shows idle message when no servers configured", async () => {
    const manager = createMockLspManager({
      clients: new Map(),
    });

    const tool = createLspStatusTool(manager as any);
    const result = await tool.execute("call1", {});

    expect(result.details?.totalServers).toBe(0);
    expect(result.content?.[0]?.text).toContain("No LSP servers configured");
  });

  it("includes configured languages even if not started", async () => {
    const manager = createMockLspManager({
      clients: new Map(),
      configuredLanguages: ["typescript", "rust", "java"],
    });

    const tool = createLspStatusTool(manager as any);
    const result = await tool.execute("call1", {});

    expect(result.details?.totalServers).toBe(3);
    expect(result.details?.runningServers).toBe(0);
    expect(result.content?.[0]?.text).toContain("stopped");
  });
});