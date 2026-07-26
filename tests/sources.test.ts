import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSources, readSnapshot } from "../src/sources.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(csv: string, path = "table.csv"): { config: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), "telegram-source-test-"));
  dirs.push(root);
  writeFileSync(join(root, path), csv);
  const config = join(root, "sources.json");
  writeFileSync(config, JSON.stringify({
    version: 1,
    sources: [{
      id: "table",
      label: "Test",
      description: "Test source",
      path,
      primary_key: "id",
      columns: {
        id: { type: "text", description: "ID", aliases: [] },
        value: { type: "text", description: "Value", aliases: [] },
      },
    }],
  }));
  return { config, root };
}

describe("source contracts", () => {
  test("стабильный primary key и provenance", () => {
    const { config, root } = fixture("id,value\nA-1,ok\nA-2,hello\n");
    const snapshot = readSnapshot(loadSources(config, root)[0]!);
    expect(snapshot.rows[0]?.provenance).toEqual({
      source_id: "table",
      row_number: 2,
      primary_key: "A-1",
    });
  });

  test("отклоняет duplicate key и duplicate headers", () => {
    const first = fixture("id,value\nA-1,one\nA-1,two\n");
    expect(() => readSnapshot(loadSources(first.config, first.root)[0]!)).toThrow("duplicate primary key");
    const second = fixture("id,value,value\nA-1,one,two\n");
    expect(() => readSnapshot(loadSources(second.config, second.root)[0]!)).toThrow("повторяющийся");
  });

  test("не позволяет источнику выйти за DATA_ROOT", () => {
    const { config, root } = fixture("id,value\nA-1,ok\n");
    writeFileSync(config, JSON.stringify({
      version: 1,
      sources: [{
        id: "table",
        label: "Test",
        description: "Test source",
        path: "../outside.csv",
        primary_key: "id",
        columns: { id: { type: "text", description: "ID", aliases: [] } },
      }],
    }));
    expect(() => loadSources(config, root)).toThrow("выходит за DATA_ROOT");
  });
});
