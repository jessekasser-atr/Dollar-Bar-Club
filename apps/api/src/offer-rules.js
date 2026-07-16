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
const REDEMPTION_CADENCES = new Set(["weekly", "once"]);
const DAILY_TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

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

function normalizeDailyTime(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalized = String(value).trim();
  return DAILY_TIME_RE.test(normalized) ? normalized : null;
}

function validateDailyTimeWindow(availableStartTime, availableEndTime) {
  const startTime = normalizeDailyTime(availableStartTime);
  const endTime = normalizeDailyTime(availableEndTime);
  const startProvided = availableStartTime !== undefined && availableStartTime !== null && availableStartTime !== "";
  const endProvided = availableEndTime !== undefined && availableEndTime !== null && availableEndTime !== "";

  if (startProvided && !startTime) {
    return { ok: false, reason: "available_start_time_invalid" };
  }
  if (endProvided && !endTime) {
    return { ok: false, reason: "available_end_time_invalid" };
  }
  if (Boolean(startTime) !== Boolean(endTime)) {
    return { ok: false, reason: "daily_time_window_incomplete" };
  }
  if (startTime && startTime === endTime) {
    return { ok: false, reason: "daily_time_window_empty" };
  }

  return { ok: true, availableStartTime: startTime, availableEndTime: endTime };
}

function isValidRedemptionCadence(value) {
  return REDEMPTION_CADENCES.has(String(value || "").trim().toLowerCase());
}

function normalizeRedemptionCadence(value) {
  const normalized = String(value || "weekly").trim().toLowerCase();
  return REDEMPTION_CADENCES.has(normalized) ? normalized : "weekly";
}

function dailyTimeToMinutes(value) {
  const normalized = normalizeDailyTime(value);
  if (!normalized) {
    return null;
  }
  const [hour, minute] = normalized.split(":").map(Number);
  return hour * 60 + minute;
}

function formatDailyTime(value) {
  const minutes = dailyTimeToMinutes(value);
  if (minutes === null) {
    return "";
  }

  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function formatAvailabilitySummary(availableDays, availableStartTime = null, availableEndTime = null) {
  const days = normalizeAvailableDays(availableDays);
  const daySummary = days.length
    ? days.map((day) => WEEKDAY_LABELS[day]).join(", ")
    : "Every day";
  const startTime = normalizeDailyTime(availableStartTime);
  const endTime = normalizeDailyTime(availableEndTime);

  if (!startTime || !endTime) {
    return daySummary;
  }

  return `${daySummary}, ${formatDailyTime(startTime)}–${formatDailyTime(endTime)}`;
}

function dayMatches(availableDays, weekdayIndex) {
  return availableDays.length === 0 || availableDays.includes(weekdayIndex);
}

function getOfferAvailability(offer, referenceDate = new Date()) {
  const startsAtMs = offer.startsAt ? Date.parse(offer.startsAt) : Number.NaN;
  const endsAtMs = offer.endsAt ? Date.parse(offer.endsAt) : Number.NaN;
  const referenceMs = referenceDate.getTime();
  const withinStart = !Number.isFinite(startsAtMs) || referenceMs >= startsAtMs;
  const withinEnd = !Number.isFinite(endsAtMs) || referenceMs <= endsAtMs;
  const availableDays = normalizeAvailableDays(offer.availableDays);
  const availableStartTime = normalizeDailyTime(offer.availableStartTime);
  const availableEndTime = normalizeDailyTime(offer.availableEndTime);
  const hasDailyWindow = Boolean(availableStartTime && availableEndTime);
  const local = getZonedDateParts(referenceDate, AUSTIN_TIME_ZONE);
  const weekdayIndex = WEEKDAY_TO_INDEX[local.weekday] ?? 0;
  const previousWeekdayIndex = (weekdayIndex + 6) % 7;
  const currentMinutes = local.hour * 60 + local.minute;
  const startMinutes = dailyTimeToMinutes(availableStartTime);
  const endMinutes = dailyTimeToMinutes(availableEndTime);
  let availabilityState = "available_now";
  let matchesSchedule = dayMatches(availableDays, weekdayIndex);

  if (!offer.isActive) {
    availabilityState = "inactive";
    matchesSchedule = false;
  } else if (!withinStart) {
    availabilityState = "not_started";
    matchesSchedule = false;
  } else if (!withinEnd) {
    availabilityState = "offer_ended";
    matchesSchedule = false;
  } else if (!hasDailyWindow) {
    if (!matchesSchedule) {
      availabilityState = "unavailable_today";
    }
  } else if (startMinutes < endMinutes) {
    if (!matchesSchedule) {
      availabilityState = "unavailable_today";
    } else if (currentMinutes < startMinutes) {
      availabilityState = "later_today";
      matchesSchedule = false;
    } else if (currentMinutes >= endMinutes) {
      availabilityState = "ended_today";
      matchesSchedule = false;
    }
  } else if (currentMinutes >= startMinutes) {
    if (!matchesSchedule) {
      availabilityState = "unavailable_today";
    }
  } else if (currentMinutes < endMinutes) {
    matchesSchedule = dayMatches(availableDays, previousWeekdayIndex);
    if (!matchesSchedule) {
      availabilityState = dayMatches(availableDays, weekdayIndex) ? "later_today" : "unavailable_today";
    }
  } else {
    matchesSchedule = false;
    availabilityState = dayMatches(availableDays, weekdayIndex) ? "later_today" : "unavailable_today";
  }

  const isAvailableNow = Boolean(
    offer.isActive &&
    withinStart &&
    withinEnd &&
    matchesSchedule &&
    availabilityState === "available_now"
  );

  return {
    availableDays,
    availableStartTime,
    availableEndTime,
    availabilitySummary: formatAvailabilitySummary(availableDays, availableStartTime, availableEndTime),
    availabilityState,
    isAvailableNow,
    // Kept for older clients while they migrate to the more accurate name.
    isAvailableToday: isAvailableNow
  };
}

function normalizeEntitlementForCadence(entitlement, redemptionCadence, currentWeekStartAt) {
  if (!entitlement) {
    return null;
  }

  const cadence = normalizeRedemptionCadence(redemptionCadence);
  if (cadence === "once") {
    const redeemed = entitlement.status === "redeemed";
    return {
      ...entitlement,
      status: redeemed ? "redeemed" : "issued",
      redeemedAt: redeemed ? entitlement.redeemedAt : null
    };
  }

  const redeemedAtMs = entitlement.redeemedAt ? Date.parse(entitlement.redeemedAt) : Number.NaN;
  const currentWeekStartMs = Date.parse(currentWeekStartAt);
  const redeemedThisWeek =
    entitlement.status === "redeemed" &&
    Number.isFinite(redeemedAtMs) &&
    Number.isFinite(currentWeekStartMs) &&
    redeemedAtMs >= currentWeekStartMs;

  return {
    ...entitlement,
    status: redeemedThisWeek ? "redeemed" : "issued",
    redeemedAt: redeemedThisWeek ? entitlement.redeemedAt : null
  };
}

export {
  AUSTIN_TIME_ZONE,
  formatAvailabilitySummary,
  getOfferAvailability,
  getZonedDateParts,
  isValidRedemptionCadence,
  normalizeAvailableDays,
  normalizeDailyTime,
  normalizeEntitlementForCadence,
  normalizeRedemptionCadence,
  validateDailyTimeWindow
};
