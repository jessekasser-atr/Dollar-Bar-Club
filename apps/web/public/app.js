function resolveApiBase() {
  if (typeof window !== "undefined" && window.__DBC_API_BASE__) {
    return String(window.__DBC_API_BASE__).replace(/\/+$/, "");
  }

  const { protocol, hostname } = window.location;
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
  if (isLocalhost) {
    return `${protocol}//${hostname}:8787`;
  }

  return "/api";
}

const API_BASE = resolveApiBase();
const ADMIN_STORAGE_KEY = "dbc_admin_access_key";
const appEl = document.getElementById("app");
const opsTemplate = document.getElementById("ops-template");

let adminAccessKey = localStorage.getItem(ADMIN_STORAGE_KEY) || "";
let allVenues = [];
let allAdminOffers = [];
let allRedemptions = [];
let allMembers = [];
let ui = null;
let selectedProfileVenueId = null;
const WEEKDAY_OPTIONS = [
  { value: 0, shortLabel: "Sun", fullLabel: "Sunday" },
  { value: 1, shortLabel: "Mon", fullLabel: "Monday" },
  { value: 2, shortLabel: "Tue", fullLabel: "Tuesday" },
  { value: 3, shortLabel: "Wed", fullLabel: "Wednesday" },
  { value: 4, shortLabel: "Thu", fullLabel: "Thursday" },
  { value: 5, shortLabel: "Fri", fullLabel: "Friday" },
  { value: 6, shortLabel: "Sat", fullLabel: "Saturday" }
];

function renderGate(errorMessage = "") {
  appEl.innerHTML = `
    <main class="gate">
      <h2>Internal Access Required</h2>
      <p>Enter the BarGlance internal access key to open the ops console.</p>
      <div>
        <label for="adminAccessKey">Access key</label>
        <input id="adminAccessKey" type="password" placeholder="Enter internal access key" autocomplete="current-password">
      </div>
      <div class="gate-actions" style="margin-top:14px;">
        <button id="adminLoginBtn" type="button">Open Ops Console</button>
      </div>
      <div id="gateError" class="gate-error">${escapeHtml(errorMessage)}</div>
    </main>
  `;

  const keyEl = document.getElementById("adminAccessKey");
  const loginBtn = document.getElementById("adminLoginBtn");
  keyEl.value = adminAccessKey;
  keyEl.focus();

  const submit = async () => {
    const candidate = keyEl.value.trim();
    if (!candidate) {
      renderGate("Enter the internal access key to continue.");
      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = "Checking...";
    const valid = await validateAdminAccess(candidate);
    if (!valid) {
      adminAccessKey = "";
      localStorage.removeItem(ADMIN_STORAGE_KEY);
      renderGate("The access key was rejected. Check the current BarGlance key and try again.");
      return;
    }

    adminAccessKey = candidate;
    localStorage.setItem(ADMIN_STORAGE_KEY, adminAccessKey);
    renderOpsApp();
    await initializeOpsData();
  };

  loginBtn.addEventListener("click", submit);
  keyEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  });
}

function renderOpsApp() {
  appEl.innerHTML = "";
  appEl.appendChild(opsTemplate.content.cloneNode(true));

  ui = {
    loadVenuesBtn: document.getElementById("loadVenuesBtn"),
    venueAdminListEl: document.getElementById("venueAdminList"),
    venueAdminSummaryEl: document.getElementById("venueAdminSummary"),
    venueProfilePanelEl: document.getElementById("venueProfilePanel"),
    venueProfileSummaryEl: document.getElementById("venueProfileSummary"),
    venueProfileStatusEl: document.getElementById("venueProfileStatus"),
    venueSearchEl: document.getElementById("venueSearch"),
    venueFilterEl: document.getElementById("venueFilter"),
    resultEl: document.getElementById("result"),
    loadRedemptionsBtn: document.getElementById("loadRedemptionsBtn"),
    redemptionListEl: document.getElementById("redemptionList"),
    redemptionSummaryEl: document.getElementById("redemptionSummary"),
    redemptionSearchEl: document.getElementById("redemptionSearch"),
    redemptionFilterEl: document.getElementById("redemptionFilter"),
    loadMembersBtn: document.getElementById("loadMembersBtn"),
    memberListEl: document.getElementById("memberList"),
    memberSummaryEl: document.getElementById("memberSummary"),
    memberSearchEl: document.getElementById("memberSearch"),
    syncBarglanceBtn: document.getElementById("syncBarglanceBtn"),
    syncStateEl: document.getElementById("syncState"),
    syncCityEl: document.getElementById("syncCity"),
    syncPagesEl: document.getElementById("syncPages"),
    syncPerPageEl: document.getElementById("syncPerPage"),
    syncStatusEl: document.getElementById("syncStatus"),
    createOfferBtn: document.getElementById("createOfferBtn"),
    loadAdminOffersBtn: document.getElementById("loadAdminOffersBtn"),
    extendExpiredOffersBtn: document.getElementById("extendExpiredOffersBtn"),
    offerAdminListEl: document.getElementById("offerAdminList"),
    offerAdminSummaryEl: document.getElementById("offerAdminSummary"),
    offerSearchEl: document.getElementById("offerSearch"),
    offerFilterEl: document.getElementById("offerFilter"),
    newOfferIdEl: document.getElementById("newOfferId"),
    newOfferVenueIdEl: document.getElementById("newOfferVenueId"),
    newOfferTitleEl: document.getElementById("newOfferTitle"),
    newOfferImageUrlEl: document.getElementById("newOfferImageUrl"),
    newOfferDescriptionEl: document.getElementById("newOfferDescription"),
    newOfferDaysEl: document.getElementById("newOfferDays"),
    selectedVenueSummaryEl: document.getElementById("selectedVenueSummary"),
    offerCreateStatusEl: document.getElementById("offerCreateStatus"),
    saveVenueProfileBtn: document.getElementById("saveVenueProfileBtn"),
    clearVenueProfileBtn: document.getElementById("clearVenueProfileBtn"),
    profileVenueNameEl: document.getElementById("profileVenueName"),
    profileVenueImageUrlEl: document.getElementById("profileVenueImageUrl"),
    profileVenueAddressEl: document.getElementById("profileVenueAddress"),
    profileVenueLatEl: document.getElementById("profileVenueLat"),
    profileVenueLngEl: document.getElementById("profileVenueLng"),
    profileVenueNeighborhoodEl: document.getElementById("profileVenueNeighborhood"),
    profileVenueTypeEl: document.getElementById("profileVenueType"),
    profileVenueWebsiteEl: document.getElementById("profileVenueWebsite"),
    profileVenuePhoneEl: document.getElementById("profileVenuePhone"),
    profileVenueDescriptionEl: document.getElementById("profileVenueDescription"),
    createVenueBtn: document.getElementById("createVenueBtn"),
    manualVenueNameEl: document.getElementById("manualVenueName"),
    manualVenueAddressEl: document.getElementById("manualVenueAddress"),
    manualVenueCityEl: document.getElementById("manualVenueCity"),
    manualVenueStateEl: document.getElementById("manualVenueState"),
    manualVenueTypeEl: document.getElementById("manualVenueType"),
    manualVenueNeighborhoodEl: document.getElementById("manualVenueNeighborhood")
  };

  bindEvents();
}

function switchTab(tabId) {
  document.querySelectorAll(".tab-content").forEach((el) => {
    el.classList.toggle("active", el.id === `tab-${tabId}`);
  });
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  if (tabId === "members" && allMembers.length === 0) {
    loadMemberList();
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getAdminHeaders() {
  return {
    "content-type": "application/json",
    "x-admin-key": adminAccessKey
  };
}

async function validateAdminAccess(candidate) {
  try {
    const response = await fetch(`${API_BASE}/admin/session`, {
      headers: {
        "x-admin-key": candidate
      }
    });
    return response.ok;
  } catch (_error) {
    return false;
  }
}

async function jsonFetch(path, init = {}) {
  const headers = new Headers(init.headers || {});
  if (path === "/offers" || path.startsWith("/admin/")) {
    headers.set("x-admin-key", adminAccessKey);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (payload.reason === "admin_access_required" || payload.reason === "admin_access_not_configured") {
      adminAccessKey = "";
      localStorage.removeItem(ADMIN_STORAGE_KEY);
      renderGate(payload.reason === "admin_access_not_configured"
        ? "Admin access is not configured on the API yet."
        : "Your admin session is no longer valid. Enter the current access key to continue.");
      throw new Error(payload.reason);
    }
    throw new Error(JSON.stringify(payload));
  }
  return payload;
}

function renderResult(ok, payload) {
  ui.resultEl.style.display = "block";
  ui.resultEl.className = `result ${ok ? "ok" : "bad"}`;
  ui.resultEl.textContent = JSON.stringify(payload, null, 2);
}

function setSelectedVenue(venue) {
  ui.newOfferVenueIdEl.value = venue.id;
  const statusBits = [
    venue.enabled ? "enabled for members" : "currently disabled",
    venue.source || "local"
  ];
  ui.selectedVenueSummaryEl.textContent = `Selected venue: ${venue.name} (${venue.id}) | ${statusBits.join(" | ")}`;
  ui.selectedVenueSummaryEl.style.color = "#0a66ff";
  ui.selectedVenueSummaryEl.classList.remove("flash");
  void ui.selectedVenueSummaryEl.offsetWidth;
  ui.selectedVenueSummaryEl.classList.add("flash");
  ui.newOfferVenueIdEl.scrollIntoView({ behavior: "smooth", block: "center" });
  ui.newOfferVenueIdEl.focus();
  renderResult(true, {
    ok: true,
    status: "venue_selected",
    venueId: venue.id,
    venueName: venue.name
  });
}

function setVenueProfileSelection(venue) {
  selectedProfileVenueId = venue.id;
  ui.venueProfileSummaryEl.textContent =
    `Editing: ${venue.name} (${venue.id}) · ${venue.source || "local"}${venue.hasOverrides ? " · curated" : ""}`;
  ui.venueProfileSummaryEl.style.color = "#0a66ff";
  ui.venueProfileStatusEl.textContent = venue.hasOverrides
    ? "This venue has curated profile overrides active."
    : "Showing synced/base data. Edit fields below to create overrides.";

  ui.profileVenueNameEl.value = venue.name || "";
  ui.profileVenueImageUrlEl.value = venue.imageUrl || "";
  ui.profileVenueAddressEl.value = venue.address || "";
  ui.profileVenueLatEl.value = venue.lat != null ? venue.lat : "";
  ui.profileVenueLngEl.value = venue.lng != null ? venue.lng : "";
  ui.profileVenueNeighborhoodEl.value = venue.neighborhood || "";
  ui.profileVenueTypeEl.value = venue.type || "";
  ui.profileVenueWebsiteEl.value = venue.website || "";
  ui.profileVenuePhoneEl.value = venue.phone || "";
  ui.profileVenueDescriptionEl.value = venue.description || "";

  ui.venueProfilePanelEl.style.borderColor = "var(--accent)";
  ui.venueProfilePanelEl.classList.remove("flash");
  void ui.venueProfilePanelEl.offsetWidth;
  ui.venueProfilePanelEl.classList.add("flash");
  ui.venueProfilePanelEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

function formatDateTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  return date.toLocaleString();
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

function formatOfferSchedule(offer) {
  const days = normalizeAvailableDays(offer.availableDays);
  if (!days.length) {
    return "Every day";
  }
  return days
    .map((day) => WEEKDAY_OPTIONS.find((entry) => entry.value === day)?.fullLabel || String(day))
    .join(", ");
}

function getCheckedDays(container) {
  if (!container) {
    return [];
  }

  return normalizeAvailableDays(
    Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.value)
  );
}

function setCheckedDays(container, selectedDays) {
  const active = new Set(normalizeAvailableDays(selectedDays));
  container?.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.checked = active.has(Number(input.value));
  });
}

function buildDaySelector(selectedDays = []) {
  const active = new Set(normalizeAvailableDays(selectedDays));
  const wrap = document.createElement("div");
  wrap.className = "schedule-grid";
  wrap.innerHTML = WEEKDAY_OPTIONS.map((day) => `
    <label class="schedule-option">
      <input type="checkbox" value="${day.value}" ${active.has(day.value) ? "checked" : ""} />
      <span>${day.shortLabel}</span>
    </label>
  `).join("");
  return wrap;
}

function getRedemptionBucket(redemption) {
  if (redemption.result === "denied") {
    return "denied";
  }
  if (redemption.reason === "duplicate_replay") {
    return "duplicate";
  }
  return "approved";
}

function venueAdminCard(venue) {
  const wrap = document.createElement("div");
  wrap.className = "offer";
  wrap.innerHTML = `
    <div class="pill-row">
      <span class="pill ${venue.enabled ? "pill-ok" : "pill-muted"}">${venue.enabled ? "Enabled" : "Disabled"}</span>
      <span class="pill pill-muted">${venue.source || "local"}</span>
      ${venue.featured ? '<span class="pill pill-ok">Featured</span>' : ""}
      ${venue.hasOverrides ? '<span class="pill pill-accent">Curated</span>' : ""}
      ${venue.openNow === true ? '<span class="pill pill-ok">Open now</span>' : ""}
    </div>
    <h3>${escapeHtml(venue.name)}</h3>
    <p>${escapeHtml(venue.address || venue.city || "")}</p>
    <p style="margin-top:4px;color:#5c6675;">
      <strong>ID:</strong> ${escapeHtml(venue.id)}
      ${venue.type ? ` · <strong>Type:</strong> ${escapeHtml(venue.type)}` : ""}
      ${venue.neighborhood ? ` · ${escapeHtml(venue.neighborhood)}` : ""}
    </p>
  `;

  const actions = document.createElement("div");
  actions.className = "card-actions";

  const toggleBtn = document.createElement("button");
  toggleBtn.className = venue.enabled ? "secondary" : "";
  toggleBtn.textContent = venue.enabled ? "Disable" : "Enable";
  toggleBtn.addEventListener("click", async () => {
    toggleBtn.disabled = true;
    try {
      const data = await jsonFetch(`/admin/venues/${encodeURIComponent(venue.id)}/enabled`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify({ enabled: !venue.enabled })
      });
      renderResult(true, data);
      await loadVenueAdminList();
    } catch (error) {
      renderResult(false, { ok: false, reason: "toggle_venue_failed", error: String(error) });
      toggleBtn.disabled = false;
    }
  });

  const featuredBtn = document.createElement("button");
  featuredBtn.className = venue.featured ? "" : "secondary";
  featuredBtn.textContent = venue.featured ? "Featured ✓" : "Feature";
  featuredBtn.addEventListener("click", async () => {
    featuredBtn.disabled = true;
    try {
      const data = await jsonFetch(`/admin/venues/${encodeURIComponent(venue.id)}/featured`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify({ featured: !venue.featured })
      });
      renderResult(true, data);
      await loadVenueAdminList();
    } catch (error) {
      renderResult(false, { ok: false, reason: "toggle_featured_failed", error: String(error) });
      featuredBtn.disabled = false;
    }
  });

  const editBtn = document.createElement("button");
  editBtn.textContent = "Edit Profile";
  editBtn.className = "secondary";
  editBtn.addEventListener("click", () => setVenueProfileSelection(venue));

  const useBtn = document.createElement("button");
  useBtn.textContent = "Create Offer";
  useBtn.className = "secondary";
  useBtn.addEventListener("click", () => {
    setSelectedVenue(venue);
    switchTab("offers");
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "secondary";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", async () => {
    if (!confirm(`Delete venue "${venue.name}"? This will also delete all offers for this venue. This cannot be undone.`)) return;
    deleteBtn.disabled = true;
    try {
      const data = await jsonFetch(`/admin/venues/${encodeURIComponent(venue.id)}`, {
        method: "DELETE",
        headers: getAdminHeaders()
      });
      renderResult(true, data);
      await loadVenueAdminList();
      await loadAdminOffers();
    } catch (error) {
      renderResult(false, { ok: false, reason: "delete_venue_failed", error: String(error) });
      deleteBtn.disabled = false;
    }
  });

  actions.appendChild(toggleBtn);
  actions.appendChild(featuredBtn);
  actions.appendChild(editBtn);
  actions.appendChild(useBtn);
  actions.appendChild(deleteBtn);
  wrap.appendChild(actions);
  return wrap;
}

function isOfferExpired(offer) {
  const endsAtMs = offer.endsAt ? Date.parse(offer.endsAt) : Number.NaN;
  return Number.isFinite(endsAtMs) && endsAtMs < Date.now();
}

function offerAdminCard(offer) {
  const wrap = document.createElement("div");
  wrap.className = "offer";
  const expired = isOfferExpired(offer);
  const scheduledPill = expired
    ? `<span class="pill" style="background:#fde2e2;color:#c62828;">Expired ${escapeHtml(offer.endsAt ? new Date(offer.endsAt).toLocaleDateString() : "")}</span>`
    : `<span class="pill pill-accent">${escapeHtml(offer.isAvailableToday ? "Available Today" : "Scheduled")}</span>`;
  wrap.innerHTML = `
    <div class="pill-row">
      <span class="pill ${offer.isActive ? "pill-ok" : "pill-muted"}">${offer.isActive ? "Active" : "Inactive"}</span>
      ${scheduledPill}
    </div>
    <h3>${escapeHtml(offer.title)}</h3>
    <p>${escapeHtml(offer.description || "")}</p>
    <p style="margin-top:6px;color:#5c6675;">
      <strong>Offer ID:</strong> ${escapeHtml(offer.id)} |
      <strong>Venue:</strong> ${escapeHtml(offer.venueName || offer.venueId)} |
      <strong>Status:</strong> ${offer.isActive ? "active" : "inactive"}
    </p>
    <p style="margin-top:6px;color:#5c6675;">
      <strong>Available:</strong> ${escapeHtml(formatOfferSchedule(offer))} |
      <strong>Window:</strong> ${escapeHtml(offer.startsAt ? new Date(offer.startsAt).toLocaleDateString() : "—")}
      &rarr; ${escapeHtml(offer.endsAt ? new Date(offer.endsAt).toLocaleDateString() : "—")}
    </p>
  `;

  const actions = document.createElement("div");
  actions.className = "card-actions";

  const editBtn = document.createElement("button");
  editBtn.className = "secondary";
  editBtn.textContent = "Edit";
  editBtn.addEventListener("click", () => {
    const titleEl = wrap.querySelector("h3");
    const descEl = wrap.querySelector("p");

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.value = offer.title;
    titleInput.style.cssText = "width:100%;font-size:1.1em;font-weight:600;margin-bottom:6px;padding:4px 6px;";

    const descInput = document.createElement("input");
    descInput.type = "text";
    descInput.value = offer.description || "";
    descInput.placeholder = "Description (optional)";
    descInput.style.cssText = "width:100%;margin-bottom:6px;padding:4px 6px;";

    const scheduleLabel = document.createElement("div");
    scheduleLabel.textContent = "Available days";
    scheduleLabel.style.cssText = "margin:8px 0 6px;font-size:12px;font-weight:600;color:#5c6675;";

    const daySelector = buildDaySelector(offer.availableDays || []);
    daySelector.style.marginBottom = "6px";

    const windowLabel = document.createElement("div");
    windowLabel.textContent = "Active window (local time)";
    windowLabel.style.cssText = "margin:8px 0 6px;font-size:12px;font-weight:600;color:#5c6675;";

    const windowRow = document.createElement("div");
    windowRow.style.cssText = "display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap;";

    const toDatetimeLocal = (isoString) => {
      if (!isoString) return "";
      const d = new Date(isoString);
      if (Number.isNaN(d.getTime())) return "";
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const startsInput = document.createElement("input");
    startsInput.type = "datetime-local";
    startsInput.value = toDatetimeLocal(offer.startsAt);
    startsInput.style.cssText = "flex:1;min-width:180px;padding:4px 6px;";

    const endsInput = document.createElement("input");
    endsInput.type = "datetime-local";
    endsInput.value = toDatetimeLocal(offer.endsAt);
    endsInput.style.cssText = "flex:1;min-width:180px;padding:4px 6px;";

    const neverExpireBtn = document.createElement("button");
    neverExpireBtn.type = "button";
    neverExpireBtn.className = "secondary";
    neverExpireBtn.textContent = "Never expires";
    neverExpireBtn.style.cssText = "font-size:12px;padding:4px 8px;";
    neverExpireBtn.addEventListener("click", () => {
      endsInput.value = toDatetimeLocal("2099-12-31T23:59:59.000Z");
    });

    windowRow.appendChild(startsInput);
    windowRow.appendChild(endsInput);
    windowRow.appendChild(neverExpireBtn);

    titleEl.replaceWith(titleInput);
    descEl.replaceWith(descInput);
    descInput.insertAdjacentElement("afterend", daySelector);
    daySelector.insertAdjacentElement("beforebegin", scheduleLabel);
    daySelector.insertAdjacentElement("afterend", windowRow);
    windowRow.insertAdjacentElement("beforebegin", windowLabel);
    titleInput.focus();

    editBtn.textContent = "Save";
    editBtn.className = "";
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "secondary";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => loadAdminOffers());
    editBtn.parentElement.insertBefore(cancelBtn, editBtn.nextSibling);

    editBtn.removeEventListener("click", arguments.callee);
    editBtn.addEventListener("click", async () => {
      const newTitle = titleInput.value.trim();
      if (!newTitle) { titleInput.focus(); return; }
      editBtn.disabled = true;
      cancelBtn.disabled = true;
      try {
        const startsAtIso = startsInput.value ? new Date(startsInput.value).toISOString() : null;
        const endsAtIso = endsInput.value ? new Date(endsInput.value).toISOString() : null;
        const data = await jsonFetch(`/admin/offers/${encodeURIComponent(offer.id)}/content`, {
          method: "POST",
          headers: getAdminHeaders(),
          body: JSON.stringify({
            title: newTitle,
            description: descInput.value.trim() || null,
            availableDays: getCheckedDays(daySelector),
            startsAt: startsAtIso,
            endsAt: endsAtIso
          })
        });
        renderResult(true, data);
        await loadAdminOffers();
      } catch (error) {
        renderResult(false, { ok: false, reason: "edit_offer_failed", error: String(error) });
        editBtn.disabled = false;
        cancelBtn.disabled = false;
      }
    });
  });

  const toggleBtn = document.createElement("button");
  toggleBtn.className = offer.isActive ? "secondary" : "";
  toggleBtn.textContent = offer.isActive ? "Deactivate" : "Activate";
  toggleBtn.addEventListener("click", async () => {
    toggleBtn.disabled = true;
    try {
      const data = await jsonFetch(`/admin/offers/${encodeURIComponent(offer.id)}/active`, {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify({ isActive: !offer.isActive })
      });
      renderResult(true, data);
      await loadAdminOffers();
    } catch (error) {
      renderResult(false, { ok: false, reason: "toggle_offer_failed", error: String(error) });
      toggleBtn.disabled = false;
    }
  });

  const useBtn = document.createElement("button");
  useBtn.textContent = "New Offer for Venue";
  useBtn.className = "secondary";
  useBtn.addEventListener("click", () => {
    ui.newOfferVenueIdEl.value = offer.venueId;
    ui.selectedVenueSummaryEl.textContent = `Selected venue: ${offer.venueName || offer.venueId} (${offer.venueId})`;
    ui.selectedVenueSummaryEl.style.color = "#0a66ff";
    ui.newOfferVenueIdEl.scrollIntoView({ behavior: "smooth", block: "center" });
    ui.newOfferTitleEl.focus();
    renderResult(true, {
      ok: true,
      status: "offer_selected",
      offerId: offer.id,
      venueId: offer.venueId
    });
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "secondary";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", async () => {
    if (!confirm(`Delete offer "${offer.title}"? This cannot be undone.`)) return;
    deleteBtn.disabled = true;
    try {
      const data = await jsonFetch(`/admin/offers/${encodeURIComponent(offer.id)}`, {
        method: "DELETE",
        headers: getAdminHeaders()
      });
      renderResult(true, data);
      await loadAdminOffers();
    } catch (error) {
      renderResult(false, { ok: false, reason: "delete_offer_failed", error: String(error) });
      deleteBtn.disabled = false;
    }
  });

  actions.appendChild(editBtn);
  actions.appendChild(useBtn);
  actions.appendChild(toggleBtn);
  actions.appendChild(deleteBtn);
  wrap.appendChild(actions);
  return wrap;
}

function redemptionCard(redemption) {
  const wrap = document.createElement("div");
  const bucket = getRedemptionBucket(redemption);
  const bucketLabel = bucket === "duplicate" ? "approved (duplicate)" : bucket;
  wrap.className = "offer";
  wrap.innerHTML = `
    <div class="pill-row">
      <span class="pill ${bucket === "denied" ? "pill-muted" : "pill-ok"}">${escapeHtml(bucketLabel)}</span>
    </div>
    <h3>${escapeHtml(bucketLabel.toUpperCase())}</h3>
    <p style="margin-top:6px;color:#5c6675;">
      <strong>When:</strong> ${formatDateTime(redemption.createdAt)}
    </p>
    <p style="margin-top:6px;color:#5c6675;">
      <strong>Offer:</strong> ${escapeHtml(redemption.offerId || "n/a")} |
      <strong>Venue:</strong> ${escapeHtml(redemption.venueId || "n/a")}
    </p>
    <p style="margin-top:6px;color:#5c6675;">
      <strong>Token:</strong> ${escapeHtml(redemption.membershipToken || "n/a")} |
      <strong>Reason:</strong> ${escapeHtml(redemption.reason || "success")}
    </p>
    <p style="margin-top:6px;color:#5c6675;">
      <strong>Staff:</strong> ${escapeHtml(redemption.staffId || "n/a")} |
      <strong>Device:</strong> ${escapeHtml(redemption.deviceId || "n/a")}
    </p>
  `;
  return wrap;
}

async function loadVenueAdminList() {
  try {
    const data = await jsonFetch("/admin/venues");
    allVenues = data.venues.slice().sort((a, b) => {
      if (a.enabled !== b.enabled) {
        return a.enabled ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    renderVenueAdminList();
    if (selectedProfileVenueId) {
      const selectedVenue = getSelectedProfileVenue();
      if (selectedVenue) {
        setVenueProfileSelection(selectedVenue);
      }
    }
    renderResult(true, {
      ok: true,
      venueCount: allVenues.length,
      enabledCount: allVenues.filter((venue) => venue.enabled).length
    });
  } catch (error) {
    if (String(error.message || error) === "admin_access_required") {
      return;
    }
    renderResult(false, { ok: false, reason: "load_venues_failed", error: String(error) });
  }
}

function renderVenueAdminList() {
  const search = ui.venueSearchEl.value.trim().toLowerCase();
  const filter = ui.venueFilterEl.value.trim().toLowerCase();

  const filtered = allVenues.filter((venue) => {
    if (filter === "enabled" && !venue.enabled) return false;
    if (filter === "disabled" && venue.enabled) return false;
    if (filter === "seed" && venue.source !== "seed") return false;
    if (filter === "barglance" && venue.source !== "barglance") return false;
    if (filter === "manual" && venue.source !== "manual") return false;
    if (!search) return true;
    const haystack = [venue.name, venue.address, venue.id, venue.source, venue.type]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(search);
  });

  ui.venueAdminListEl.innerHTML = "";
  if (!filtered.length) {
    ui.venueAdminListEl.textContent = "No venues match the current search/filter.";
  } else {
    filtered.forEach((venue) => ui.venueAdminListEl.appendChild(venueAdminCard(venue)));
  }

  const enabledCount = allVenues.filter((venue) => venue.enabled).length;
  const barglanceCount = allVenues.filter((venue) => venue.source === "barglance").length;
  ui.venueAdminSummaryEl.textContent = `${filtered.length} shown of ${allVenues.length} venues. ${enabledCount} enabled for members. ${barglanceCount} imported from BarGlance.`;
}

async function loadAdminOffers() {
  try {
    const data = await jsonFetch("/admin/offers");
    allAdminOffers = data.offers.slice().sort((a, b) => {
      if (a.isActive !== b.isActive) {
        return a.isActive ? -1 : 1;
      }
      return Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0);
    });
    renderAdminOffers();
    renderResult(true, {
      ok: true,
      offerCount: allAdminOffers.length,
      activeCount: allAdminOffers.filter((offer) => offer.isActive).length,
      inactiveCount: allAdminOffers.filter((offer) => !offer.isActive).length
    });
  } catch (error) {
    if (String(error.message || error) === "admin_access_required") {
      return;
    }
    renderResult(false, { ok: false, reason: "load_admin_offers_failed", error: String(error) });
  }
}

function renderAdminOffers() {
  const search = ui.offerSearchEl.value.trim().toLowerCase();
  const filter = ui.offerFilterEl.value.trim().toLowerCase();

  const filtered = allAdminOffers.filter((offer) => {
    if (filter === "active" && !offer.isActive) return false;
    if (filter === "inactive" && offer.isActive) return false;
    if (!search) return true;
    const haystack = [offer.id, offer.title, offer.venueId, offer.venueName, offer.description]
      .concat([formatOfferSchedule(offer)])
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(search);
  });

  ui.offerAdminListEl.innerHTML = "";
  if (!filtered.length) {
    ui.offerAdminListEl.textContent = "No offers match the current search/filter.";
  } else {
    filtered.forEach((offer) => ui.offerAdminListEl.appendChild(offerAdminCard(offer)));
  }

  ui.offerAdminSummaryEl.textContent =
    `${filtered.length} shown of ${allAdminOffers.length} offers. ` +
    `${allAdminOffers.filter((offer) => offer.isActive).length} active, ` +
    `${allAdminOffers.filter((offer) => !offer.isActive).length} inactive.`;
}

async function loadRedemptionList() {
  try {
    const data = await jsonFetch("/admin/redemptions");
    allRedemptions = data.redemptions.slice();
    renderRedemptionList();
    renderResult(true, {
      ok: true,
      redemptionCount: allRedemptions.length,
      approvedCount: allRedemptions.filter((item) => item.result === "approved").length,
      deniedCount: allRedemptions.filter((item) => item.result === "denied").length
    });
  } catch (error) {
    if (String(error.message || error) === "admin_access_required") {
      return;
    }
    renderResult(false, { ok: false, reason: "load_redemptions_failed", error: String(error) });
  }
}

function renderRedemptionList() {
  const search = ui.redemptionSearchEl.value.trim().toLowerCase();
  const filter = ui.redemptionFilterEl.value.trim().toLowerCase();

  const filtered = allRedemptions.filter((redemption) => {
    const bucket = getRedemptionBucket(redemption);
    if (filter !== "all" && filter && bucket !== filter) return false;
    if (!search) return true;
    const haystack = [
      redemption.membershipToken,
      redemption.offerId,
      redemption.venueId,
      redemption.staffId,
      redemption.deviceId,
      redemption.reason,
      redemption.result
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(search);
  });

  ui.redemptionListEl.innerHTML = "";
  if (!filtered.length) {
    ui.redemptionListEl.textContent = "No redemptions match the current search/filter.";
  } else {
    filtered.forEach((redemption) => ui.redemptionListEl.appendChild(redemptionCard(redemption)));
  }

  const approvedCount = allRedemptions.filter((item) => getRedemptionBucket(item) === "approved").length;
  const duplicateCount = allRedemptions.filter((item) => getRedemptionBucket(item) === "duplicate").length;
  const deniedCount = allRedemptions.filter((item) => getRedemptionBucket(item) === "denied").length;

  ui.redemptionSummaryEl.textContent =
    `${filtered.length} shown of ${allRedemptions.length} redemptions. ` +
    `${approvedCount} approved, ${duplicateCount} duplicate replays, ${deniedCount} denied.`;
}

async function loadMemberList() {
  try {
    const data = await jsonFetch("/admin/members");
    allMembers = data.members.slice();
    renderMemberList();
    renderResult(true, { ok: true, memberCount: allMembers.length });
  } catch (error) {
    if (String(error.message || error) === "admin_access_required") return;
    renderResult(false, { ok: false, reason: "load_members_failed", error: String(error) });
  }
}

function renderMemberList() {
  const search = ui.memberSearchEl.value.trim().toLowerCase();

  const filtered = allMembers.filter((member) => {
    if (!search) return true;
    const haystack = [
      member.email,
      member.firstName,
      member.lastName,
      member.zipCode
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(search);
  });

  ui.memberListEl.innerHTML = "";
  if (!filtered.length) {
    ui.memberListEl.textContent = "No members match the current search.";
  } else {
    filtered.forEach((member) => ui.memberListEl.appendChild(memberCard(member)));
  }

  ui.memberSummaryEl.textContent = `${filtered.length} shown of ${allMembers.length} members.`;
}

function memberCard(member) {
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.innerHTML = `
    <h3>${escapeHtml(member.email)}</h3>
    <p style="margin-top:6px;color:#5c6675;">
      <strong>Name:</strong> ${escapeHtml([member.firstName, member.lastName].filter(Boolean).join(" ") || "—")} |
      <strong>ZIP:</strong> ${escapeHtml(member.zipCode || "—")} |
      <strong>Signed up:</strong> ${formatDateTime(member.createdAt)}
    </p>
  `;
  return wrap;
}

function bindEvents() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  ui.loadVenuesBtn.addEventListener("click", loadVenueAdminList);
  ui.venueSearchEl.addEventListener("input", renderVenueAdminList);
  ui.venueFilterEl.addEventListener("input", renderVenueAdminList);
  ui.loadAdminOffersBtn.addEventListener("click", loadAdminOffers);
  if (ui.extendExpiredOffersBtn) {
    ui.extendExpiredOffersBtn.addEventListener("click", async () => {
      const expiredCount = (allAdminOffers || []).filter((offer) => offer.isActive && isOfferExpired(offer)).length;
      const message = expiredCount > 0
        ? `Extend ${expiredCount} expired active offer${expiredCount === 1 ? "" : "s"} to 2099-12-31? This will make them available today.`
        : "No expired active offers were found on the last refresh. Extend anything that expires before now on the server?";
      if (!confirm(message)) return;
      ui.extendExpiredOffersBtn.disabled = true;
      try {
        const data = await jsonFetch("/admin/offers/extend-expired", {
          method: "POST",
          headers: getAdminHeaders(),
          body: JSON.stringify({})
        });
        renderResult(true, data);
        await loadAdminOffers();
      } catch (error) {
        renderResult(false, { ok: false, reason: "extend_expired_failed", error: String(error) });
      } finally {
        ui.extendExpiredOffersBtn.disabled = false;
      }
    });
  }
  ui.offerSearchEl.addEventListener("input", renderAdminOffers);
  ui.offerFilterEl.addEventListener("input", renderAdminOffers);
  ui.loadRedemptionsBtn.addEventListener("click", loadRedemptionList);
  ui.redemptionSearchEl.addEventListener("input", renderRedemptionList);
  ui.redemptionFilterEl.addEventListener("input", renderRedemptionList);
  ui.loadMembersBtn.addEventListener("click", loadMemberList);
  ui.memberSearchEl.addEventListener("input", renderMemberList);
  ui.saveVenueProfileBtn.addEventListener("click", saveVenueProfile);
  ui.clearVenueProfileBtn.addEventListener("click", clearVenueProfileOverrides);

  ui.syncBarglanceBtn.addEventListener("click", async () => {
    const state = ui.syncStateEl.value.trim();
    const city = ui.syncCityEl.value.trim();
    const maxPages = Number(ui.syncPagesEl.value.trim() || "1");
    const perPage = Number(ui.syncPerPageEl.value.trim() || "50");

    ui.syncBarglanceBtn.disabled = true;
    ui.syncBarglanceBtn.textContent = "Syncing...";
    ui.syncStatusEl.textContent = `Syncing ${city || "city"}, ${state || "state"}...`;
    renderResult(true, { ok: true, status: "sync_started", state, city, maxPages, perPage });

    try {
      const data = await jsonFetch("/admin/sync/barglance", {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify({ state, city, maxPages, perPage })
      });
      ui.syncStatusEl.textContent = `Sync complete: imported ${data.imported} venues from ${data.city}, ${data.state}.`;
      await loadVenueAdminList();
      await loadAdminOffers();
      renderResult(true, data);
    } catch (error) {
      if (String(error.message || error) !== "admin_access_required") {
        ui.syncStatusEl.textContent = "Sync failed. Check the result panel for details.";
        renderResult(false, { ok: false, reason: "barglance_sync_failed", error: String(error) });
      }
    } finally {
      ui.syncBarglanceBtn.disabled = false;
      ui.syncBarglanceBtn.textContent = "Sync Venues";
    }
  });

  ui.createVenueBtn.addEventListener("click", async () => {
    const name = ui.manualVenueNameEl.value.trim();
    const address = ui.manualVenueAddressEl.value.trim();
    const city = ui.manualVenueCityEl.value.trim();
    const state = ui.manualVenueStateEl.value.trim();
    const type = ui.manualVenueTypeEl.value.trim();
    const neighborhood = ui.manualVenueNeighborhoodEl.value.trim();

    if (!name || !city || !state) {
      renderResult(false, { ok: false, reason: "venue_fields_required" });
      return;
    }

    try {
      const data = await jsonFetch("/admin/venues", {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify({
          name,
          address: address || undefined,
          city,
          state,
          type: type || undefined,
          neighborhood: neighborhood || undefined,
          enabled: true
        })
      });

      setSelectedVenue(data.venue);
      ui.manualVenueNameEl.value = "";
      ui.manualVenueAddressEl.value = "";
      ui.manualVenueCityEl.value = "Austin";
      ui.manualVenueStateEl.value = "TX";
      ui.manualVenueTypeEl.value = "";
      ui.manualVenueNeighborhoodEl.value = "";
      await loadVenueAdminList();
      renderResult(true, data);
    } catch (error) {
      if (String(error.message || error) !== "admin_access_required") {
        renderResult(false, { ok: false, reason: "create_venue_failed", error: String(error) });
      }
    }
  });

  ui.createOfferBtn.addEventListener("click", async () => {
    const id = ui.newOfferIdEl.value.trim();
    const venueId = ui.newOfferVenueIdEl.value.trim();
    const title = ui.newOfferTitleEl.value.trim();
    const description = ui.newOfferDescriptionEl.value.trim();
    const imageUrl = ui.newOfferImageUrlEl.value.trim();
    const availableDays = getCheckedDays(ui.newOfferDaysEl);

    if (!id || !venueId || !title) {
      renderResult(false, { ok: false, reason: "offer_fields_required" });
      return;
    }

    try {
      ui.createOfferBtn.disabled = true;
      ui.createOfferBtn.textContent = "Creating...";
      ui.offerCreateStatusEl.style.color = "#5c6675";
      ui.offerCreateStatusEl.textContent = `Creating offer for ${ui.newOfferVenueIdEl.value.trim() || "selected venue"}...`;

      const data = await jsonFetch("/offers", {
        method: "POST",
        headers: getAdminHeaders(),
        body: JSON.stringify({
          id,
          venueId,
          title,
          description: description || undefined,
          imageUrl: imageUrl || undefined,
          availableDays
        })
      });

      ui.newOfferTitleEl.value = "";
      ui.newOfferImageUrlEl.value = "";
      ui.newOfferDescriptionEl.value = "";
      setCheckedDays(ui.newOfferDaysEl, []);
      ui.offerCreateStatusEl.style.color = "#107c41";
      ui.offerCreateStatusEl.textContent = `Created: ${data.offer.title} for ${data.offer.venueId} (${formatOfferSchedule(data.offer)}).`;
      await loadAdminOffers();
      renderResult(true, data);
    } catch (error) {
      if (String(error.message || error) !== "admin_access_required") {
        ui.offerCreateStatusEl.style.color = "#c62828";
        ui.offerCreateStatusEl.textContent = "Offer creation failed. Check the result panel for details.";
        renderResult(false, { ok: false, reason: "create_offer_failed", error: String(error) });
      }
    } finally {
      ui.createOfferBtn.disabled = false;
      ui.createOfferBtn.textContent = "Create Offer";
    }
  });
}

function getSelectedProfileVenue() {
  return allVenues.find((venue) => venue.id === selectedProfileVenueId) || null;
}

function getProfileFormPayload(venue) {
  const source = venue?.sourceProfile || {};
  const fields = {
    name: ui.profileVenueNameEl.value.trim(),
    imageUrl: ui.profileVenueImageUrlEl.value.trim(),
    address: ui.profileVenueAddressEl.value.trim(),
    neighborhood: ui.profileVenueNeighborhoodEl.value.trim(),
    type: ui.profileVenueTypeEl.value.trim(),
    website: ui.profileVenueWebsiteEl.value.trim(),
    phone: ui.profileVenuePhoneEl.value.trim(),
    description: ui.profileVenueDescriptionEl.value.trim()
  };

  const payload = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => {
      const normalizedValue = value || null;
      const normalizedSource = source[key] || null;
      return [key, normalizedValue === normalizedSource ? null : normalizedValue];
    })
  );

  const latVal = ui.profileVenueLatEl.value.trim();
  const lngVal = ui.profileVenueLngEl.value.trim();
  if (latVal !== "") payload.lat = parseFloat(latVal);
  if (lngVal !== "") payload.lng = parseFloat(lngVal);

  return payload;
}

async function saveVenueProfile() {
  const venue = getSelectedProfileVenue();
  if (!venue) {
    renderResult(false, { ok: false, reason: "venue_profile_selection_required" });
    ui.venueProfileStatusEl.style.color = "#c62828";
    ui.venueProfileStatusEl.textContent = "Select a venue before saving profile changes.";
    return;
  }

  try {
    ui.saveVenueProfileBtn.disabled = true;
    ui.saveVenueProfileBtn.textContent = "Saving...";
    ui.venueProfileStatusEl.style.color = "#5c6675";
    ui.venueProfileStatusEl.textContent = `Saving curated profile for ${venue.name}...`;

    const data = await jsonFetch(`/admin/venues/${encodeURIComponent(venue.id)}/profile`, {
      method: "POST",
      headers: getAdminHeaders(),
      body: JSON.stringify(getProfileFormPayload(venue))
    });

    ui.venueProfileStatusEl.style.color = "#107c41";
    ui.venueProfileStatusEl.textContent = "Venue profile saved.";
    renderResult(true, data);
    await loadVenueAdminList();
    setVenueProfileSelection(data.venue);
  } catch (error) {
    if (String(error.message || error) !== "admin_access_required") {
      ui.venueProfileStatusEl.style.color = "#c62828";
      ui.venueProfileStatusEl.textContent = "Venue profile save failed. Check the result panel for details.";
      renderResult(false, { ok: false, reason: "save_venue_profile_failed", error: String(error) });
    }
  } finally {
    ui.saveVenueProfileBtn.disabled = false;
    ui.saveVenueProfileBtn.textContent = "Save Venue Profile";
  }
}

async function clearVenueProfileOverrides() {
  const venue = getSelectedProfileVenue();
  if (!venue) {
    renderResult(false, { ok: false, reason: "venue_profile_selection_required" });
    ui.venueProfileStatusEl.style.color = "#c62828";
    ui.venueProfileStatusEl.textContent = "Select a venue before clearing overrides.";
    return;
  }

  try {
    ui.clearVenueProfileBtn.disabled = true;
    ui.clearVenueProfileBtn.textContent = "Clearing...";
    const data = await jsonFetch(`/admin/venues/${encodeURIComponent(venue.id)}/profile/reset`, {
      method: "POST",
      headers: getAdminHeaders()
    });
    ui.venueProfileStatusEl.style.color = "#107c41";
    ui.venueProfileStatusEl.textContent = "Venue overrides cleared. The app will use synced/base data.";
    renderResult(true, data);
    await loadVenueAdminList();
    setVenueProfileSelection(data.venue);
  } catch (error) {
    if (String(error.message || error) !== "admin_access_required") {
      ui.venueProfileStatusEl.style.color = "#c62828";
      ui.venueProfileStatusEl.textContent = "Could not clear venue overrides. Check the result panel for details.";
      renderResult(false, { ok: false, reason: "clear_venue_profile_failed", error: String(error) });
    }
  } finally {
    ui.clearVenueProfileBtn.disabled = false;
    ui.clearVenueProfileBtn.textContent = "Clear Overrides";
  }
}

async function initializeOpsData() {
  await Promise.all([loadVenueAdminList(), loadAdminOffers(), loadRedemptionList()]);
}

async function boot() {
  if (adminAccessKey) {
    const valid = await validateAdminAccess(adminAccessKey);
    if (valid) {
      renderOpsApp();
      await initializeOpsData();
      return;
    }

    adminAccessKey = "";
    localStorage.removeItem(ADMIN_STORAGE_KEY);
  }

  renderGate();
}

boot();
