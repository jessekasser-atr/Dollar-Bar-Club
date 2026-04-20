import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import { fetchBarsByCity, mapBarToVenueRecord } from "./barglance.js";
import { getCatalogSnapshot } from "./catalog.js";
import { runMigrations } from "./migrations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const DATA_DIR = path.join(REPO_ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "dbc.sqlite");
const AUSTIN_TIME_ZONE = "America/Chicago";
const WEEKDAY_TO_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};
const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function nowIso() {
  return new Date().toISOString();
}

function getZonedDateParts(date, timeZone = AUSTIN_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });

  const parts = formatter.formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: get("weekday"),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second"))
  };
}

function getTimeZoneOffsetMs(date, timeZone = AUSTIN_TIME_ZONE) {
  const parts = getZonedDateParts(date, timeZone);
  const zonedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return zonedAsUtc - date.getTime();
}

function zonedMidnightToUtcIso(year, month, day, timeZone = AUSTIN_TIME_ZONE) {
  const utcGuess = Date.UTC(year, month - 1, day, 0, 0, 0);
  const offsetMs = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offsetMs).toISOString();
}

function getWeeklyResetInfo(referenceDate = new Date()) {
  const local = getZonedDateParts(referenceDate, AUSTIN_TIME_ZONE);
  const weekdayIndex = WEEKDAY_TO_INDEX[local.weekday] ?? 0;
  const localDate = new Date(Date.UTC(local.year, local.month - 1, local.day));
  localDate.setUTCDate(localDate.getUTCDate() - weekdayIndex);

  const currentWeekYear = localDate.getUTCFullYear();
  const currentWeekMonth = localDate.getUTCMonth() + 1;
  const currentWeekDay = localDate.getUTCDate();

  const nextWeekDate = new Date(localDate.getTime());
  nextWeekDate.setUTCDate(nextWeekDate.getUTCDate() + 7);

  return {
    timeZone: AUSTIN_TIME_ZONE,
    label: "Resets every Sunday at midnight",
    currentWeekStartAt: zonedMidnightToUtcIso(currentWeekYear, currentWeekMonth, currentWeekDay),
    nextResetAt: zonedMidnightToUtcIso(
      nextWeekDate.getUTCFullYear(),
      nextWeekDate.getUTCMonth() + 1,
      nextWeekDate.getUTCDate()
    )
  };
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function createMembershipToken() {
  return crypto.randomBytes(5).toString("hex").toUpperCase();
}

function createEntitlementToken() {
  return crypto.randomBytes(8).toString("hex").toUpperCase();
}

function normalizeAvailableDays(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(
    value
      .map((entry) => Number(entry))
      .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 6)
  )].sort((left, right) => left - right);
}

function serializeAvailableDays(value) {
  const days = normalizeAvailableDays(value);
  return days.length ? days.join(",") : null;
}

function parseAvailableDays(value) {
  if (!value) {
    return [];
  }

  return normalizeAvailableDays(String(value).split(","));
}

function formatAvailabilitySummary(availableDays) {
  const days = normalizeAvailableDays(availableDays);
  if (!days.length) {
    return "Every day";
  }

  return days.map((day) => WEEKDAY_LABELS[day]).join(", ");
}

function getAustinWeekdayIndex(referenceDate = new Date()) {
  const local = getZonedDateParts(referenceDate, AUSTIN_TIME_ZONE);
  return WEEKDAY_TO_INDEX[local.weekday] ?? 0;
}

function getOfferAvailability(offer, referenceDate = new Date()) {
  const startsAtMs = offer.startsAt ? Date.parse(offer.startsAt) : Number.NaN;
  const endsAtMs = offer.endsAt ? Date.parse(offer.endsAt) : Number.NaN;
  const referenceMs = referenceDate.getTime();
  const withinStart = !Number.isFinite(startsAtMs) || referenceMs >= startsAtMs;
  const withinEnd = !Number.isFinite(endsAtMs) || referenceMs <= endsAtMs;
  const availableDays = normalizeAvailableDays(offer.availableDays);
  const weekdayIndex = getAustinWeekdayIndex(referenceDate);
  const matchesDay = !availableDays.length || availableDays.includes(weekdayIndex);

  return {
    availableDays,
    availabilitySummary: formatAvailabilitySummary(availableDays),
    isAvailableToday: Boolean(offer.isActive) && withinStart && withinEnd && matchesDay
  };
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function pickVenueDisplayValue(overrideValue, baseValue) {
  return overrideValue === null || overrideValue === undefined ? baseValue : overrideValue;
}

function mapVenue(row) {
  const overrideProfile = row
    ? {
        name: row.display_name ?? null,
        description: row.display_description ?? null,
        imageUrl: row.display_image_url ?? null,
        address: row.display_address ?? null,
        website: row.display_website ?? null,
        phone: row.display_phone ?? null,
        neighborhood: row.display_neighborhood ?? null,
        type: row.display_type ?? null
      }
    : null;
  const hasOverrides = overrideProfile
    ? Object.values(overrideProfile).some((value) => value !== null && value !== undefined)
    : false;

  return row
    ? {
        id: row.id,
        source: row.source || "local",
        sourceId: row.source_id || null,
        enabled: Boolean(row.enabled),
        featured: Boolean(row.featured),
        name: pickVenueDisplayValue(row.display_name, row.name),
        city: row.city,
        state: row.state,
        address: pickVenueDisplayValue(row.display_address, row.address),
        neighborhood: pickVenueDisplayValue(row.display_neighborhood, row.neighborhood),
        type: pickVenueDisplayValue(row.display_type, row.type),
        description: pickVenueDisplayValue(row.display_description, row.description),
        imageUrl: pickVenueDisplayValue(row.display_image_url, row.image_url),
        website: pickVenueDisplayValue(row.display_website, row.website),
        phone: pickVenueDisplayValue(row.display_phone, row.phone),
        instagram: row.instagram,
        lat: row.lat,
        lng: row.lng,
        openNow: row.open_now === null || row.open_now === undefined ? null : Boolean(row.open_now),
        priceLevel: row.price_level,
        hoursSummary: row.hours_summary,
        rating: row.rating,
        reviewCount: row.review_count,
        createdAt: row.created_at,
        hasOverrides,
        sourceProfile: {
          name: row.name,
          description: row.description,
          imageUrl: row.image_url,
          address: row.address,
          website: row.website,
          phone: row.phone,
          neighborhood: row.neighborhood,
          type: row.type
        },
        profileOverrides: overrideProfile
      }
    : null;
}

function mapOffer(row) {
  const availableDays = parseAvailableDays(row.available_days);
  return row
    ? {
        id: row.id,
        venueId: row.venue_id,
        title: row.title,
        description: row.description,
        imageUrl: row.image_url,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        isActive: Boolean(row.is_active),
        availableDays,
        availabilitySummary: formatAvailabilitySummary(availableDays),
        createdAt: row.created_at
      }
    : null;
}

function mapMembership(row) {
  return row
    ? {
        token: row.token,
        memberId: row.member_id,
        zipCode: row.zip_code,
        createdAt: row.created_at
      }
    : null;
}

function mapEntitlement(row) {
  return row
    ? {
        id: row.id,
        memberId: row.member_id,
        offerId: row.offer_id,
        token: row.token,
        status: row.status,
        issuedAt: row.issued_at,
        redeemedAt: row.redeemed_at
      }
    : null;
}

function normalizeEntitlement(entitlement, referenceDate = new Date()) {
  if (!entitlement) {
    return null;
  }

  const resetInfo = getWeeklyResetInfo(referenceDate);
  const redeemedAtMs = entitlement.redeemedAt ? Date.parse(entitlement.redeemedAt) : Number.NaN;
  const currentWeekStartMs = Date.parse(resetInfo.currentWeekStartAt);
  const redeemedThisWeek =
    entitlement.status === "redeemed" &&
    Number.isFinite(redeemedAtMs) &&
    redeemedAtMs >= currentWeekStartMs;

  return {
    ...entitlement,
    status: redeemedThisWeek ? "redeemed" : "issued",
    redeemedAt: redeemedThisWeek ? entitlement.redeemedAt : null
  };
}

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");
runMigrations(db);

const insertVenueStmt = db.prepare(`
  INSERT OR IGNORE INTO venues (
    id, source, source_id, enabled, name, city, state, address, neighborhood, type, description, image_url, website, phone, instagram, lat, lng, open_now, price_level, hours_summary, rating, review_count, raw_payload
  ) VALUES (
    @id, @source, @sourceId, @enabled, @name, @city, @state, @address, @neighborhood, @type, @description, @imageUrl, @website, @phone, @instagram, @lat, @lng, @openNow, @priceLevel, @hoursSummary, @rating, @reviewCount, @rawPayload
  )
`);

const upsertVenueStmt = db.prepare(`
  INSERT INTO venues (
    id, source, source_id, enabled, name, city, state, address, neighborhood, type, description, image_url, website, phone, instagram, lat, lng, open_now, price_level, hours_summary, rating, review_count, raw_payload
  ) VALUES (
    @id, @source, @sourceId, @enabled, @name, @city, @state, @address, @neighborhood, @type, @description, @imageUrl, @website, @phone, @instagram, @lat, @lng, @openNow, @priceLevel, @hoursSummary, @rating, @reviewCount, @rawPayload
  )
  ON CONFLICT(id) DO UPDATE SET
    source = excluded.source,
    source_id = excluded.source_id,
    name = excluded.name,
    city = excluded.city,
    state = excluded.state,
    address = excluded.address,
    neighborhood = excluded.neighborhood,
    type = excluded.type,
    description = excluded.description,
    image_url = excluded.image_url,
    website = excluded.website,
    phone = excluded.phone,
    instagram = excluded.instagram,
    lat = excluded.lat,
    lng = excluded.lng,
    open_now = excluded.open_now,
    price_level = excluded.price_level,
    hours_summary = excluded.hours_summary,
    rating = excluded.rating,
    review_count = excluded.review_count,
    raw_payload = excluded.raw_payload
`);

const insertOfferStmt = db.prepare(`
  INSERT OR IGNORE INTO offers (
    id, venue_id, title, description, image_url, starts_at, ends_at, is_active, available_days
  ) VALUES (
    @id, @venueId, @title, @description, @imageUrl, @startsAt, @endsAt, @isActive, @availableDays
  )
`);

const seedDb = db.transaction(() => {
  const catalog = getCatalogSnapshot();

  for (const venue of catalog.venues) {
    insertVenueStmt.run({
      source: "seed",
      sourceId: venue.id,
      enabled: 1,
      description: null,
      openNow: null,
      priceLevel: null,
      hoursSummary: null,
      rating: null,
      reviewCount: null,
      rawPayload: null,
      ...venue
    });
  }

  for (const offer of catalog.offers) {
    insertOfferStmt.run({
      ...offer,
      isActive: offer.isActive ? 1 : 0,
      availableDays: serializeAvailableDays(offer.availableDays)
    });
  }
});

seedDb();

const countStmt = {
  members: db.prepare("SELECT COUNT(*) AS count FROM members"),
  memberships: db.prepare("SELECT COUNT(*) AS count FROM memberships"),
  entitlements: db.prepare("SELECT COUNT(*) AS count FROM member_offers"),
  redemptions: db.prepare("SELECT COUNT(*) AS count FROM redemptions")
};

const findMemberByEmailStmt = db.prepare(`
  SELECT id, email, zip_code, first_name, last_name, created_at
  FROM members
  WHERE email = ?
`);

const createMemberStmt = db.prepare(`
  INSERT INTO members (id, email, zip_code, first_name, last_name, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const updateMemberProfileStmt = db.prepare(`
  UPDATE members
  SET zip_code = ?, first_name = ?, last_name = ?
  WHERE id = ?
`);

const findMembershipByTokenStmt = db.prepare(`
  SELECT token, member_id, zip_code, created_at
  FROM memberships
  WHERE token = ?
`);

const findMembershipByMemberIdStmt = db.prepare(`
  SELECT token, member_id, zip_code, created_at
  FROM memberships
  WHERE member_id = ?
`);

const createMembershipStmt = db.prepare(`
  INSERT INTO memberships (token, member_id, zip_code, created_at)
  VALUES (?, ?, ?, ?)
`);

const listOfferIdsStmt = db.prepare("SELECT id FROM offers");

const findEntitlementStmt = db.prepare(`
  SELECT id, member_id, offer_id, token, status, issued_at, redeemed_at
  FROM member_offers
  WHERE member_id = ? AND offer_id = ?
`);

const insertEntitlementStmt = db.prepare(`
  INSERT INTO member_offers (id, member_id, offer_id, token, status, issued_at, redeemed_at)
  VALUES (?, ?, ?, ?, 'issued', ?, NULL)
`);

const listActiveOffersStmt = db.prepare(`
  SELECT
    o.id,
    o.venue_id,
    o.title,
    o.description,
    o.image_url,
    o.starts_at,
    o.ends_at,
    o.is_active,
    o.available_days,
    o.created_at,
    v.id AS venue_id_join,
    v.source AS venue_source,
    v.source_id AS venue_source_id,
    v.enabled AS venue_enabled,
    v.name AS venue_name,
    v.display_name AS venue_display_name,
    v.city AS venue_city,
    v.state AS venue_state,
    v.address AS venue_address,
    v.display_address AS venue_display_address,
    v.neighborhood AS venue_neighborhood,
    v.display_neighborhood AS venue_display_neighborhood,
    v.type AS venue_type,
    v.display_type AS venue_display_type,
    v.description AS venue_description,
    v.display_description AS venue_display_description,
    v.image_url AS venue_image_url,
    v.display_image_url AS venue_display_image_url,
    v.website AS venue_website,
    v.display_website AS venue_display_website,
    v.phone AS venue_phone,
    v.display_phone AS venue_display_phone,
    v.instagram AS venue_instagram,
    v.lat AS venue_lat,
    v.lng AS venue_lng,
    v.open_now AS venue_open_now,
    v.price_level AS venue_price_level,
    v.hours_summary AS venue_hours_summary,
    v.rating AS venue_rating,
    v.review_count AS venue_review_count,
    v.created_at AS venue_created_at,
    v.featured AS venue_featured
  FROM offers o
  JOIN venues v ON v.id = o.venue_id
  WHERE o.is_active = 1
    AND (@venueId IS NULL OR o.venue_id = @venueId)
    AND (@enabledOnly = 0 OR v.enabled = 1)
  ORDER BY o.created_at ASC, o.id ASC
`);

const findVenueByIdStmt = db.prepare(`
  SELECT id, source, source_id, enabled, featured, name, display_name, city, state, address, display_address, neighborhood, display_neighborhood, type, display_type, description, display_description, image_url, display_image_url, website, display_website, phone, display_phone, instagram, lat, lng, open_now, price_level, hours_summary, rating, review_count, created_at
  FROM venues
  WHERE id = ?
`);

const listVenuesStmt = db.prepare(`
  SELECT id, source, source_id, enabled, featured, name, display_name, city, state, address, display_address, neighborhood, display_neighborhood, type, display_type, description, display_description, image_url, display_image_url, website, display_website, phone, display_phone, instagram, lat, lng, open_now, price_level, hours_summary, rating, review_count, created_at
  FROM venues
  WHERE (@enabledOnly = 0 OR enabled = 1)
  ORDER BY name ASC
`);

const updateVenueEnabledStmt = db.prepare(`
  UPDATE venues
  SET enabled = ?
  WHERE id = ?
`);

const updateVenueProfileStmt = db.prepare(`
  UPDATE venues
  SET display_name = ?,
      display_description = ?,
      display_image_url = ?,
      display_address = ?,
      display_website = ?,
      display_phone = ?,
      display_neighborhood = ?,
      display_type = ?,
      lat = COALESCE(?, lat),
      lng = COALESCE(?, lng)
  WHERE id = ?
`);

const clearVenueProfileStmt = db.prepare(`
  UPDATE venues
  SET display_name = NULL,
      display_description = NULL,
      display_image_url = NULL,
      display_address = NULL,
      display_website = NULL,
      display_phone = NULL,
      display_neighborhood = NULL,
      display_type = NULL
  WHERE id = ?
`);

const listVenueActiveOffersStmt = db.prepare(`
  SELECT id, venue_id, title, description, image_url, starts_at, ends_at, is_active, available_days, created_at
  FROM offers
  WHERE venue_id = ?
    AND is_active = 1
  ORDER BY created_at ASC, id ASC
`);

const listOffersStmt = db.prepare(`
  SELECT
    o.id,
    o.venue_id,
    o.title,
    o.description,
    o.image_url,
    o.starts_at,
    o.ends_at,
    o.is_active,
    o.available_days,
    o.created_at,
    COALESCE(v.display_name, v.name) AS venue_name
  FROM offers o
  JOIN venues v ON v.id = o.venue_id
  ORDER BY o.created_at DESC, o.id DESC
`);

const findOfferByIdStmt = db.prepare(`
  SELECT id, venue_id, title, description, image_url, starts_at, ends_at, is_active, available_days, created_at
  FROM offers
  WHERE id = ?
`);

const insertOfferRecordStmt = db.prepare(`
  INSERT INTO offers (
    id, venue_id, title, description, image_url, starts_at, ends_at, is_active, available_days, created_at
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  )
`);

const updateOfferActiveStmt = db.prepare(`
  UPDATE offers
  SET is_active = ?
  WHERE id = ?
`);

const updateOfferContentStmt = db.prepare(`
  UPDATE offers
  SET title = ?, description = ?, available_days = ?
  WHERE id = ?
`);

const listMemberIdsStmt = db.prepare("SELECT id FROM members");
const listMembersStmt = db.prepare(`
  SELECT m.id, m.email, m.zip_code, m.first_name, m.last_name, m.created_at,
         ms.token AS membership_token
  FROM members m
  LEFT JOIN memberships ms ON ms.member_id = m.id
  ORDER BY m.created_at DESC
`);
const insertManualVenueStmt = db.prepare(`
  INSERT INTO venues (
    id, source, source_id, enabled, name, city, state, address, neighborhood, type, description, image_url, website, phone, instagram, lat, lng, open_now, price_level, hours_summary, rating, review_count, raw_payload
  ) VALUES (
    ?, 'manual', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL
  )
`);

const markEntitlementRedeemedStmt = db.prepare(`
  UPDATE member_offers
  SET status = 'redeemed', redeemed_at = ?
  WHERE id = ?
`);

const insertRedemptionStmt = db.prepare(`
  INSERT INTO redemptions (
    id, member_offer_id, member_id, membership_token, offer_id, venue_id, staff_id, device_id, result, reason, created_at
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  )
`);

const listRedemptionsStmt = db.prepare(`
  SELECT
    id,
    member_offer_id,
    member_id,
    membership_token,
    offer_id,
    venue_id,
    staff_id,
    device_id,
    result,
    reason,
    created_at
  FROM redemptions
  ORDER BY created_at DESC, id DESC
`);

function logRedemptionEvent(event) {
  insertRedemptionStmt.run(
    createId("redeem"),
    event.memberOfferId ?? null,
    event.memberId ?? null,
    event.membershipToken ?? null,
    event.offerId ?? null,
    event.venueId,
    event.staffId ?? null,
    event.deviceId ?? null,
    event.result,
    event.reason ?? null,
    nowIso()
  );
}

const claimMembershipTxn = db.transaction(({ email, zipCode, firstName, lastName }) => {
  let member = findMemberByEmailStmt.get(email);
  if (!member) {
    const memberId = createId("mem");
    const createdAt = nowIso();
    createMemberStmt.run(memberId, email, zipCode, firstName, lastName, createdAt);
    member = findMemberByEmailStmt.get(email);
  } else {
    updateMemberProfileStmt.run(zipCode, firstName, lastName, member.id);
    member = findMemberByEmailStmt.get(email);
  }

  let membership = findMembershipByMemberIdStmt.get(member.id);
  if (!membership) {
    const createdAt = nowIso();
    let token = createMembershipToken();
    while (findMembershipByTokenStmt.get(token)) {
      token = createMembershipToken();
    }
    createMembershipStmt.run(token, member.id, zipCode, createdAt);
    membership = findMembershipByTokenStmt.get(token);
  }

  for (const offer of listOfferIdsStmt.all()) {
    const existing = findEntitlementStmt.get(member.id, offer.id);
    if (!existing) {
      insertEntitlementStmt.run(
        createId("ent"),
        member.id,
        offer.id,
        createEntitlementToken(),
        nowIso()
      );
    }
  }

  return {
    memberId: member.id,
    membership: mapMembership(membership)
  };
});

function hydrateOfferRow(row) {
  const offer = mapOffer(row);
  const venue = mapVenue({
    id: row.venue_id_join,
    source: row.venue_source,
    source_id: row.venue_source_id,
    enabled: row.venue_enabled,
    name: row.venue_name,
    display_name: row.venue_display_name,
    city: row.venue_city,
    state: row.venue_state,
    address: row.venue_address,
    display_address: row.venue_display_address,
    neighborhood: row.venue_neighborhood,
    display_neighborhood: row.venue_display_neighborhood,
    type: row.venue_type,
    display_type: row.venue_display_type,
    description: row.venue_description,
    display_description: row.venue_display_description,
    image_url: row.venue_image_url,
    display_image_url: row.venue_display_image_url,
    website: row.venue_website,
    display_website: row.venue_display_website,
    phone: row.venue_phone,
    display_phone: row.venue_display_phone,
    instagram: row.venue_instagram,
    lat: row.venue_lat,
    lng: row.venue_lng,
    open_now: row.venue_open_now,
    price_level: row.venue_price_level,
    hours_summary: row.venue_hours_summary,
    rating: row.venue_rating,
    review_count: row.venue_review_count,
    created_at: row.venue_created_at,
    featured: row.venue_featured
  });

  return { ...offer, venue };
}

function getCounts() {
  return {
    members: countStmt.members.get().count,
    memberships: countStmt.memberships.get().count,
    entitlements: countStmt.entitlements.get().count,
    redemptions: countStmt.redemptions.get().count
  };
}

function claimMembership(payload) {
  return claimMembershipTxn(payload);
}

function getMembershipByToken(token) {
  return mapMembership(findMembershipByTokenStmt.get(token));
}

function getActiveOffers({ venueId = null, membershipToken = null } = {}) {
  const resetInfo = getWeeklyResetInfo();
  const offers = listActiveOffersStmt
    .all({ nowIso: nowIso(), venueId, enabledOnly: membershipToken ? 1 : 0 })
    .map((row) => {
      const offer = hydrateOfferRow(row);
      return {
        ...offer,
        ...getOfferAvailability(offer)
      };
    });

  if (!membershipToken) {
    return offers;
  }

  const membership = getMembershipByToken(membershipToken);
  if (!membership) {
    return null;
  }

  return offers.map((offer) => {
    const entitlement = normalizeEntitlement(
      mapEntitlement(findEntitlementStmt.get(membership.memberId, offer.id))
    );
    return {
      ...offer,
      entitlementStatus: entitlement?.status ?? "missing",
      redeemedAt: entitlement?.redeemedAt ?? null,
      nextResetAt: resetInfo.nextResetAt
    };
  });
}

function getVenueById(venueId) {
  return mapVenue(findVenueByIdStmt.get(venueId));
}

const createVenueTxn = db.transaction((venueInput) => {
  const baseId = slugify(venueInput.name) || "venue";
  let venueId = `manual_${baseId}`;
  let suffix = 2;

  while (findVenueByIdStmt.get(venueId)) {
    venueId = `manual_${baseId}_${suffix}`;
    suffix += 1;
  }

  insertManualVenueStmt.run(
    venueId,
    venueInput.enabled ? 1 : 0,
    venueInput.name,
    venueInput.city,
    venueInput.state,
    venueInput.address,
    venueInput.neighborhood,
    venueInput.type,
    venueInput.description,
    venueInput.imageUrl,
    venueInput.website,
    venueInput.phone,
    venueInput.instagram,
    venueInput.lat,
    venueInput.lng
  );

  return {
    ok: true,
    venue: getVenueById(venueId)
  };
});

const createOfferTxn = db.transaction((offerInput) => {
  const venue = getVenueById(offerInput.venueId);
  if (!venue) {
    return { ok: false, statusCode: 404, reason: "venue_not_found" };
  }

  if (findOfferByIdStmt.get(offerInput.id)) {
    return { ok: false, statusCode: 409, reason: "offer_exists" };
  }

  const createdAt = nowIso();
  insertOfferRecordStmt.run(
    offerInput.id,
    offerInput.venueId,
    offerInput.title,
    offerInput.description,
    offerInput.imageUrl,
    offerInput.startsAt,
    offerInput.endsAt,
    offerInput.isActive ? 1 : 0,
    serializeAvailableDays(offerInput.availableDays),
    createdAt
  );

  for (const member of listMemberIdsStmt.all()) {
    const existing = findEntitlementStmt.get(member.id, offerInput.id);
    if (!existing) {
      insertEntitlementStmt.run(
        createId("ent"),
        member.id,
        offerInput.id,
        createEntitlementToken(),
        createdAt
      );
    }
  }

  return {
    ok: true,
    offer: {
      ...mapOffer(findOfferByIdStmt.get(offerInput.id)),
      ...getOfferAvailability(mapOffer(findOfferByIdStmt.get(offerInput.id)))
    }
  };
});

function getVenueOffers(venueId, membershipToken = null) {
  const resetInfo = getWeeklyResetInfo();
  const venue = getVenueById(venueId);
  if (!venue || (membershipToken && !venue.enabled)) {
    return null;
  }

  const offers = listVenueActiveOffersStmt
    .all(venueId)
    .map((row) => {
      const offer = mapOffer(row);
      return {
        ...offer,
        ...getOfferAvailability(offer)
      };
    });

  if (!membershipToken) {
    return { venue, offers };
  }

  const membership = getMembershipByToken(membershipToken);
  if (!membership) {
    return { venue, membership: null, offers: null };
  }

  return {
    venue,
    membership,
    offers: offers.map((offer) => {
      const entitlement = normalizeEntitlement(
        mapEntitlement(findEntitlementStmt.get(membership.memberId, offer.id))
      );
      return {
        ...offer,
        entitlementStatus: entitlement?.status ?? "missing",
        redeemedAt: entitlement?.redeemedAt ?? null,
        nextResetAt: resetInfo.nextResetAt
      };
    })
  };
}

const redeemTxn = db.transaction(({ membershipToken, offerId, venueId, staffId, deviceId }) => {
  const resetInfo = getWeeklyResetInfo();
  const membership = getMembershipByToken(membershipToken);
  if (!membership) {
    logRedemptionEvent({
      membershipToken,
      offerId,
      venueId,
      staffId,
      deviceId,
      result: "denied",
      reason: "membership_not_found"
    });
    return { ok: false, statusCode: 404, reason: "membership_not_found" };
  }

  const offer = mapOffer(findOfferByIdStmt.get(offerId));
  if (!offer) {
    logRedemptionEvent({
      memberId: membership.memberId,
      membershipToken,
      offerId,
      venueId,
      staffId,
      deviceId,
      result: "denied",
      reason: "offer_not_found"
    });
    return { ok: false, statusCode: 404, reason: "offer_not_found" };
  }

  if (offer.venueId !== venueId) {
    logRedemptionEvent({
      memberId: membership.memberId,
      membershipToken,
      offerId,
      venueId,
      staffId,
      deviceId,
      result: "denied",
      reason: "venue_mismatch"
    });
    return { ok: false, statusCode: 400, reason: "venue_mismatch" };
  }

  if (!offer.isActive) {
    logRedemptionEvent({
      memberId: membership.memberId,
      membershipToken,
      offerId,
      venueId,
      staffId,
      deviceId,
      result: "denied",
      reason: "offer_inactive"
    });
    return { ok: false, statusCode: 400, reason: "offer_inactive" };
  }

  if (!getOfferAvailability(offer).isAvailableToday) {
    logRedemptionEvent({
      memberId: membership.memberId,
      membershipToken,
      offerId,
      venueId,
      staffId,
      deviceId,
      result: "denied",
      reason: "offer_unavailable_today"
    });
    return { ok: false, statusCode: 400, reason: "offer_unavailable_today" };
  }

  const entitlement = normalizeEntitlement(
    mapEntitlement(findEntitlementStmt.get(membership.memberId, offerId))
  );
  if (!entitlement) {
    logRedemptionEvent({
      memberId: membership.memberId,
      membershipToken,
      offerId,
      venueId,
      staffId,
      deviceId,
      result: "denied",
      reason: "entitlement_missing"
    });
    return { ok: false, statusCode: 403, reason: "entitlement_missing" };
  }

  if (entitlement.status === "redeemed") {
    logRedemptionEvent({
      memberOfferId: entitlement.id,
      memberId: membership.memberId,
      membershipToken,
      offerId,
      venueId,
      staffId,
      deviceId,
      result: "approved",
      reason: "duplicate_replay"
    });
    return {
      ok: true,
      status: "approved",
      duplicate: true,
      membershipToken,
      offerId,
      venueId,
      redeemedAt: entitlement.redeemedAt,
      nextResetAt: resetInfo.nextResetAt
    };
  }

  const currentIso = nowIso();
  markEntitlementRedeemedStmt.run(currentIso, entitlement.id);

  logRedemptionEvent({
    memberOfferId: entitlement.id,
    memberId: membership.memberId,
    membershipToken,
    offerId,
    venueId,
    staffId,
    deviceId,
    result: "approved",
    reason: null
  });

  return {
    ok: true,
    status: "approved",
    membershipToken,
    offerId,
    venueId,
    redeemedAt: currentIso,
    nextResetAt: resetInfo.nextResetAt
  };
});

function redeemOffer(payload) {
  return redeemTxn(payload);
}

function createOffer(payload) {
  return createOfferTxn(payload);
}

function createVenue(payload) {
  return createVenueTxn(payload);
}

function listRedemptions() {
  return listRedemptionsStmt.all().map((row) => ({
    id: row.id,
    memberOfferId: row.member_offer_id,
    memberId: row.member_id,
    membershipToken: row.membership_token,
    offerId: row.offer_id,
    venueId: row.venue_id,
    staffId: row.staff_id,
    deviceId: row.device_id,
    result: row.result,
    reason: row.reason,
    createdAt: row.created_at
  }));
}

function listOffers() {
  return listOffersStmt.all().map((row) => ({
    ...mapOffer(row),
    ...getOfferAvailability(mapOffer(row)),
    venueName: row.venue_name
  }));
}

function listVenues() {
  return listVenuesStmt.all({ enabledOnly: 0 }).map((row) => mapVenue(row));
}

function listEnabledVenues() {
  return listVenuesStmt.all({ enabledOnly: 1 }).map((row) => mapVenue(row));
}

const syncBarglanceCityTxn = db.transaction((venues) => {
  for (const venue of venues) {
    upsertVenueStmt.run(venue);
  }
});

async function syncBarglanceCity({ state, city, maxPages = 1, perPage = 50 }) {
  const pages = await fetchBarsByCity({ state, city, maxPages, perPage });
  const records = pages.flatMap((page) =>
    Array.isArray(page.bars) ? page.bars.map((bar) => mapBarToVenueRecord(bar)) : []
  );

  syncBarglanceCityTxn(records);

  return {
    ok: true,
    imported: records.length,
    state,
    city,
    pagesFetched: pages.length,
    totalAvailable: pages[0]?.pagination?.total_count ?? records.length,
    venues: records.slice(0, 10).map((venue) => ({
      id: venue.id,
      sourceId: venue.sourceId,
      name: venue.name,
      address: venue.address
    }))
  };
}

function setVenueEnabled(venueId, enabled) {
  const venue = getVenueById(venueId);
  if (!venue) {
    return { ok: false, statusCode: 404, reason: "venue_not_found" };
  }

  updateVenueEnabledStmt.run(enabled ? 1 : 0, venueId);

  return {
    ok: true,
    venue: getVenueById(venueId)
  };
}

const updateVenueFeaturedStmt = db.prepare("UPDATE venues SET featured = ? WHERE id = ?");

function setVenueFeatured(venueId, featured) {
  const venue = getVenueById(venueId);
  if (!venue) {
    return { ok: false, statusCode: 404, reason: "venue_not_found" };
  }

  updateVenueFeaturedStmt.run(featured ? 1 : 0, venueId);

  return {
    ok: true,
    venue: getVenueById(venueId)
  };
}

const updateVenueProfileTxn = db.transaction((venueId, profile) => {
  const venue = getVenueById(venueId);
  if (!venue) {
    return { ok: false, statusCode: 404, reason: "venue_not_found" };
  }

  updateVenueProfileStmt.run(
    profile.name,
    profile.description,
    profile.imageUrl,
    profile.address,
    profile.website,
    profile.phone,
    profile.neighborhood,
    profile.type,
    profile.lat,
    profile.lng,
    venueId
  );

  return {
    ok: true,
    venue: getVenueById(venueId)
  };
});

function updateVenueProfile(venueId, profile) {
  return updateVenueProfileTxn(venueId, profile);
}

function clearVenueProfile(venueId) {
  const venue = getVenueById(venueId);
  if (!venue) {
    return { ok: false, statusCode: 404, reason: "venue_not_found" };
  }

  clearVenueProfileStmt.run(venueId);

  return {
    ok: true,
    venue: getVenueById(venueId)
  };
}

function setOfferActive(offerId, isActive) {
  const offer = mapOffer(findOfferByIdStmt.get(offerId));
  if (!offer) {
    return { ok: false, statusCode: 404, reason: "offer_not_found" };
  }

  updateOfferActiveStmt.run(isActive ? 1 : 0, offerId);

  return {
    ok: true,
    offer: mapOffer(findOfferByIdStmt.get(offerId))
  };
}

function updateOfferContent(offerId, { title, description, availableDays }) {
  const offer = mapOffer(findOfferByIdStmt.get(offerId));
  if (!offer) {
    return { ok: false, statusCode: 404, reason: "offer_not_found" };
  }

  updateOfferContentStmt.run(title, description ?? null, serializeAvailableDays(availableDays), offerId);

  return {
    ok: true,
    offer: {
      ...mapOffer(findOfferByIdStmt.get(offerId)),
      ...getOfferAvailability(mapOffer(findOfferByIdStmt.get(offerId)))
    }
  };
}

const deleteOfferStmt = db.prepare("DELETE FROM offers WHERE id = ?");
const deleteEntitlementsByOfferStmt = db.prepare("DELETE FROM member_offers WHERE offer_id = ?");

function deleteOffer(offerId) {
  const offer = mapOffer(findOfferByIdStmt.get(offerId));
  if (!offer) {
    return { ok: false, statusCode: 404, reason: "offer_not_found" };
  }

  deleteEntitlementsByOfferStmt.run(offerId);
  deleteOfferStmt.run(offerId);

  return { ok: true, deletedOfferId: offerId };
}

const deleteVenueStmt = db.prepare("DELETE FROM venues WHERE id = ?");
const deleteOffersByVenueStmt = db.prepare("DELETE FROM offers WHERE venue_id = ?");
const findOfferIdsByVenueStmt = db.prepare("SELECT id FROM offers WHERE venue_id = ?");
const deleteEntitlementsByOfferBatchStmt = db.prepare("DELETE FROM member_offers WHERE offer_id = ?");

const deleteVenueTxn = db.transaction((venueId) => {
  const venue = getVenueById(venueId);
  if (!venue) {
    return { ok: false, statusCode: 404, reason: "venue_not_found" };
  }

  const offerIds = findOfferIdsByVenueStmt.all(venueId).map((r) => r.id);
  for (const oid of offerIds) {
    deleteEntitlementsByOfferBatchStmt.run(oid);
  }
  deleteOffersByVenueStmt.run(venueId);
  deleteVenueStmt.run(venueId);

  return { ok: true, deletedVenueId: venueId, deletedOffers: offerIds.length };
});

const loginByEmailTxn = db.transaction((email) => {
  const member = findMemberByEmailStmt.get(email);
  if (!member) {
    return { ok: false, statusCode: 404, reason: "member_not_found" };
  }
  const membership = findMembershipByMemberIdStmt.get(member.id);
  if (!membership) {
    return { ok: false, statusCode: 404, reason: "membership_not_found" };
  }

  for (const offer of listOfferIdsStmt.all()) {
    const existing = findEntitlementStmt.get(member.id, offer.id);
    if (!existing) {
      insertEntitlementStmt.run(
        createId("ent"),
        member.id,
        offer.id,
        createEntitlementToken(),
        nowIso()
      );
    }
  }

  return {
    ok: true,
    memberId: member.id,
    membershipToken: membership.token,
    zipCode: membership.zip_code
  };
});

function loginByEmail(email) {
  return loginByEmailTxn(email);
}

function deleteVenue(venueId) {
  return deleteVenueTxn(venueId);
}

function listMembers() {
  return listMembersStmt.all().map((row) => ({
    id: row.id,
    email: row.email,
    zipCode: row.zip_code,
    firstName: row.first_name,
    lastName: row.last_name,
    membershipToken: row.membership_token,
    createdAt: row.created_at
  }));
}

export {
  claimMembership,
  createOffer,
  listMembers,
  loginByEmail,
  createVenue,
  DB_PATH,
  deleteOffer,
  deleteVenue,
  getActiveOffers,
  getCounts,
  getWeeklyResetInfo,
  getVenueById,
  getVenueOffers,
  listEnabledVenues,
  listOffers,
  listRedemptions,
  listVenues,
  redeemOffer,
  clearVenueProfile,
  setOfferActive,
  updateOfferContent,
  setVenueEnabled,
  setVenueFeatured,
  syncBarglanceCity,
  updateVenueProfile
};
