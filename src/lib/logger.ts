import {
  attachConsole,
  attachLogger,
  debug,
  error,
  info,
  trace,
  warn,
} from "@tauri-apps/plugin-log";
import { appLogDir } from "@tauri-apps/api/path";
import { readDir, readTextFile, remove, stat, writeTextFile } from "@tauri-apps/plugin-fs";
import { save } from "@tauri-apps/plugin-dialog";
import { ResultAsync, errAsync, okAsync, safeTry } from "neverthrow";
import { IS_TAURI } from "@/lib/environment/userAgent";
import { formatISODate, formatISOTimestamp } from "@/lib/format/time";

const MAX_LOG_AGE_DAYS = 7;
const TAIL_LINES = 1_000;
const WEB_BUFFER_MAX_LINES = 5_000;

const LEVEL_STYLES: Record<string, string> = {
  trace: "color: #6b7280; font-weight: 600", // gray
  debug: "color: #3b82f6; font-weight: 600", // blue
  info: "color: #22c55e; font-weight: 600", // green
  warn: "color: #f59e0b; font-weight: 600", // amber
  error: "color: #ef4444; font-weight: 600", // red
};

export interface AppLogger {
  trace: (msg: string) => Promise<void>;
  debug: (msg: string) => Promise<void>;
  info: (msg: string) => Promise<void>;
  warn: (msg: string) => Promise<void>;
  error: (msg: string) => Promise<void>;
}

export type LogError
  = | { type: "NO_DATA" }
    | { type: "FS_READ"; reason: string }
    | { type: "FS_WRITE"; reason: string }
    | { type: "FS_DIR"; reason: string };

export type ExportSuccess
  = | { kind: "saved"; path: string }
    | { kind: "downloaded"; filename: string }
    | { kind: "cancelled" };

let _logger: AppLogger | null = null;
let _detachConsole: (() => void) | null = null;

const _webBuffer: string[] = [];

export function getLogger(): AppLogger {
  if (!_logger) throw new Error("Logger not initialized. Call initLogging() first.");
  return _logger;
}

export async function initLogging(): Promise<AppLogger> {
  if (!IS_TAURI) {
    _logger = createWebLogger();
    return _logger;
  }

  _detachConsole = await attachConsole();
  await initConsoleTransport();
  cleanup().match(() => void 0, () => void 0);

  _logger = createTauriLogger();
  return _logger;
}

export function disposeLogging(): void {
  _detachConsole?.();
  _detachConsole = null;
  _logger = null;
  _webBuffer.length = 0;
}

export function tail(): ResultAsync<string, LogError> {
  if (!IS_TAURI) {
    const lines = _webBuffer.slice(-TAIL_LINES).join("\n");
    return okAsync(lines);
  }
  return readLatestLogFile();
}

export function exportLogs(): ResultAsync<ExportSuccess, LogError> {
  return IS_TAURI ? exportTauri() : exportWeb();
}

function exportTauri(): ResultAsync<ExportSuccess, LogError> {
  return ResultAsync.fromSafePromise(
    safeTry(async function* () {
      const logContent = yield* tail();

      if (!logContent.trim()) {
        return errAsync<ExportSuccess, LogError>({ type: "NO_DATA" });
      }

      const defaultName = `audiogram-${formatISODate(new Date())}.log`;

      const destPath = yield* ResultAsync.fromPromise(
        save({
          defaultPath: defaultName,
          filters: [{ name: "Log files", extensions: ["log", "txt"] }],
        }),
        (e): LogError => ({ type: "FS_WRITE", reason: String(e) }),
      );

      if (destPath === null) {
        return okAsync<ExportSuccess, LogError>({ kind: "cancelled" });
      }

      yield* ResultAsync.fromPromise(
        writeTextFile(destPath, logContent),
        (e): LogError => ({ type: "FS_WRITE", reason: String(e) }),
      );

      return okAsync<ExportSuccess, LogError>({ kind: "saved", path: destPath });
    }),
  ).andThen(r => r);
}

function exportWeb(): ResultAsync<ExportSuccess, LogError> {
  if (_webBuffer.length === 0) {
    return errAsync({ type: "NO_DATA" });
  }

  return ResultAsync.fromPromise(
    Promise.resolve().then(() => {
      const content = _webBuffer.join("\n");
      const filename = `audiogram-${formatISODate(new Date())}.log`;
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);

      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.style.display = "none";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();

      setTimeout(() => URL.revokeObjectURL(url), 5_000);

      return { kind: "downloaded" as const, filename };
    }),
    (e): LogError => ({ type: "FS_WRITE", reason: String(e) }),
  );
}

function readLatestLogFile(): ResultAsync<string, LogError> {
  return ResultAsync.fromPromise(
    appLogDir(),
    (e): LogError => ({ type: "FS_DIR", reason: String(e) }),
  )
    .andThen(logDir =>
      ResultAsync.fromPromise(
        readDir(logDir),
        (e): LogError => ({ type: "FS_READ", reason: String(e) }),
      ).map(entries => ({ logDir, entries })),
    )
    .andThen(({ logDir, entries }) => {
      const logFiles = entries
        .filter(e => e.name?.endsWith(".log"))
        .sort((a, b) => (b.name ?? "").localeCompare(a.name ?? ""));

      if (logFiles.length === 0) return okAsync("");

      const filePath = `${logDir}/${logFiles[0].name}`;
      return ResultAsync.fromPromise(
        readTextFile(filePath),
        (e): LogError => ({ type: "FS_READ", reason: String(e) }),
      ).map((contents) => {
        const lines = contents.split("\n");
        return lines.slice(Math.max(0, lines.length - TAIL_LINES)).join("\n");
      });
    });
}

function getLogDir(): ResultAsync<string, LogError> {
  return ResultAsync.fromPromise(
    appLogDir(),
    (e): LogError => ({ type: "FS_DIR", reason: String(e) }),
  );
}

function listLogFiles(logDir: string): ResultAsync<string[], LogError> {
  return ResultAsync.fromPromise(
    readDir(logDir),
    (e): LogError => ({ type: "FS_READ", reason: String(e) }),
  ).map(entries =>
    entries
      .filter(e => e.name?.endsWith(".log"))
      .map(e => `${logDir}/${e.name}`),
  );
}

function deleteIfStale(filePath: string, cutoff: number): ResultAsync<void, LogError> {
  return ResultAsync.fromPromise(
    stat(filePath),
    (e): LogError => ({ type: "FS_READ", reason: String(e) }),
  ).andThen((fileInfo) => {
    const mtime = fileInfo.mtime instanceof Date ? fileInfo.mtime.getTime() : null;
    if (mtime !== null && mtime < cutoff) {
      return ResultAsync.fromPromise(
        remove(filePath),
        (e): LogError => ({ type: "FS_WRITE", reason: String(e) }),
      );
    }
    return okAsync(undefined);
  });
}

function cleanup(): ResultAsync<void, LogError> {
  const cutoff = Date.now() - MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1_000;

  return getLogDir()
    .andThen(listLogFiles)
    .andThen(files => ResultAsync.combine(files.map(f => deleteIfStale(f, cutoff))))
    .map(() => undefined);
}

async function initConsoleTransport(): Promise<void> {
  await attachLogger(({ level, message }) => {
    const lvl = level as 1 | 2 | 3 | 4 | 5;
    try {
      switch (lvl) {
        case 1: console.error(message);
          break;
        case 2: console.warn(message);
          break;
        case 3: console.info(message);
          break;
        case 4: console.debug(message);
          break;
        case 5: console.trace(message);
          break;
      }
    }
    catch (err) {
      if (!isBrokenPipe(err)) throw err;
    }
  });
}

function isBrokenPipe(err: unknown): boolean {
  return (
    typeof err === "object"
    && err !== null
    && "code" in err
    && (err as { code: unknown }).code === "EPIPE"
  );
}

function formatLevel(level: string): string {
  return level.toUpperCase().padEnd(4);
}

function bufferWebLine(line: string): void {
  _webBuffer.push(line);
  while (_webBuffer.length > WEB_BUFFER_MAX_LINES) {
    _webBuffer.shift();
  }
}

function createTauriLogger(): AppLogger {
  return { trace, debug, info, warn, error };
}

function createWebLogger(): AppLogger {
  function log(level: string, msg: string, consoleFn: (...a: unknown[]) => void): void {
    const label = `[${formatLevel(level)}]`;
    const style = LEVEL_STYLES[level] ?? "";
    consoleFn(`%c${label}%c ${msg}`, style, "color: inherit; font-weight: normal");
    bufferWebLine(`${formatISOTimestamp()} ${label} ${msg}`);
  }

  return {

    trace: async msg => log("trace", msg, console.trace.bind(console)),

    debug: async msg => log("debug", msg, console.debug.bind(console)),

    info: async msg => log("info", msg, console.info.bind(console)),

    warn: async msg => log("warn", msg, console.warn.bind(console)),

    error: async msg => log("error", msg, console.error.bind(console)),
  };
}
