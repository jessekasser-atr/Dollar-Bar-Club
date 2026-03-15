const BARG_LANCE_BASE_URL = "https://partner-api.barglance.com";

function getBarglanceApiKey() {
  return process.env.BARGLANCE_API_KEY || null;
}

function getBarglanceHeaders() {
  const apiKey = getBarglanceApiKey();
  if (!apiKey) {
    throw new Error("missing_barglance_api_key");
  }

  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json"
  };
}

function normalizeCityName(city) {
  return String(city || "").trim();
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

function mapBarToVenueRecord(bar) {
  const categories = Array.isArray(bar.categories) ? bar.categories.filter(Boolean) : [];

  return {
    id: `barglance_${bar.id}`,
    source: "barglance",
    sourceId: bar.id,
    enabled: 0,
    name: bar.name,
    city: bar.city?.name || "",
    state: bar.city?.state || "",
    address: bar.address || null,
    neighborhood: bar.street_name || null,
    type: bar.primary_category || categories.join(", ") || null,
    description: bar.description || null,
    imageUrl: bar.images?.hero || bar.images?.profile || null,
    website: bar.website || null,
    phone: bar.phone || null,
    instagram: null,
    lat: typeof bar.latitude === "number" ? bar.latitude : null,
    lng: typeof bar.longitude === "number" ? bar.longitude : null,
    openNow: typeof bar.open_now === "boolean" ? (bar.open_now ? 1 : 0) : null,
    priceLevel: Number.isInteger(bar.price_level) ? bar.price_level : null,
    hoursSummary: buildHoursSummary(bar.hours),
    rating: bar.rating?.public_rating ?? null,
    reviewCount: bar.rating?.review_count ?? null,
    rawPayload: JSON.stringify(bar)
  };
}

async function fetchBarsByCityPage({ state, city, page = 1, perPage = 50 }) {
  const normalizedState = String(state || "").trim().toUpperCase();
  const normalizedCity = normalizeCityName(city);
  const url = new URL(
    `/api/v1/partner/bars_by_city/${encodeURIComponent(normalizedState)}/${encodeURIComponent(normalizedCity)}`,
    BARG_LANCE_BASE_URL
  );

  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(perPage));

  const response = await fetch(url, {
    headers: getBarglanceHeaders()
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`barglance_request_failed:${response.status}:${body}`);
  }

  return response.json();
}

async function fetchBarsByCity({ state, city, maxPages = 1, perPage = 50 }) {
  const pages = [];
  let currentPage = 1;
  let totalPages = 1;

  while (currentPage <= maxPages && currentPage <= totalPages) {
    const payload = await fetchBarsByCityPage({
      state,
      city,
      page: currentPage,
      perPage
    });

    pages.push(payload);
    totalPages = payload.pagination?.total_pages || 1;
    currentPage += 1;
  }

  return pages;
}

export { fetchBarsByCity, getBarglanceApiKey, mapBarToVenueRecord };
