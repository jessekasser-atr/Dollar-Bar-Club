function getColumnNames(db, tableName) {
  return new Set(
    db
      .prepare(`PRAGMA table_info(${tableName})`)
      .all()
      .map((column) => column.name)
  );
}

function hasTable(db, tableName) {
  return Boolean(
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName)
  );
}

function ensureTable(db, tableName, createSql) {
  if (!hasTable(db, tableName)) {
    db.exec(createSql);
  }
}

function ensureColumn(db, tableName, columnName, columnSql) {
  const columns = getColumnNames(db, tableName);
  if (!columns.has(columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql}`);
  }
}

function ensureIndex(db, indexName, createSql) {
  const exists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?")
    .get(indexName);

  if (!exists) {
    db.exec(createSql);
  }
}

function buildHoursSummary(hours) {
  if (!Array.isArray(hours) || !hours.length) {
    return null;
  }

  return hours
    .map((entry) => entry?.description)
    .filter(Boolean)
    .join(" | ");
}

const migrations = [
  {
    id: "001_initial_core_tables",
    run(db) {
      ensureTable(
        db,
        "members",
        `CREATE TABLE members (
          id TEXT PRIMARY KEY,
          phone TEXT UNIQUE,
          email TEXT UNIQUE,
          first_name TEXT,
          last_name TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`
      );

      ensureTable(
        db,
        "venues",
        `CREATE TABLE venues (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          city TEXT NOT NULL,
          state TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`
      );

      ensureTable(
        db,
        "offers",
        `CREATE TABLE offers (
          id TEXT PRIMARY KEY,
          venue_id TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          starts_at TEXT NOT NULL,
          ends_at TEXT NOT NULL,
          max_redemptions INTEGER,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (venue_id) REFERENCES venues(id)
        )`
      );

      ensureTable(
        db,
        "member_offers",
        `CREATE TABLE member_offers (
          id TEXT PRIMARY KEY,
          member_id TEXT NOT NULL,
          offer_id TEXT NOT NULL,
          token TEXT UNIQUE,
          status TEXT NOT NULL DEFAULT 'issued',
          issued_at TEXT NOT NULL DEFAULT (datetime('now')),
          redeemed_at TEXT,
          FOREIGN KEY (member_id) REFERENCES members(id),
          FOREIGN KEY (offer_id) REFERENCES offers(id)
        )`
      );

      ensureTable(
        db,
        "redemptions",
        `CREATE TABLE redemptions (
          id TEXT PRIMARY KEY,
          member_offer_id TEXT,
          venue_id TEXT NOT NULL,
          staff_id TEXT,
          device_id TEXT,
          result TEXT NOT NULL,
          reason TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (member_offer_id) REFERENCES member_offers(id),
          FOREIGN KEY (venue_id) REFERENCES venues(id)
        )`
      );

      ensureIndex(
        db,
        "idx_member_offers_token",
        "CREATE INDEX idx_member_offers_token ON member_offers(token)"
      );
      ensureIndex(
        db,
        "idx_redemptions_created_at",
        "CREATE INDEX idx_redemptions_created_at ON redemptions(created_at)"
      );
    }
  },
  {
    id: "002_pilot_schema_expansion",
    run(db) {
      ensureColumn(db, "members", "zip_code", "zip_code TEXT");

      ensureColumn(db, "venues", "address", "address TEXT");
      ensureColumn(db, "venues", "neighborhood", "neighborhood TEXT");
      ensureColumn(db, "venues", "type", "type TEXT");
      ensureColumn(db, "venues", "image_url", "image_url TEXT");
      ensureColumn(db, "venues", "website", "website TEXT");
      ensureColumn(db, "venues", "phone", "phone TEXT");
      ensureColumn(db, "venues", "instagram", "instagram TEXT");
      ensureColumn(db, "venues", "lat", "lat REAL");
      ensureColumn(db, "venues", "lng", "lng REAL");

      ensureColumn(db, "offers", "image_url", "image_url TEXT");

      ensureTable(
        db,
        "memberships",
        `CREATE TABLE memberships (
          token TEXT PRIMARY KEY,
          member_id TEXT NOT NULL UNIQUE,
          zip_code TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (member_id) REFERENCES members(id)
        )`
      );

      ensureColumn(db, "redemptions", "member_id", "member_id TEXT");
      ensureColumn(db, "redemptions", "membership_token", "membership_token TEXT");
      ensureColumn(db, "redemptions", "offer_id", "offer_id TEXT");

      const memberOffersColumns = getColumnNames(db, "member_offers");
      if (!memberOffersColumns.has("token")) {
        db.exec("ALTER TABLE member_offers ADD COLUMN token TEXT");
      }

      ensureIndex(
        db,
        "idx_memberships_member_id",
        "CREATE INDEX idx_memberships_member_id ON memberships(member_id)"
      );
      ensureIndex(
        db,
        "idx_member_offers_member_offer",
        "CREATE UNIQUE INDEX idx_member_offers_member_offer ON member_offers(member_id, offer_id)"
      );
    }
  },
  {
    id: "003_barglance_venue_fields",
    run(db) {
      ensureColumn(db, "venues", "source", "source TEXT");
      ensureColumn(db, "venues", "source_id", "source_id TEXT");
      ensureColumn(db, "venues", "description", "description TEXT");
      ensureColumn(db, "venues", "rating", "rating REAL");
      ensureColumn(db, "venues", "review_count", "review_count INTEGER");
      ensureColumn(db, "venues", "raw_payload", "raw_payload TEXT");

      ensureIndex(
        db,
        "idx_venues_source_source_id",
        "CREATE UNIQUE INDEX idx_venues_source_source_id ON venues(source, source_id)"
      );
    }
  },
  {
    id: "004_pilot_venue_enablement",
    run(db) {
      ensureColumn(db, "venues", "enabled", "enabled INTEGER NOT NULL DEFAULT 0");
      db.exec(`
        UPDATE venues
        SET enabled = 1
        WHERE id IN ('austin-pilot-venue-1', 'austin-pilot-venue-2')
      `);
      ensureIndex(
        db,
        "idx_venues_enabled",
        "CREATE INDEX idx_venues_enabled ON venues(enabled)"
      );
    }
  },
  {
    id: "005_barglance_venue_enrichment",
    run(db) {
      ensureColumn(db, "venues", "open_now", "open_now INTEGER");
      ensureColumn(db, "venues", "price_level", "price_level INTEGER");
      ensureColumn(db, "venues", "hours_summary", "hours_summary TEXT");

      db.exec(`
        UPDATE venues
        SET source = 'seed'
        WHERE source IS NULL
          AND id IN ('austin-pilot-venue-1', 'austin-pilot-venue-2')
      `);

      const rows = db
        .prepare(`
          SELECT id, raw_payload
          FROM venues
          WHERE source = 'barglance'
            AND raw_payload IS NOT NULL
        `)
        .all();

      const updateVenueStmt = db.prepare(`
        UPDATE venues
        SET open_now = ?,
            price_level = ?,
            hours_summary = ?
        WHERE id = ?
      `);

      for (const row of rows) {
        try {
          const payload = JSON.parse(row.raw_payload);
          updateVenueStmt.run(
            typeof payload.open_now === "boolean" ? (payload.open_now ? 1 : 0) : null,
            Number.isInteger(payload.price_level) ? payload.price_level : null,
            buildHoursSummary(payload.hours),
            row.id
          );
        } catch (_error) {
          // Ignore malformed historical payloads and preserve the row as-is.
        }
      }
    }
  },
  {
    id: "006_curated_venue_profiles",
    run(db) {
      ensureColumn(db, "venues", "display_name", "display_name TEXT");
      ensureColumn(db, "venues", "display_description", "display_description TEXT");
      ensureColumn(db, "venues", "display_image_url", "display_image_url TEXT");
      ensureColumn(db, "venues", "display_address", "display_address TEXT");
      ensureColumn(db, "venues", "display_website", "display_website TEXT");
      ensureColumn(db, "venues", "display_phone", "display_phone TEXT");
      ensureColumn(db, "venues", "display_neighborhood", "display_neighborhood TEXT");
      ensureColumn(db, "venues", "display_type", "display_type TEXT");
    }
  }
];

function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const hasMigrationStmt = db.prepare(
    "SELECT 1 FROM schema_migrations WHERE id = ?"
  );
  const insertMigrationStmt = db.prepare(
    "INSERT INTO schema_migrations (id) VALUES (?)"
  );

  const applyMigration = db.transaction((migration) => {
    migration.run(db);
    insertMigrationStmt.run(migration.id);
  });

  for (const migration of migrations) {
    if (!hasMigrationStmt.get(migration.id)) {
      applyMigration(migration);
    }
  }
}

export { runMigrations };
