import { describe, expect, test } from "bun:test";
import { parseCsv } from "../src/csv.ts";

describe("CSV parser", () => {
  test("поддерживает кавычки, запятые и переносы", () => {
    expect(parseCsv('id,note\n1,"a,b"\n2,"две\nстроки"\n')).toEqual([
      ["id", "note"],
      ["1", "a,b"],
      ["2", "две\nстроки"],
    ]);
  });

  test("отклоняет незакрытую кавычку", () => {
    expect(() => parseCsv('id,note\n1,"broken')).toThrow("незакрытую");
  });
});
