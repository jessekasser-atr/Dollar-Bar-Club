import test from "node:test";
import assert from "node:assert/strict";
import {
  getOfferAvailability,
  normalizeEntitlementForCadence,
  validateDailyTimeWindow
} from "../src/offer-rules.js";

function offer(overrides = {}) {
  return {
    isActive: true,
    startsAt: "2026-01-01T00:00:00.000Z",
    endsAt: "2026-12-31T23:59:59.000Z",
    availableDays: [],
    availableStartTime: null,
    availableEndTime: null,
    ...overrides
  };
}

test("an all-day offer remains available with backward-compatible defaults", () => {
  const availability = getOfferAvailability(
    offer(),
    new Date("2026-07-16T21:30:00.000Z")
  );

  assert.equal(availability.isAvailableNow, true);
  assert.equal(availability.isAvailableToday, true);
  assert.equal(availability.availabilityState, "available_now");
  assert.equal(availability.availabilitySummary, "Every day");
});

test("a same-day Austin time window opens and closes at the configured times", () => {
  const scheduledOffer = offer({
    availableDays: [4],
    availableStartTime: "16:00",
    availableEndTime: "19:00"
  });

  const before = getOfferAvailability(scheduledOffer, new Date("2026-07-16T20:30:00.000Z"));
  const during = getOfferAvailability(scheduledOffer, new Date("2026-07-16T21:30:00.000Z"));
  const atEnd = getOfferAvailability(scheduledOffer, new Date("2026-07-17T00:00:00.000Z"));

  assert.equal(before.isAvailableNow, false);
  assert.equal(before.availabilityState, "later_today");
  assert.equal(during.isAvailableNow, true);
  assert.equal(atEnd.isAvailableNow, false);
  assert.equal(atEnd.availabilityState, "ended_today");
  assert.equal(during.availabilitySummary, "Thursday, 4:00 PM–7:00 PM");
});

test("an overnight window uses the weekday on which the window starts", () => {
  const fridayLateNightOffer = offer({
    availableDays: [5],
    availableStartTime: "22:00",
    availableEndTime: "02:00"
  });

  const fridayNight = getOfferAvailability(
    fridayLateNightOffer,
    new Date("2026-07-18T04:00:00.000Z")
  );
  const saturdayEarly = getOfferAvailability(
    fridayLateNightOffer,
    new Date("2026-07-18T06:00:00.000Z")
  );
  const saturdayAfterClose = getOfferAvailability(
    fridayLateNightOffer,
    new Date("2026-07-18T08:00:00.000Z")
  );

  assert.equal(fridayNight.isAvailableNow, true);
  assert.equal(saturdayEarly.isAvailableNow, true);
  assert.equal(saturdayAfterClose.isAvailableNow, false);
});

test("daily windows require two distinct valid times", () => {
  assert.deepEqual(validateDailyTimeWindow("16:00", "19:00"), {
    ok: true,
    availableStartTime: "16:00",
    availableEndTime: "19:00"
  });
  assert.equal(validateDailyTimeWindow("16:00", null).reason, "daily_time_window_incomplete");
  assert.equal(validateDailyTimeWindow("25:00", "19:00").reason, "available_start_time_invalid");
  assert.equal(validateDailyTimeWindow("16:00", "16:00").reason, "daily_time_window_empty");
});

test("weekly redemptions reset while once-ever redemptions remain redeemed", () => {
  const entitlement = {
    id: "ent_1",
    status: "redeemed",
    redeemedAt: "2026-07-01T18:00:00.000Z"
  };
  const currentWeekStartAt = "2026-07-12T05:00:00.000Z";

  const weekly = normalizeEntitlementForCadence(entitlement, "weekly", currentWeekStartAt);
  const once = normalizeEntitlementForCadence(entitlement, "once", currentWeekStartAt);

  assert.equal(weekly.status, "issued");
  assert.equal(weekly.redeemedAt, null);
  assert.equal(once.status, "redeemed");
  assert.equal(once.redeemedAt, entitlement.redeemedAt);
});

test("a redemption from the current week stays redeemed for weekly offers", () => {
  const entitlement = {
    id: "ent_2",
    status: "redeemed",
    redeemedAt: "2026-07-15T18:00:00.000Z"
  };

  const normalized = normalizeEntitlementForCadence(
    entitlement,
    "weekly",
    "2026-07-12T05:00:00.000Z"
  );

  assert.equal(normalized.status, "redeemed");
  assert.equal(normalized.redeemedAt, entitlement.redeemedAt);
});
