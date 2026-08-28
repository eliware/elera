import { expect, test } from "@jest/globals";
import { initializationSql, sqlIdentifier, sqlLiteral } from "../../../src/lifecycle/pending-init/sql.mjs";

test("SQL literals and identifiers escape credentials without exposing shell arguments", () => {
  expect(sqlLiteral("a'b\\c")).toBe("'a''b\\\\c'");
  expect(sqlIdentifier("a`b")).toBe("`a``b`");
  const sql = initializationSql({ database: "app" });
  expect(sql).toContain("CREATE DATABASE IF NOT EXISTS `app`");
  expect(sql).not.toContain("IDENTIFIED BY");
});
