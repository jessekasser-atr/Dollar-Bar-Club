import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { runMigrations } from "../src/migrations.js";

test("offer scheduling migration adds backward-compatible defaults", () => {
  const db = new Database(":memory:");
  try {
    runMigrations(db);

    const columns = new Map(
      db.prepare("PRAGMA table_info(offers)").all().map((column) => [column.name, column])
    );

    assert.equal(columns.has("available_start_time"), true);
    assert.equal(columns.has("available_end_time"), true);
    assert.equal(columns.has("redemption_cadence"), true);
    assert.equal(columns.get("redemption_cadence").dflt_value, "'weekly'");
    assert.equal(columns.get("redemption_cadence").notnull, 1);
  } finally {
    db.close();
  }
});
