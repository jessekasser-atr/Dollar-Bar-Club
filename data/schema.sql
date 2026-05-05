PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE,
  email TEXT UNIQUE,
  zip_code TEXT,
  first_name TEXT,
  last_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS venues (
  id TEXT PRIMARY KEY,
  source TEXT,
  source_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  address TEXT,
  neighborhood TEXT,
  type TEXT,
  description TEXT,
  image_url TEXT,
  website TEXT,
  phone TEXT,
  instagram TEXT,
  lat REAL,
  lng REAL,
  open_now INTEGER,
  price_level INTEGER,
  hours_summary TEXT,
  rating REAL,
  review_count INTEGER,
  raw_payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY,
  venue_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  max_redemptions INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (venue_id) REFERENCES venues(id)
);

CREATE TABLE IF NOT EXISTS memberships (
  token TEXT PRIMARY KEY,
  member_id TEXT NOT NULL UNIQUE,
  zip_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (member_id) REFERENCES members(id)
);

CREATE TABLE IF NOT EXISTS member_offers (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  offer_id TEXT NOT NULL,
  token TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'issued',
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  redeemed_at TEXT,
  UNIQUE (member_id, offer_id),
  FOREIGN KEY (member_id) REFERENCES members(id),
  FOREIGN KEY (offer_id) REFERENCES offers(id)
);

CREATE TABLE IF NOT EXISTS redemptions (
  id TEXT PRIMARY KEY,
  member_offer_id TEXT,
  member_id TEXT,
  membership_token TEXT,
  offer_id TEXT,
  venue_id TEXT NOT NULL,
  staff_id TEXT,
  device_id TEXT,
  result TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (member_offer_id) REFERENCES member_offers(id),
  FOREIGN KEY (member_id) REFERENCES members(id),
  FOREIGN KEY (membership_token) REFERENCES memberships(token),
  FOREIGN KEY (offer_id) REFERENCES offers(id),
  FOREIGN KEY (venue_id) REFERENCES venues(id)
);

CREATE TABLE IF NOT EXISTS member_devices (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  device_token TEXT NOT NULL,
  platform TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT,
  FOREIGN KEY (member_id) REFERENCES members(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_member_devices_token ON member_devices(device_token);
CREATE INDEX IF NOT EXISTS idx_member_devices_member ON member_devices(member_id);
CREATE INDEX IF NOT EXISTS idx_member_devices_active ON member_devices(revoked_at);

CREATE INDEX IF NOT EXISTS idx_memberships_member_id ON memberships(member_id);
CREATE INDEX IF NOT EXISTS idx_member_offers_token ON member_offers(token);
CREATE INDEX IF NOT EXISTS idx_member_offers_member_offer ON member_offers(member_id, offer_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_created_at ON redemptions(created_at);
CREATE INDEX IF NOT EXISTS idx_venues_enabled ON venues(enabled);
CREATE UNIQUE INDEX IF NOT EXISTS idx_venues_source_source_id ON venues(source, source_id);
