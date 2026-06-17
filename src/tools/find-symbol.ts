/**
 * lsp_find_symbol — Search for symbols by name across the entire workspace.
 *
 * Unlike lsp_symbols (which requires a file path or scans document symbols),
 * this tool takes only a query string and searches all open LSP servers for
 * matching symbol names. It does NOT require a file — it returns matches
 * from across the workspace.
 */

import { Type } from "@sinclair/typebox";
import type { WorkspaceSymbol, SymbolInformation } from "vscode-languageserver-protocol";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { LspManager } from "../lsp-manager.js";

type WorkspaceSymbolResult = SymbolInformation[] | WorkspaceSymbol[] | null;

const FindSymbolParams = Type.Object({
  query: Type.String({ description: "Symbol name to search for (case-insensitive partial match)" }),
  language: Type.Optional(Type.String({ description: "Optional language ID filter (e.g., 'typescript', 'python')" })),
});

interface FindSymbolDetails { count: number }

export function createFindSymbolTool(
  manager: LspManager,
): ToolDefinition<typeof FindSymbolParams, FindSymbolDetails> {
  return {
    name: "lsp_find_symbol",
    label: "LSP Find Symbol",
    description: "Search for symbols by name across all running LSP servers. Does not require a file path — finds symbols anywhere in the workspace. Good for finding where a function, class, or variable is defined when you know its name but not its location.",
    promptSnippet: "Search for a symbol by name across the entire workspace via LSP",
    parameters: FindSymbolParams,

    async execute(_toolCallId, params) {
      const query = params.query;
      const langFilter = params.language;

      // Collect results from all running LSP servers (or the filtered one)
      const languages = langFilter
        ? [langFilter]
        : manager.getConfiguredLanguages();

      const allSymbols: { name: string; kind: string; location: string; language: string }[] = [];
      const rootDir = manager.resolvePath(".");

      for (const languageId of languages) {
        const client = manager.getRunningClient(languageId);
        if (!client) continue;

        try {
          const result = await client.sendRequest<WorkspaceSymbolResult>("workspace/symbol", {
            query,
          });

          if (!result || result.length === 0) continue;

          for (const sym of result) {
            let location = "";
            let name = sym.name;
            let kind = "";

            if ("kind" in sym) {
              kind = `kind(${sym.kind})`;
            }

            if ("location" in sym && sym.location) {
              try {
                const { fileURLToPath } = await import("node:url");
                const { relative } = await import("node:path");
                const absPath = fileURLToPath(sym.location.uri);
                const relPath = relative(rootDir, absPath);
                location = `${relPath}:${sym.location.range.start.line + 1}:${sym.location.range.start.character + 1}`;
              } catch {
                location = `${sym.location.uri}:${sym.location.range.start.line + 1}:${sym.location.range.start.character + 1}`;
              }
            } else if ("uri" in sym) {
              try {
                const { fileURLToPath } = await import("node:url");
                const { relative } = await import("node:path");
                const absPath = fileURLToPath((sym as any).uri);
                location = relative(rootDir, absPath);
              } catch {
                location = (sym as any).uri;
              }
            }

            allSymbols.push({ name, kind, location, language: languageId });
          }
        } catch {
          // Server may not support workspace/symbol — skip
        }
      }

      if (allSymbols.length === 0) {
        const langInfo = langFilter ? ` in ${langFilter}` : "";
        return {
          content: [{ type: "text", text: `No symbols found matching "${query}"${langInfo}. Ensure LSP servers are running (try using lsp_diagnostics or lsp_symbols on a file first).` }],
          details: { count: 0 },
        };
      }

      const lines = allSymbols.map((s) => {
        const parts = [s.name];
        if (s.kind) parts.push(`[${s.kind}]`);
        parts.push(`(${s.language})`);
        if (s.location) parts.push(`— ${s.location}`);
        return parts.join(" ");
      });

      const text = `Found ${allSymbols.length} symbol(s) matching "${query}":\n\n${lines.join("\n")}`;
      return { content: [{ type: "text", text }], details: { count: allSymbols.length } };
    },
  };
}