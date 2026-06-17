/**
 * lsp_find_implementations — Find all implementations of an interface/abstract class/method.
 */

import { Type } from "@sinclair/typebox";
import type { Location, LocationLink } from "vscode-languageserver-protocol";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { LspManager } from "../lsp-manager.js";
import type { TreeSitterManager } from "../tree-sitter/parser-manager.js";
import { formatLocation, formatLocationLink } from "../shared/format.js";
import { resolveSymbolPosition, getSymbolNames } from "../shared/resolve-position.js";

type ImplementationResult = Location | Location[] | LocationLink[] | null;

const ImplementationParams = Type.Object({
  path: Type.String({ description: "File path" }),
  line: Type.Optional(Type.Number({ description: "Line number (1-indexed). Required unless query is provided." })),
  character: Type.Optional(Type.Number({ description: "Column number (1-indexed). Required unless query is provided." })),
  query: Type.Optional(Type.String({ description: "Symbol name to find in the file. Alternative to line/character — resolves the symbol's position automatically." })),
});

interface ImplementationDetails { count: number }

export function createImplementationTool(
  manager: LspManager,
  treeSitter?: TreeSitterManager | null,
): ToolDefinition<typeof ImplementationParams, ImplementationDetails> {
  return {
    name: "lsp_find_implementations",
    label: "LSP Implementations",
    description: "Find all implementations of an interface, abstract class, or abstract method at a specific position. Returns a list of file locations. Line and character are 1-indexed.",
    promptSnippet: "Find all concrete implementations of an interface/abstract method via LSP",
    parameters: ImplementationParams,

    async execute(_toolCallId, params) {
      const filePath = params.path.replace(/^@/, "");
      let line = params.line;
      let character = params.character;
      let resolvedFrom: string | undefined;

      // Resolve position from query if line/character not provided
      if ((line === undefined || character === undefined) && params.query) {
        const resolved = await resolveSymbolPosition(filePath, params.query, manager, treeSitter);
        if (resolved) {
          line = resolved.line;
          character = resolved.character;
          resolvedFrom = `Resolved "${params.query}" → ${resolved.symbolName} at ${line}:${character} [${resolved.source}]`;
        } else {
          const names = await getSymbolNames(filePath, manager, treeSitter);
          const hint = names.length > 0 ? `\nAvailable symbols: ${names.slice(0, 20).join(", ")}` : "";
          return { content: [{ type: "text", text: `Could not find symbol "${params.query}" in ${filePath}${hint}` }], details: { count: 0 } };
        }
      }

      if (line === undefined || character === undefined) {
        return { content: [{ type: "text", text: "Either line/character or query is required." }], details: { count: 0 } };
      }

      const client = await manager.getClientForFile(filePath).catch(() => null);

      if (!client) {
        const reason = manager.getUnavailableReason?.(filePath) ?? "No LSP server available for this file.";
        return { content: [{ type: "text", text: reason }], details: { count: 0 } };
      }

      const uri = manager.getFileUri(filePath);
      const position = { line: line - 1, character: character - 1 };

      try {
        const result = await client.sendRequest<ImplementationResult>("textDocument/implementation", {
          textDocument: { uri }, position,
        });

        if (!result) {
          const text = resolvedFrom ? `${resolvedFrom}\n\nNo implementations found.` : "No implementations found.";
          return { content: [{ type: "text", text }], details: { count: 0 } };
        }

        const rootDir = manager.resolvePath(".");
        let locations: string[];

        if (Array.isArray(result)) {
          if (result.length === 0) {
            const text = resolvedFrom ? `${resolvedFrom}\n\nNo implementations found.` : "No implementations found.";
            return { content: [{ type: "text", text }], details: { count: 0 } };
          }
          if ("targetUri" in result[0]) {
            locations = (result as LocationLink[]).map((l) => formatLocationLink(l, rootDir));
          } else {
            locations = (result as Location[]).map((l) => formatLocation(l, rootDir));
          }
        } else {
          locations = [formatLocation(result as Location, rootDir)];
        }

        const header = resolvedFrom
          ? `${resolvedFrom}\n\n${locations.length} implementation(s) found.\n`
          : `${locations.length} implementation(s) found.\n`;
        const text = header + locations.join("\n");
        return { content: [{ type: "text", text }], details: { count: locations.length } };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Failed to find implementations: ${err.message}` }], details: { count: 0 } };
      }
    },
  };
}