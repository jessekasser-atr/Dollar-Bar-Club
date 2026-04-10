import express from "express";
import {
  clearVenueProfile,
  claimMembership,
  createOffer,
  createVenue,
  DB_PATH,
  deleteOffer,
  deleteVenue,
  getActiveOffers,
  getCounts,
  getWeeklyResetInfo,
  listOffers,
  getVenueOffers,
  listEnabledVenues,
  listMembers,
  loginByEmail,
  listRedemptions,
  listVenues,
  redeemOffer,
  setOfferActive,
  updateOfferContent,
  setVenueEnabled,
  setVenueFeatured,
  syncBarglanceCity,
  updateVenueProfile
} from "./db.js";
import { getBarglanceApiKey } from "./barglance.js";

const app = express();
app.use(express.json());

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174"
];
const CAPACITOR_ORIGINS = [
  "capacitor://localhost",
  "ionic://localhost",
  "https://localhost"
];
const ADMIN_KEY_HEADER = "x-admin-key";
const CLAIM_WINDOW_MS = 15 * 60 * 1000;
const CLAIM_MAX_REQUESTS = 5;
const REDEEM_WINDOW_MS = 5 * 60 * 1000;
const REDEEM_MAX_REQUESTS = 12;

function getAllowedOrigins() {
  const configured = String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const base = configured.length ? configured : DEFAULT_ALLOWED_ORIGINS;
  return [...new Set([...base, ...CAPACITOR_ORIGINS])];
}

function getRequestIp(req) {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)[0];

  return forwardedFor || req.ip || req.socket?.remoteAddress || "unknown";
}

function createRateLimiter({ windowMs, maxRequests, keyPrefix, skip }) {
  const buckets = new Map();

  return (req, res, next) => {
    if (skip?.(req)) {
      next();
      return;
    }

    const now = Date.now();
    const key = `${keyPrefix}:${getRequestIp(req)}`;
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + windowMs
      });
      next();
      return;
    }

    if (existing.count >= maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        ok: false,
        reason: "rate_limited",
        retryAfterSeconds
      });
      return;
    }

    existing.count += 1;
    next();
  };
}

app.use((req, res, next) => {
  const origin = String(req.headers.origin || "");
  const allowedOrigins = getAllowedOrigins();
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,X-Admin-Key");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

const AUSTIN_ZIP_RE = /^(73301|787\d{2})$/;
const claimRateLimiter = createRateLimiter({
  windowMs: CLAIM_WINDOW_MS,
  maxRequests: CLAIM_MAX_REQUESTS,
  keyPrefix: "claim"
});
const redeemRateLimiter = createRateLimiter({
  windowMs: REDEEM_WINDOW_MS,
  maxRequests: REDEEM_MAX_REQUESTS,
  keyPrefix: "redeem"
});

function getAdminAccessKey() {
  return process.env.ADMIN_ACCESS_KEY || null;
}

function requireAdminAccess(req, res, next) {
  const adminAccessKey = getAdminAccessKey();
  if (!adminAccessKey) {
    return res.status(503).json({ ok: false, reason: "admin_access_not_configured" });
  }

  const providedKey = String(req.header(ADMIN_KEY_HEADER) || "").trim();
  if (!providedKey || providedKey !== adminAccessKey) {
    return res.status(401).json({ ok: false, reason: "admin_access_required" });
  }

  next();
}

function isAustinZip(zipCode) {
  return AUSTIN_ZIP_RE.test(String(zipCode || "").trim());
}

function parseNullableNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOptionalText(value) {
  const normalized = String(value || "").trim();
  return normalized ? normalized : null;
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

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "dbc-api",
    dbPath: DB_PATH,
    counts: getCounts(),
    integrations: {
      barglanceConfigured: Boolean(getBarglanceApiKey()),
      adminAccessConfigured: Boolean(getAdminAccessKey())
    },
    security: {
      allowedOrigins: getAllowedOrigins(),
      claimRateLimit: {
        windowMs: CLAIM_WINDOW_MS,
        maxRequests: CLAIM_MAX_REQUESTS
      },
      redeemRateLimit: {
        windowMs: REDEEM_WINDOW_MS,
        maxRequests: REDEEM_MAX_REQUESTS
      }
    }
  });
});

app.post("/memberships/claim", claimRateLimiter, (req, res) => {
  const { email, zipCode, firstName, lastName } = req.body || {};
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedZip = String(zipCode || "").trim();

  if (!normalizedEmail || !normalizedZip) {
    return res.status(400).json({ ok: false, reason: "email_and_zip_required" });
  }

  if (!isAustinZip(normalizedZip)) {
    return res.status(400).json({ ok: false, reason: "non_austin_zip" });
  }

  const claimed = claimMembership({
    email: normalizedEmail,
    zipCode: normalizedZip,
    firstName: String(firstName || "").trim(),
    lastName: String(lastName || "").trim()
  });

  return res.json({
    ok: true,
    memberId: claimed.memberId,
    membershipToken: claimed.membership.token,
    zipCode: claimed.membership.zipCode
  });
});

app.post("/memberships/login", claimRateLimiter, (req, res) => {
  const { email } = req.body || {};
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail) {
    return res.status(400).json({ ok: false, reason: "email_required" });
  }

  const result = loginByEmail(normalizedEmail);

  if (!result.ok) {
    return res.status(result.statusCode).json({ ok: false, reason: result.reason });
  }

  return res.json({
    ok: true,
    memberId: result.memberId,
    membershipToken: result.membershipToken,
    zipCode: result.zipCode
  });
});

app.get("/offers/active", (req, res) => {
  const { venueId, membershipToken } = req.query || {};
  const membershipTokenValue = membershipToken ? String(membershipToken) : null;
  const active = getActiveOffers({
    venueId: venueId ? String(venueId) : null,
    membershipToken: membershipTokenValue
  });

  if (membershipTokenValue && !active) {
    return res.status(404).json({ ok: false, reason: "membership_not_found" });
  }

  return res.json({ ok: true, offers: active, weeklyReset: getWeeklyResetInfo() });
});

app.post("/offers", requireAdminAccess, (req, res) => {
  const { id, venueId, title, description, imageUrl, isActive, availableDays } = req.body || {};

  const normalizedId = String(id || "").trim();
  const normalizedVenueId = String(venueId || "").trim();
  const normalizedTitle = String(title || "").trim();

  if (!normalizedId || !normalizedVenueId || !normalizedTitle) {
    return res.status(400).json({ ok: false, reason: "offer_fields_required" });
  }

  const result = createOffer({
    id: normalizedId,
    venueId: normalizedVenueId,
    title: normalizedTitle,
    description: description ? String(description).trim() : null,
    imageUrl: imageUrl ? String(imageUrl).trim() : null,
    startsAt: "2000-01-01T00:00:00.000Z",
    endsAt: "2099-12-31T23:59:59.000Z",
    isActive: isActive !== false,
    availableDays: normalizeAvailableDays(availableDays)
  });

  if (!result.ok) {
    return res.status(result.statusCode).json({
      ok: false,
      reason: result.reason
    });
  }

  return res.status(201).json({
    ok: true,
    offer: result.offer
  });
});

app.get("/admin/session", requireAdminAccess, (_req, res) => {
  res.json({ ok: true });
});

app.get("/admin/offers", requireAdminAccess, (_req, res) => {
  res.json({ ok: true, offers: listOffers() });
});

app.post("/admin/offers/:id/active", requireAdminAccess, (req, res) => {
  const result = setOfferActive(req.params.id, Boolean(req.body?.isActive));

  if (!result.ok) {
    return res.status(result.statusCode).json({ ok: false, reason: result.reason });
  }

  return res.json(result);
});

app.post("/admin/offers/:id/content", requireAdminAccess, (req, res) => {
  const { title, description, availableDays } = req.body || {};

  if (!title || typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ ok: false, reason: "title_required" });
  }

  const result = updateOfferContent(req.params.id, {
    title: title.trim(),
    description: description != null ? String(description).trim() || null : null,
    availableDays: normalizeAvailableDays(availableDays)
  });

  if (!result.ok) {
    return res.status(result.statusCode).json({ ok: false, reason: result.reason });
  }

  return res.json(result);
});

app.delete("/admin/offers/:id", requireAdminAccess, (req, res) => {
  const result = deleteOffer(req.params.id);

  if (!result.ok) {
    return res.status(result.statusCode).json({ ok: false, reason: result.reason });
  }

  return res.json(result);
});

app.delete("/admin/venues/:id", requireAdminAccess, (req, res) => {
  const result = deleteVenue(req.params.id);

  if (!result.ok) {
    return res.status(result.statusCode).json({ ok: false, reason: result.reason });
  }

  return res.json(result);
});

app.post("/redeem", redeemRateLimiter, (req, res) => {
  const { membershipToken, offerId, venueId, staffId, deviceId } = req.body || {};
  if (!membershipToken || !offerId || !venueId) {
    return res.status(400).json({ ok: false, reason: "membership_offer_venue_required" });
  }

  try {
    const result = redeemOffer({
      membershipToken: String(membershipToken),
      offerId: String(offerId),
      venueId: String(venueId),
      staffId: staffId ? String(staffId) : null,
      deviceId: deviceId ? String(deviceId) : null
    });

    if (!result.ok) {
      return res.status(result.statusCode).json({
        ok: false,
        reason: result.reason,
        ...(result.redeemedAt ? { redeemedAt: result.redeemedAt } : {})
      });
    }

    return res.json({
      ...result,
      weeklyReset: getWeeklyResetInfo()
    });
  } catch (err) {
    console.error("Redeem error:", err);
    return res.status(500).json({ ok: false, reason: "internal_error" });
  }
});

app.get("/admin/venues", requireAdminAccess, (_req, res) => {
  res.json({ ok: true, venues: listVenues() });
});

app.post("/admin/venues", requireAdminAccess, (req, res) => {
  const {
    name,
    city,
    state,
    address,
    neighborhood,
    type,
    description,
    imageUrl,
    website,
    phone,
    instagram,
    lat,
    lng,
    enabled
  } = req.body || {};

  const normalizedName = String(name || "").trim();
  const normalizedCity = String(city || "Austin").trim();
  const normalizedState = String(state || "TX").trim().toUpperCase();

  if (!normalizedName || !normalizedCity || !normalizedState) {
    return res.status(400).json({ ok: false, reason: "venue_fields_required" });
  }

  const result = createVenue({
    name: normalizedName,
    city: normalizedCity,
    state: normalizedState,
    address: address ? String(address).trim() : null,
    neighborhood: neighborhood ? String(neighborhood).trim() : null,
    type: type ? String(type).trim() : null,
    description: description ? String(description).trim() : null,
    imageUrl: imageUrl ? String(imageUrl).trim() : null,
    website: website ? String(website).trim() : null,
    phone: phone ? String(phone).trim() : null,
    instagram: instagram ? String(instagram).trim() : null,
    lat: parseNullableNumber(lat),
    lng: parseNullableNumber(lng),
    enabled: enabled !== false
  });

  return res.status(201).json(result);
});

app.post("/admin/venues/:id/enabled", requireAdminAccess, (req, res) => {
  const result = setVenueEnabled(req.params.id, Boolean(req.body?.enabled));

  if (!result.ok) {
    return res.status(result.statusCode).json({ ok: false, reason: result.reason });
  }

  return res.json(result);
});

app.post("/admin/venues/:id/featured", requireAdminAccess, (req, res) => {
  const result = setVenueFeatured(req.params.id, Boolean(req.body?.featured));

  if (!result.ok) {
    return res.status(result.statusCode).json({ ok: false, reason: result.reason });
  }

  return res.json(result);
});

app.post("/admin/venues/:id/profile", requireAdminAccess, (req, res) => {
  const result = updateVenueProfile(req.params.id, {
    name: normalizeOptionalText(req.body?.name),
    description: normalizeOptionalText(req.body?.description),
    imageUrl: normalizeOptionalText(req.body?.imageUrl),
    address: normalizeOptionalText(req.body?.address),
    website: normalizeOptionalText(req.body?.website),
    phone: normalizeOptionalText(req.body?.phone),
    neighborhood: normalizeOptionalText(req.body?.neighborhood),
    type: normalizeOptionalText(req.body?.type),
    lat: parseNullableNumber(req.body?.lat),
    lng: parseNullableNumber(req.body?.lng)
  });

  if (!result.ok) {
    return res.status(result.statusCode).json({ ok: false, reason: result.reason });
  }

  return res.json(result);
});

app.post("/admin/venues/:id/profile/reset", requireAdminAccess, (req, res) => {
  const result = clearVenueProfile(req.params.id);

  if (!result.ok) {
    return res.status(result.statusCode).json({ ok: false, reason: result.reason });
  }

  return res.json(result);
});

app.post("/admin/sync/barglance", requireAdminAccess, async (req, res) => {
  const { state, city, maxPages, perPage } = req.body || {};

  if (!getBarglanceApiKey()) {
    return res.status(400).json({ ok: false, reason: "barglance_not_configured" });
  }

  const normalizedState = String(state || "TX").trim().toUpperCase();
  const normalizedCity = String(city || "Austin").trim();
  const parsedMaxPages = Math.max(1, Math.min(10, Number(maxPages || 1)));
  const parsedPerPage = Math.max(1, Math.min(100, Number(perPage || 50)));

  try {
    const result = await syncBarglanceCity({
      state: normalizedState,
      city: normalizedCity,
      maxPages: parsedMaxPages,
      perPage: parsedPerPage
    });

    return res.json(result);
  } catch (error) {
    return res.status(502).json({
      ok: false,
      reason: "barglance_sync_failed",
      error: String(error)
    });
  }
});

app.get("/admin/redemptions", requireAdminAccess, (_req, res) => {
  res.json({ ok: true, redemptions: listRedemptions() });
});

app.get("/admin/members", requireAdminAccess, (_req, res) => {
  res.json({ ok: true, members: listMembers() });
});

app.get("/venues/:id", (req, res) => {
  const venueBundle = getVenueOffers(
    req.params.id,
    req.query?.membershipToken ? String(req.query.membershipToken) : null
  );

  if (!venueBundle) {
    return res.status(404).json({ ok: false, reason: "venue_not_found" });
  }

  if (req.query?.membershipToken && !venueBundle.membership) {
    return res.status(404).json({ ok: false, reason: "membership_not_found" });
  }

  return res.json({
    ok: true,
    venue: venueBundle.venue,
    offers: venueBundle.offers,
    weeklyReset: getWeeklyResetInfo()
  });
});

app.get("/venues", (_req, res) => {
  res.json({ ok: true, venues: listEnabledVenues() });
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => {
  console.log(`DBC API listening on http://localhost:${port}`);
});
