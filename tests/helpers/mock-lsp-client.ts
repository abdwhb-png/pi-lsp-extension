import { mock } from "bun:test";

export type SendRequestCall = { method: string; params: unknown };

/**
 * Mock LspClient for unit testing LSP tool implementations.
 *
 * Records all sendRequest calls and returns configurable responses.
 * Also stores diagnostics like a real LspClient.
 */
export class MockLspClient {
  readonly calls: SendRequestCall[] = [];
  private _responses: Map<string, unknown> = new Map();
  private _diagnostics: Map<string, unknown[]> = new Map();
  initialized = true;
  disposed = false;
  languageId: string;

  constructor(languageId: string = "typescript") {
    this.languageId = languageId;
  }

  /** Configure a response for a specific LSP method */
  mockResponse(method: string, response: unknown): void {
    this._responses.set(method, response);
  }

  /** Store diagnostics for a URI */
  setDiagnostics(uri: string, diagnostics: unknown[]): void {
    this._diagnostics.set(uri, diagnostics);
  }

  getDiagnostics(uri: string): unknown[] {
    return this._diagnostics.get(uri) ?? [];
  }

  getAllDiagnostics(): Map<string, unknown[]> {
    return new Map(this._diagnostics);
  }

  async sendRequest<R>(method: string, params: unknown): Promise<R> {
    this.calls.push({ method, params });
    if (this._responses.has(method)) {
      return this._responses.get(method) as R;
    }
    return null as unknown as R;
  }

  sendNotification(_method: string, _params: unknown): void {
    // No-op for mock
  }

  async shutdown(): Promise<void> {
    this.disposed = true;
  }
}

/**
 * Lightweight mock of LspManager for passing to tool creation functions.
 * Supports getClientForFile which returns a pre-configured MockLspClient.
 */
export function createMockLspManager(opts: {
  clients?: Map<string, MockLspClient>;
  rootDir?: string;
  /** Configured language IDs (even if no client is started). If omitted, defaults to clients.keys(). */
  configuredLanguages?: string[];
} = {}) {
  const clients = opts.clients ?? new Map();
  const rootDir = opts.rootDir ?? "/mock/project";
  const configured = opts.configuredLanguages ?? [...clients.keys()];

  const manager = {
    getClientForFile: mock(async (filePath: string) => {
      // Match by language ID from extension
      const ext = filePath.match(/\.[^.]+$/)?.[0];
      if (ext === ".ts" || ext === ".tsx") return clients.get("typescript") ?? null;
      if (ext === ".py") return clients.get("python") ?? null;
      if (ext === ".rs") return clients.get("rust") ?? null;
      if (ext === ".go") return clients.get("go") ?? null;
      if (ext === ".java") return clients.get("java") ?? null;
      return clients.get("typescript") ?? null;
    }),
    getRunningClient: mock((languageId: string) => {
      return clients.get(languageId) ?? null;
    }),
    isServerStarting: mock((_languageId: string) => false),
    getFileUri: mock((filePath: string) => {
      return `file://${rootDir}/${filePath}`;
    }),
    resolvePath: mock((filePath: string) => {
      return filePath.startsWith("/") ? filePath : `${rootDir}/${filePath}`;
    }),
    getLanguageId: mock((filePath: string) => {
      const ext = filePath.match(/\.[^.]+$/)?.[0];
      const map: Record<string, string> = {
        ".ts": "typescript", ".tsx": "typescriptreact",
        ".js": "javascript", ".jsx": "javascriptreact",
        ".rs": "rust", ".py": "python", ".go": "go", ".java": "java",
        ".c": "c", ".h": "c", ".cpp": "cpp",
      };
      return map[ext ?? ""];
    }),
    getConfiguredLanguages: mock(() => configured),
    getStatus: mock(() => {
      return configured.map((lang) => {
        const client = clients.get(lang);
        const diagCount = client
          ? [...client.getAllDiagnostics().values()].reduce((sum, diags) => sum + diags.length, 0)
          : 0;
        return {
          languageId: lang,
          command: "mock",
          running: client ? (client.initialized && !client.disposed) : false,
          diagnosticsCount: diagCount,
          shared: false,
        };
      });
    }),
  };

  return manager;
}