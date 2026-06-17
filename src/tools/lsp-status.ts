/**
 * lsp_status — Show LSP server status overview.
 *
 * Returns a structured summary of all configured LSP servers, their running state,
 * diagnostic counts, and whether they use shared daemons.
 */

import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { LspManager } from "../lsp-manager.js";

const LspStatusParams = Type.Object({});

interface LspStatusDetails {
  totalServers: number;
  runningServers: number;
  totalDiagnostics: number;
  /** True if any server uses a shared daemon */
  hasSharedDaemons: boolean;
}

export function createLspStatusTool(
  manager: LspManager,
): ToolDefinition<typeof LspStatusParams, LspStatusDetails> {
  return {
    name: "lsp_status",
    label: "LSP Status",
    description: "Show the status overview of all configured LSP servers: which are running, which are stopped, diagnostic counts, and whether shared daemons are in use.",
    promptSnippet: "Check LSP server status overview",
    parameters: LspStatusParams,

    async execute() {
      const statuses = manager.getStatus();

      if (statuses.length === 0) {
        return {
          content: [{ type: "text", text: "No LSP servers configured. Use /lsp-config <language> <command> [args...] to add a server." }],
          details: { totalServers: 0, runningServers: 0, totalDiagnostics: 0, hasSharedDaemons: false },
        };
      }

      const running = statuses.filter((s) => s.running);
      const totalDiags = statuses.reduce((sum, s) => sum + s.diagnosticsCount, 0);
      const hasShared = statuses.some((s) => s.shared);

      const lines: string[] = [];
      lines.push("# LSP Server Status\n");
      lines.push(`**${running.length} of ${statuses.length} server(s) running** — **${totalDiags} total diagnostic(s)**\n`);

      if (hasShared) {
        lines.push("> 💡 Some servers use shared daemons — they persist across pi sessions.\n");
      }

      for (const s of statuses) {
        const icon = s.running ? "🟢" : "⚪";
        const state = s.running ? "running" : "stopped";
        const diagInfo = s.diagnosticsCount > 0 ? ` — ${s.diagnosticsCount} diagnostics` : "";
        const sharedTag = s.shared ? " [shared]" : "";

        lines.push(`### ${icon} \`${s.languageId}\` (${state})${sharedTag}`);
        lines.push(`- **Command**: \`${s.command}\`${diagInfo}`);
      }

      // Add helpful next-step hints
      const stoppedCount = statuses.length - running.length;
      if (stoppedCount > 0) {
        lines.push(`\n---`);
        lines.push(`${stoppedCount} server(s) are stopped. Use any LSP tool on a file (e.g., \`lsp_diagnostics\`) to trigger auto-start.`);
      }

      const text = lines.join("\n");
      return {
        content: [{ type: "text", text }],
        details: {
          totalServers: statuses.length,
          runningServers: running.length,
          totalDiagnostics: totalDiags,
          hasSharedDaemons: hasShared,
        },
      };
    },
  };
}