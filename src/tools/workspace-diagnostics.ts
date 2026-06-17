/**
 * lsp_workspace_diagnostics — Get diagnostics from all running LSP servers.
 *
 * Unlike lsp_diagnostics (which checks a single file or the "*" wildcard),
 * this tool specifically aggregates diagnostics across the entire workspace
 * from all running LSP servers. Supports optional filtering by severity and language.
 */

import { Type } from "@sinclair/typebox";
import { DiagnosticSeverity, type Diagnostic } from "vscode-languageserver-protocol";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { truncateHead, DEFAULT_MAX_LINES, DEFAULT_MAX_BYTES } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { LspManager } from "../lsp-manager.js";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";

function severityToString(severity: number | undefined): string {
  switch (severity) {
    case DiagnosticSeverity.Error: return "error";
    case DiagnosticSeverity.Warning: return "warning";
    case DiagnosticSeverity.Information: return "info";
    case DiagnosticSeverity.Hint: return "hint";
    default: return "unknown";
  }
}

function formatDiagnostic(diag: Diagnostic, filePath: string): string {
  const line = diag.range.start.line + 1;
  const col = diag.range.start.character + 1;
  const sev = severityToString(diag.severity);
  const source = diag.source ? ` [${diag.source}]` : "";
  const code = diag.code !== undefined ? ` (${diag.code})` : "";
  return `${filePath}:${line}:${col} ${sev}: ${diag.message}${code}${source}`;
}

const WorkspaceDiagnosticsParams = Type.Object({
  severity: Type.Optional(Type.String({ description: "Filter by severity: 'error', 'warning', 'info', or 'hint'. Omit for all." })),
  language: Type.Optional(Type.String({ description: "Filter by language ID (e.g., 'typescript', 'python'). Omit for all languages." })),
  maxResults: Type.Optional(Type.Number({ description: "Maximum number of diagnostics to return (default: 100, max: 500)" })),
});

interface WorkspaceDiagnosticsDetails {
  count: number;
  errors: number;
  warnings: number;
  files: number;
}

export function createWorkspaceDiagnosticsTool(
  manager: LspManager,
): ToolDefinition<typeof WorkspaceDiagnosticsParams, WorkspaceDiagnosticsDetails> {
  return {
    name: "lsp_workspace_diagnostics",
    label: "LSP Workspace Diagnostics",
    description: "Get diagnostics from all running LSP servers across the workspace. Supports filtering by severity and language. Use this to see all compilation errors at once without checking each file individually.",
    promptSnippet: "Get all LSP diagnostics across the workspace from all running servers",
    promptGuidelines: [
      "After batch edits or refactoring sessions, use lsp_workspace_diagnostics to review all errors at once.",
      "Use the severity filter to focus on errors only: severity='error'.",
      "Use the language filter to scope to a specific language: language='typescript'.",
    ],
    parameters: WorkspaceDiagnosticsParams,

    async execute(_toolCallId, params) {
      const severityFilter = params.severity ? parseSeverity(params.severity) : undefined;
      const langFilter = params.language;
      const maxResults = Math.min(params.maxResults ?? 100, 500);

      const rootDir = manager.resolvePath(".");
      const statuses = manager.getStatus();
      const running = statuses.filter((s) => s.running);

      if (running.length === 0) {
        return {
          content: [{ type: "text", text: "No LSP servers are running. Use a file-specific LSP tool (e.g., lsp_diagnostics) first to trigger server startup." }],
          details: { count: 0, errors: 0, warnings: 0, files: 0 },
        };
      }

      // Filter by language if requested
      const languages = langFilter
        ? running.filter((s) => s.languageId === langFilter)
        : running;

      if (languages.length === 0) {
        return {
          content: [{ type: "text", text: `No running LSP server for language "${langFilter}". Running servers: ${running.map((s) => s.languageId).join(", ")}` }],
          details: { count: 0, errors: 0, warnings: 0, files: 0 },
        };
      }

      const allLines: string[] = [];
      let totalErrors = 0;
      let totalWarnings = 0;
      let affectedFiles = 0;

      for (const { languageId } of languages) {
        const client = manager.getRunningClient(languageId);
        if (!client) continue;

        const allDiags = client.getAllDiagnostics();
        if (allDiags.size === 0) continue;

        let langCount = 0;

        for (const [uri, diagnostics] of allDiags) {
          if (diagnostics.length === 0) continue;

          // Filter by severity
          const filtered = severityFilter !== undefined
            ? diagnostics.filter((d) => d.severity === severityFilter)
            : diagnostics;

          if (filtered.length === 0) continue;

          let relPath: string;
          try {
            const absPath = fileURLToPath(uri);
            relPath = relative(rootDir, absPath);
          } catch {
            relPath = uri;
          }

          affectedFiles++;

          // Count errors and warnings (from unfiltered diagnostics)
          for (const d of diagnostics) {
            if (d.severity === DiagnosticSeverity.Error) totalErrors++;
            if (d.severity === DiagnosticSeverity.Warning) totalWarnings++;
          }

          // Add header for each file that has diagnostics
          if (langCount === 0) {
            allLines.push(`## ${languageId}`);
          }
          allLines.push(`\n### ${relPath} (${filtered.length} diagnostic(s))`);

          // Sort by severity (errors first), then by position
          const sorted = [...filtered].sort((a, b) => {
            const sevDiff = (a.severity ?? 99) - (b.severity ?? 99);
            if (sevDiff !== 0) return sevDiff;
            const lineDiff = a.range.start.line - b.range.start.line;
            if (lineDiff !== 0) return lineDiff;
            return a.range.start.character - b.range.start.character;
          });

          for (const d of sorted) {
            // Apply maxResults limit per individual diagnostic
            if (allLines.length >= maxResults + 5) break;
            allLines.push(formatDiagnostic(d, relPath));
          }

          langCount++;
        }
      }

      if (allLines.length === 0) {
        const sevInfo = severityFilter !== undefined ? ` (severity: ${params.severity})` : "";
        const langInfo = langFilter ? ` in ${langFilter}` : "";
        return {
          content: [{ type: "text", text: `No diagnostics${sevInfo}${langInfo}. All clean!` }],
          details: { count: 0, errors: 0, warnings: 0, files: 0 },
        };
      }

      const totalCount = totalErrors + totalWarnings;
      const summaryParts: string[] = [];
      if (totalErrors > 0) summaryParts.push(`${totalErrors} error(s)`);
      if (totalWarnings > 0) summaryParts.push(`${totalWarnings} warning(s)`);
      summaryParts.push(`${affectedFiles} file(s)`);

      const output = `# Workspace Diagnostics\n\n${summaryParts.join(", ")} in ${languages.length} running server(s)\n\n${allLines.join("\n")}`;

      const truncation = truncateHead(output, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
      return {
        content: [{ type: "text", text: truncation.content }],
        details: { count: totalCount, errors: totalErrors, warnings: totalWarnings, files: affectedFiles },
      };
    },
  };
}

function parseSeverity(severity: string): DiagnosticSeverity | undefined {
  switch (severity.toLowerCase()) {
    case "error": return DiagnosticSeverity.Error;
    case "warning": return DiagnosticSeverity.Warning;
    case "info":
    case "information": return DiagnosticSeverity.Information;
    case "hint": return DiagnosticSeverity.Hint;
    default: return undefined;
  }
}