import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OfflineConfig } from "./config.ts";

const MAX_CONCURRENT = 2;
const MAX_PROMPT_CHARS = 8_000;
let active = 0;
const queue: Array<() => void> = [];

const SAFE_ENV_KEYS = [
  "HOME",
  "PATH",
  "USER",
  "LOGNAME",
  "SHELL",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "TMPDIR",
  "XDG_CONFIG_HOME",
  "XDG_CACHE_HOME",
  "XDG_DATA_HOME",
  "XDG_RUNTIME_DIR",
] as const;

export class BrainError extends Error {
  constructor(public readonly code: "busy" | "timeout" | "failed" | "invalid_output") {
    super(code);
    this.name = "BrainError";
  }
}

function safeEnvironment(): Record<string, string> {
  const output: Record<string, string> = {};
  for (const key of SAFE_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) output[key] = value;
  }
  return output;
}

async function acquire(maxQueue: number): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return;
  }
  if (queue.length >= maxQueue) throw new BrainError("busy");
  await new Promise<void>((resolve) => queue.push(resolve));
}

function release(): void {
  const next = queue.shift();
  if (next) next();
  else active--;
}

export interface BrainRequest {
  system: string;
  user: string;
  schema: object;
}

export async function runBrain<T>(request: BrainRequest, config: OfflineConfig): Promise<T> {
  const prompt = `${request.system}\n\n---\n\n${request.user}`;
  if (prompt.length > MAX_PROMPT_CHARS) throw new BrainError("failed");
  await acquire(config.maxBrainQueue);
  try {
    return await runBrainProcess<T>(prompt, request.schema, config);
  } finally {
    release();
  }
}

async function runBrainProcess<T>(prompt: string, schema: object, config: OfflineConfig): Promise<T> {
  const workDir = mkdtempSync(join(tmpdir(), "telegram-brain-"));
  const schemaPath = join(workDir, "schema.json");
  const outputPath = join(workDir, "last-message.json");
  writeFileSync(schemaPath, JSON.stringify(schema), "utf8");

  const args = ["exec"];
  if (config.codexModel) args.push("--model", config.codexModel);
  args.push(
    "-c",
    `model_reasoning_effort=${config.codexReasoningEffort}`,
    "--ephemeral",
    "--output-schema",
    schemaPath,
    "--json",
    "--skip-git-repo-check",
    "-s",
    "read-only",
    "-C",
    workDir,
    "-o",
    outputPath,
    prompt,
  );

  let timedOut = false;
  try {
    const process = Bun.spawn([config.codexBin, ...args], {
      cwd: workDir,
      env: safeEnvironment(),
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    });
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill();
      } catch {
        // Процесс уже завершён.
      }
    }, config.codexTimeoutMs);
    try {
      await process.exited;
    } finally {
      clearTimeout(timer);
    }
    if (timedOut) throw new BrainError("timeout");
    if (process.exitCode !== 0 || !existsSync(outputPath)) throw new BrainError("failed");

    const raw = readFileSync(outputPath, "utf8").trim();
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new BrainError("invalid_output");
    }
  } catch (error) {
    if (error instanceof BrainError) throw error;
    throw new BrainError("failed");
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

export function brainRuntimeState(): { active: number; queued: number } {
  return { active, queued: queue.length };
}
