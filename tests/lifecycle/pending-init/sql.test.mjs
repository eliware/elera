import { expect, test } from "@jest/globals";
import { initializationSql, sqlLiteral } from "../../../src/lifecycle/pending-init/sql.mjs";

test("SQL literals escape passwords without exposing shell arguments", () => {
  expect(sqlLiteral("a'b\\c")).toBe("'a''b\\\\c'");
  expect(initializationSql("a'b\\c")).toContain("IDENTIFIED BY 'a''b\\\\c'");
});
