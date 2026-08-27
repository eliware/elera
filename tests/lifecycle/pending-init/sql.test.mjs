import { expect, test } from "@jest/globals";
import { initializationSql, sqlIdentifier, sqlLiteral } from "../../../src/lifecycle/pending-init/sql.mjs";

test("SQL literals and identifiers escape credentials without exposing shell arguments", () => {
  expect(sqlLiteral("a'b\\c")).toBe("'a''b\\\\c'");
  expect(sqlIdentifier("a`b")).toBe("`a``b`");
  const sql = initializationSql({ rootPassword: "a'b\\c", database: "app", user: "healthcheck", password: "p'ass" });
  expect(sql).toContain("IDENTIFIED BY 'a''b\\\\c'");
  expect(sql).toContain("CREATE DATABASE IF NOT EXISTS `app`");
  expect(sql).toContain("GRANT ALL PRIVILEGES ON `app`.* TO 'healthcheck'@'%'");
  expect(initializationSql({ rootPassword: "secret" })).toContain("ALTER USER");
  expect(initializationSql({ rootPassword: "secret", user: "u" })).toContain("'u'@'localhost'");
});
