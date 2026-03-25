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
const GEO_RADIUS_METERS = 200;

async function api(method, path, body) {
  const options = {
    method,
    headers: { "Content-Type": "application/json" }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${path}`, options);
  const data = await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(data.reason || "request_failed"), { data });
  }
  return data;
}

function getToken() {
  return localStorage.getItem("dbc_membershipToken");
}

function setToken(token) {
  localStorage.setItem("dbc_membershipToken", token);
}

function clearToken() {
  localStorage.removeItem("dbc_membershipToken");
}

function navigate(hash) {
  window.location.hash = hash;
}

function getRoute() {
  const hash = window.location.hash || "#/";
  const venueMatch = hash.match(/^#\/venue\/(.+)$/);
  if (venueMatch) {
    return { view: "venue", id: venueMatch[1] };
  }
  return { view: "home" };
}

const appEl = document.getElementById("app");

function render(html) {
  appEl.innerHTML = html;
}

function shell(content, options = {}) {
  const {
    eyebrow = "Austin pilot",
    title = "Dollar Bar Club",
    subtitle = "Members get first-drink pricing at a small set of Austin bars.",
    compact = false,
    hideHero = false
  } = options;

  const heroBlock = hideHero
    ? ""
    : `
      <header class="hero ${compact ? "hero-compact" : ""}">
        <div class="hero-inner">
          <span class="badge">${eyebrow}</span>
          <h1>${title}</h1>
          <p>${subtitle}</p>
        </div>
      </header>`;

  return `
    <div class="powered-by">
      <a href="https://www.barglance.com/" target="_blank" rel="noopener noreferrer">Powered by <span class="brand">BarGlance</span></a>
    </div>
    <div class="app-shell">
      <div class="nav">
        <div class="nav-inner">
          <div class="logo">Dollar Bar Club</div>
        </div>
      </div>
      ${heroBlock}
      <main class="main wrap ${hideHero ? "main-no-hero" : ""}">${content}</main>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function venueFallbackMarkup(label, sizeClass = "") {
  const initial = escapeHtml(String(label || "DBC").charAt(0).toUpperCase() || "D");
  return `
    <div class="image-fallback ${sizeClass}">
      <span>${initial}</span>
    </div>
  `;
}

function imageMarkup(imageUrl, alt, className, fallbackLabel, fallbackClass = "") {
  if (!imageUrl) {
    return venueFallbackMarkup(fallbackLabel, fallbackClass);
  }

  return `
    <img
      class="${className}"
      src="${escapeHtml(imageUrl)}"
      alt="${escapeHtml(alt)}"
      loading="lazy"
      onerror="this.style.display='none'; if (this.nextElementSibling) { this.nextElementSibling.style.display='flex'; }"
    >
    <div class="image-fallback ${fallbackClass}" style="display:none;">
      <span>${escapeHtml(String(fallbackLabel || "D").charAt(0).toUpperCase() || "D")}</span>
    </div>
  `;
}

function renderOnboarding() {
  render(
    shell(
      `
        <section class="welcome-card">
          <div class="trust-chip">Free To Join</div>
          <h2>The best drink specials in Austin.</h2>
          <p class="welcome-copy">
            Unlock member offers at a curated set of Austin bars.
          </p>
          <p class="welcome-copy welcome-copy-tight">
            Already joined? Use the same email and ZIP code to reopen your pass.
          </p>
        </section>

        <section class="panel panel-onboarding">
          <div class="section-kicker">Claim membership</div>
          <h3 class="panel-title">Get your digital pass</h3>
          <p class="panel-copy">
            Austin locals only. Enter your email and ZIP code to continue.
          </p>
          <form id="claim-form" class="form-stack">
            <div class="form-group">
              <label for="email">Email</label>
              <input type="email" id="email" placeholder="you@domain.com" required autocomplete="email">
            </div>
            <div class="form-group">
              <label for="zip">Austin ZIP code</label>
              <input type="text" id="zip" placeholder="78701" required inputmode="numeric" maxlength="5" autocomplete="postal-code">
            </div>
            <button type="submit" class="btn btn-primary" id="claim-btn">Claim membership</button>
            <div id="claim-error" class="form-error"></div>
          </form>
        </section>
      `,
      { hideHero: true }
    )
  );

  document.getElementById("claim-form").addEventListener("submit", handleClaim);
}

async function handleClaim(event) {
  event.preventDefault();

  const email = document.getElementById("email").value.trim();
  const zipCode = document.getElementById("zip").value.trim();
  const button = document.getElementById("claim-btn");
  const errorEl = document.getElementById("claim-error");

  errorEl.textContent = "";

  if (!email || !zipCode) {
    return;
  }

  button.disabled = true;
  button.textContent = "Claiming...";

  try {
    const data = await api("POST", "/memberships/claim", { email, zipCode });
    setToken(data.membershipToken);
    navigate("#/");
    renderVenueList();
  } catch (error) {
    const reason = error.data?.reason;
    if (reason === "email_and_zip_required") {
      errorEl.textContent = "Enter both your email and Austin ZIP code to continue.";
    } else if (reason === "non_austin_zip") {
      errorEl.textContent = "This pilot is currently limited to Austin-area members.";
    } else {
      errorEl.textContent = "We could not claim your membership. Please try again.";
    }
    button.disabled = false;
    button.textContent = "Claim membership";
  }
}

function statusPill(offer) {
  if (offer.entitlementStatus === "redeemed") {
    return `<span class="status-pill status-redeemed">Redeemed</span>`;
  }
  return `<span class="status-pill status-live">Live offer</span>`;
}

function venueSignal(venue) {
  if (venue.openNow === true) {
    return "Open now";
  }
  if (venue.type) {
    return venue.type;
  }
  return "Austin pilot venue";
}

function priceLevelLabel(priceLevel) {
  if (!priceLevel) {
    return "";
  }
  return "$".repeat(Math.max(1, Number(priceLevel)));
}

function chooseVenueOffer(currentOffer, nextOffer) {
  if (!currentOffer) {
    return nextOffer;
  }

  const currentRedeemed = currentOffer.entitlementStatus === "redeemed";
  const nextRedeemed = nextOffer.entitlementStatus === "redeemed";

  if (currentRedeemed !== nextRedeemed) {
    return currentRedeemed ? nextOffer : currentOffer;
  }

  const currentCreatedAt = Date.parse(currentOffer.createdAt || 0);
  const nextCreatedAt = Date.parse(nextOffer.createdAt || 0);
  if (Number.isFinite(currentCreatedAt) && Number.isFinite(nextCreatedAt) && currentCreatedAt !== nextCreatedAt) {
    return nextCreatedAt > currentCreatedAt ? nextOffer : currentOffer;
  }

  return currentOffer;
}

function selectPrimaryOffer(offers) {
  return (offers || []).reduce((selected, offer) => chooseVenueOffer(selected, offer), null);
}

function getVenueCounts(offers) {
  return (offers || []).reduce(
    (counts, offer) => {
      if (offer.entitlementStatus === "redeemed") {
        counts.redeemed += 1;
      } else {
        counts.live += 1;
      }
      return counts;
    },
    { live: 0, redeemed: 0 }
  );
}

async function renderVenueList() {
  const token = getToken();
  if (!token) {
    renderOnboarding();
    return;
  }

  render(shell('<div class="loading-block">Loading nearby pilot offers...</div>', { compact: true, hideHero: true }));

  try {
    const data = await api("GET", `/offers/active?membershipToken=${encodeURIComponent(token)}`);
    const offers = (data.offers || []).slice();

    offers.sort((left, right) => {
      if (left.entitlementStatus === "redeemed" && right.entitlementStatus !== "redeemed") {
        return 1;
      }
      if (left.entitlementStatus !== "redeemed" && right.entitlementStatus === "redeemed") {
        return -1;
      }
      return 0;
    });

    if (!offers.length) {
      render(
        shell(
          `
            <section class="panel empty-panel">
              <div class="section-kicker">Membership active</div>
              <h2 class="panel-title">No live offers right now</h2>
              <p class="panel-copy">
                Your pass is active. New offers will show up here as Austin venues go live.
              </p>
              <p class="panel-copy empty-panel-note">
                Check back later to see the latest participating bars and live member offers.
              </p>
            </section>
          `,
          { compact: true, hideHero: true }
        )
      );
      return;
    }

    const venueGroupMap = new Map();
    offers.forEach((offer) => {
      const venue = offer.venue || {};
      if (!venue.id) return;
      if (!venueGroupMap.has(venue.id)) {
        venueGroupMap.set(venue.id, { venue, offers: [] });
      }
      venueGroupMap.get(venue.id).offers.push(offer);
    });

    const venueGroups = Array.from(venueGroupMap.values());

    venueGroups.forEach((group) => {
      group.offers.sort((a, b) => {
        const aR = a.entitlementStatus === "redeemed" ? 1 : 0;
        const bR = b.entitlementStatus === "redeemed" ? 1 : 0;
        if (aR !== bR) return aR - bR;
        return Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0);
      });
      group.primary = group.offers[0];
      group.allRedeemed = group.offers.every((o) => o.entitlementStatus === "redeemed");
    });

    venueGroups.sort((left, right) => {
      const leftFeatured = left.venue.featured ? 1 : 0;
      const rightFeatured = right.venue.featured ? 1 : 0;
      if (leftFeatured !== rightFeatured) {
        return rightFeatured - leftFeatured;
      }
      if (left.allRedeemed !== right.allRedeemed) {
        return left.allRedeemed ? 1 : -1;
      }
      return (left.venue.name || "").localeCompare(right.venue.name || "");
    });

    const cards = venueGroups
      .map((group) => {
        const venue = group.venue;
        const primary = group.primary;
        const extra = group.offers.length - 1;
        const isRedeemed = group.allRedeemed;
        const isFeatured = venue.featured && !isRedeemed;
        const cardClass = `venue-card${isRedeemed ? " is-redeemed" : ""}${isFeatured ? " is-featured" : ""}`;
        const metaParts = [
          venue.neighborhood || venue.city,
          venueSignal(venue),
          priceLevelLabel(venue.priceLevel)
        ].filter(Boolean);
        const when = isRedeemed && primary.redeemedAt
          ? `Redeemed ${escapeHtml(formatDateTime(primary.redeemedAt))}`
          : ``;
        const offerLine = extra > 0
          ? `${escapeHtml(primary.title)} <span class="offer-more">+${extra} more</span>`
          : escapeHtml(primary.title);

        return `
          <a class="${cardClass}" href="#/venue/${escapeHtml(venue.id || "")}" data-venue-id="${escapeHtml(venue.id || "")}">
            <div class="venue-media">
              ${isFeatured ? '<span class="featured-star">⭐</span>' : ""}
              ${imageMarkup(primary.imageUrl || venue.imageUrl, venue.name || "Venue", "venue-card-image", venue.name || primary.title, "image-fallback-tall")}
              <div class="venue-media-gradient"></div>
              <div class="venue-media-copy">
                <h3>${escapeHtml(venue.name || "Venue")}</h3>
                <p>${offerLine}</p>
              </div>
            </div>
            <div class="venue-card-body">
              <div class="venue-card-meta">${escapeHtml(metaParts.join(" | "))}</div>
              <div class="venue-card-address">${escapeHtml(venue.address || "Austin, TX")}</div>
              <div class="venue-card-footer">
                <div class="venue-meta">${when}</div>
                <div class="venue-card-arrow">${isRedeemed ? "Details" : "View"}</div>
              </div>
            </div>
          </a>
        `;
      })
      .join("");

    const liveCount = venueGroups.filter((g) => !g.allRedeemed).length;
    const counts = { live: liveCount, redeemed: venueGroups.length - liveCount };

    render(
      shell(
        `
          <section class="member-summary">
            <div>
              <h2>${counts.live ? "Pick a bar and unlock your member offer." : "Your redeemed venues are saved here."}</h2>
            </div>
            <div class="summary-pill">${venueGroups.length} ${venueGroups.length === 1 ? "venue" : "venues"}</div>
          </section>
          <section class="venue-list">${cards}</section>
        `,
        { compact: true, hideHero: true }
      )
    );
  } catch (error) {
    if (error.data?.reason === "membership_not_found") {
      clearToken();
      renderOnboarding();
      return;
    }

    render(
      shell(
        `
          <section class="panel empty-panel">
            <div class="section-kicker">Temporary issue</div>
            <h2 class="panel-title">We could not load your venues</h2>
            <p class="panel-copy">Please refresh and try again in a moment.</p>
          </section>
        `,
        { compact: true, hideHero: true }
      )
    );
  }
}

function buildDetailInfo(venue) {
  const infoItems = [];

  if (venue.phone) {
    infoItems.push(
      `<li><span class="label">Phone</span><a href="tel:${escapeHtml(venue.phone)}">${escapeHtml(venue.phone)}</a></li>`
    );
  }
  if (venue.website) {
    infoItems.push(
      `<li><span class="label">Website</span><a href="${escapeHtml(venue.website)}" target="_blank" rel="noopener">${escapeHtml(
        venue.website.replace(/^https?:\/\//, "")
      )}</a></li>`
    );
  }

  return infoItems.join("");
}

const DAY_ORDER = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function formatHoursSegment(text) {
  const withColon = text.replace(/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)/i, "$1:  ");
  return withColon.replace(/\s+to\s+/i, " - ");
}

function formatHoursSummary(hoursSummary) {
  if (!hoursSummary || typeof hoursSummary !== "string") return "";
  const raw = hoursSummary.trim();
  if (!raw) return "";

  const segments = raw.split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean);
  if (!segments.length) return "";

  const withDayIndex = segments.map((text) => {
    const dayMatch = text.toLowerCase().match(/^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/);
    const day = dayMatch ? dayMatch[1] : "";
    const idx = DAY_ORDER.indexOf(day);
    return { text: formatHoursSegment(text), idx: idx >= 0 ? idx : 99 };
  });
  withDayIndex.sort((a, b) => a.idx - b.idx);

  const todayIndex = new Date().getDay();
  const todaySegment = withDayIndex.find(({ idx }) => idx === todayIndex);
  const summaryText = todaySegment
    ? escapeHtml(todaySegment.text)
    : "See all hours";

  const lines = withDayIndex.map(({ text }) => `<li>${escapeHtml(text)}</li>`).join("");
  return `
    <div class="detail-hours-block">
      <span class="label">Hours</span>
      <details class="detail-hours-details">
        <summary class="detail-hours-summary">${summaryText}</summary>
        <ul class="detail-hours-list">${lines}</ul>
      </details>
    </div>`;
}

async function renderVenueDetail(venueId) {
  const token = getToken();
  render(shell('<div class="loading-block">Loading venue details...</div>', { compact: true, hideHero: true }));

  try {
    const data = await api("GET", `/venues/${venueId}?membershipToken=${encodeURIComponent(token)}`);
    const venue = data.venue;
    const allOffers = (data.offers || []).slice();
    allOffers.sort((a, b) => {
      const aR = a.entitlementStatus === "redeemed" ? 1 : 0;
      const bR = b.entitlementStatus === "redeemed" ? 1 : 0;
      if (aR !== bR) return aR - bR;
      return Date.parse(b.endsAt || 0) - Date.parse(a.endsAt || 0);
    });
    const hasLiveOffers = allOffers.some((o) => o.entitlementStatus !== "redeemed");
    const mapsUrl = `https://maps.google.com/maps?q=${encodeURIComponent(venue.address || `${venue.name}, Austin, TX`)}`;
    const infoMarkup = buildDetailInfo(venue);
    const hoursMarkup = formatHoursSummary(venue.hoursSummary);
    const summaryParts = [
      venue.openNow === null ? null : (venue.openNow ? "Open now" : "Closed now"),
      venue.type || null,
      venue.neighborhood || null,
      priceLevelLabel(venue.priceLevel) || null
    ].filter(Boolean);

    let offersMarkup = "";
    if (!allOffers.length) {
      offersMarkup = `
        <section class="panel">
          <div class="info-banner muted-banner">
            <strong>No live member offer right now</strong>
            <span>${escapeHtml(venue.name)} is still part of Dollar Bar Club. Check back soon for the next live offer.</span>
          </div>
        </section>
      `;
    } else {
      const instructionsMarkup = hasLiveOffers ? `
        <section class="panel">
          <div class="cta-panel">
            <div>
              <div class="cta-label">When you're there</div>
              <ol class="redeem-steps">
                <li>Tap Redeem below</li>
                <li>Show the screen to your bartender/server</li>
                <li>Press Done once the transaction is complete</li>
              </ol>
            </div>
          </div>
        </section>
      ` : "";

      const offerBlocks = allOffers.map((offer, idx) => {
        const isRedeemed = offer.entitlementStatus === "redeemed";
        const when = offer.redeemedAt ? formatDateTime(offer.redeemedAt) : "";
        let ctaMarkup = "";
        if (isRedeemed) {
          ctaMarkup = `
            <div class="info-banner success-banner" style="margin-top:10px;">
              <strong>Redeemed</strong>
              <span>${when ? escapeHtml(when) : "You have already used this offer."}</span>
            </div>
          `;
        } else {
          ctaMarkup = `<button class="btn btn-primary redeem-offer-btn" data-offer-idx="${idx}" style="margin-top:10px;">Redeem now</button>`;
        }

        return `
          <section class="panel">
            <div class="section-kicker">${allOffers.length > 1 ? `Offer ${idx + 1} of ${allOffers.length}` : "Your offer"}</div>
            <div class="detail-offer-title">${escapeHtml(offer.title)}</div>
            <div class="detail-offer-desc">${escapeHtml(offer.description || "One-time pilot offer for active members.")}</div>
            ${ctaMarkup}
          </section>
        `;
      }).join("");

      offersMarkup = instructionsMarkup + offerBlocks;
    }

    render(
      shell(
        `
          <section class="detail-hero-card">
            <div class="detail-hero-wrap">
              ${imageMarkup(venue.imageUrl, venue.name, "detail-hero-image", venue.name, "image-fallback-hero")}
              <div class="detail-hero-overlay"></div>
              <a class="detail-back" href="#/">Back to venues</a>
              <div class="detail-hero-copy">
                <h2 class="detail-name">${escapeHtml(venue.name)}</h2>
                ${summaryParts.length ? `<div class="detail-summary">${escapeHtml(summaryParts.join(" | "))}</div>` : ""}
              </div>
            </div>
          </section>

          ${offersMarkup}

          ${venue.description ? `<section class="panel"><p class="venue-description">${escapeHtml(venue.description)}</p></section>` : ""}

          ${
            hoursMarkup || infoMarkup
              ? `<section class="panel">
                  ${hoursMarkup || ""}
                  ${infoMarkup ? `<ul class="detail-info-list">${infoMarkup}</ul>` : ""}
                </section>`
              : ""
          }

          <section class="panel">
            <a class="detail-directions" href="${mapsUrl}" target="_blank" rel="noopener">
              Get Directions
              <span>${escapeHtml(venue.address || "Directions")}</span>
            </a>
          </section>
        `,
        { compact: true, hideHero: true }
      )
    );

    document.querySelectorAll(".redeem-offer-btn").forEach((btn) => {
      const idx = Number(btn.dataset.offerIdx);
      const offer = allOffers[idx];
      if (offer) {
        btn.addEventListener("click", () => startRedemption(venue, offer));
      }
    });
  } catch (error) {
    if (error.data?.reason === "membership_not_found") {
      clearToken();
      renderOnboarding();
      return;
    }

    const notFound = error.data?.reason === "venue_not_found";

    render(
      shell(
        `
          <section class="panel empty-panel">
            <div class="section-kicker">${notFound ? "Venue unavailable" : "Temporary issue"}</div>
            <h2 class="panel-title">${notFound ? "That venue is not available right now" : "We could not load that venue"}</h2>
            <p class="panel-copy">${notFound ? "It may have been removed from the pilot or is no longer visible to members." : "Head back and try again in a moment."}</p>
            <a class="btn btn-primary" href="#/">Back to venues</a>
          </section>
        `,
        { compact: true, hideHero: true }
      )
    );
  }
}

function showModal(html) {
  const existing = document.querySelector(".modal-overlay");
  if (existing) {
    existing.remove();
  }

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `<div class="modal">${html}</div>`;
  document.body.appendChild(modal);
  return modal;
}

function removeModal() {
  document.querySelector(".modal-overlay")?.remove();
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const earthRadius = 6371000;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;

  return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function startRedemption(venue, offer) {
  showModal(`
    <div class="modal-icon modal-icon-loading"></div>
    <h3>Checking your location</h3>
    <p>We only unlock this offer once you are on site at ${escapeHtml(venue.name)}.</p>
  `);

  if (!navigator.geolocation) {
    showModal(`
      <div class="modal-icon modal-icon-error">!</div>
      <h3 class="modal-error">Location is not available</h3>
      <p>Your browser does not support location services. Try again on a device with GPS enabled.</p>
      <button class="btn btn-primary" onclick="document.querySelector('.modal-overlay').remove()">Close</button>
    `);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => onGeoSuccess(position, venue, offer),
    () => onGeoError(venue),
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

async function onGeoSuccess(position, venue, offer) {
  if (typeof venue.lat !== "number" || typeof venue.lng !== "number") {
    showModal(`
      <div class="modal-icon modal-icon-error">!</div>
      <h3 class="modal-error">This venue is not ready yet</h3>
      <p>We are missing location coordinates for ${escapeHtml(venue.name)}. Please try another venue for now.</p>
      <button class="btn btn-primary" onclick="document.querySelector('.modal-overlay').remove()">Close</button>
    `);
    return;
  }

  const distance = distanceMeters(
    position.coords.latitude,
    position.coords.longitude,
    venue.lat,
    venue.lng
  );

  if (distance > GEO_RADIUS_METERS) {
    showModal(`
      <div class="modal-icon modal-icon-error">!</div>
      <h3 class="modal-error">Almost there</h3>
      <p>You need to be at ${escapeHtml(venue.name)} to redeem. Get a little closer and try again.</p>
      <button class="btn btn-primary" onclick="document.querySelector('.modal-overlay').remove()">Got it</button>
    `);
    return;
  }

  try {
    const redemption = await api("POST", "/redeem", {
      membershipToken: getToken(),
      offerId: offer.id,
      venueId: venue.id
    });

    if (redemption.duplicate) {
      const redeemedLabel = redemption.redeemedAt ? formatDateTime(redemption.redeemedAt) : "";
      showModal(`
        <div class="modal-icon modal-icon-success">OK</div>
        <h3 class="modal-success">Already redeemed</h3>
        <p>${redeemedLabel ? `This offer was already redeemed on ${escapeHtml(redeemedLabel)}.` : "This offer has already been redeemed on your membership."}</p>
        <button class="btn btn-primary" id="modal-done-btn">Back to venue</button>
      `);

      document.getElementById("modal-done-btn")?.addEventListener("click", () => {
        removeModal();
        renderVenueDetail(venue.id);
      });
      return;
    }

    showModal(`
      <div class="modal-icon modal-icon-success">OK</div>
      <h3 class="modal-success">Offer redeemed</h3>
      <p>Your ${escapeHtml(offer.title)} at ${escapeHtml(venue.name)} is ready. Show this screen to your bartender.</p>
      <button class="btn btn-primary" id="modal-done-btn">Done</button>
    `);

    document.getElementById("modal-done-btn")?.addEventListener("click", () => {
      removeModal();
      renderVenueDetail(venue.id);
    });
  } catch (error) {
    const reason = error.data?.reason;
    let message = "Something went wrong. Please try again.";
    if (reason === "membership_not_found") {
      clearToken();
      showModal(`
        <div class="modal-icon modal-icon-error">!</div>
        <h3 class="modal-error">Session expired</h3>
        <p>Please claim your membership again to continue.</p>
        <button class="btn btn-primary" id="modal-reset-btn">Return to start</button>
      `);

      document.getElementById("modal-reset-btn")?.addEventListener("click", () => {
        removeModal();
        navigate("#/");
        renderOnboarding();
      });
      return;
    }
    if (reason === "offer_inactive") {
      message = "This offer is no longer live. Head back to the venue list to see the latest available offers.";
    } else if (reason === "entitlement_missing") {
      message = "This offer is not available on your membership.";
    } else if (reason === "venue_mismatch") {
      message = "We could not verify this offer for the selected venue. Please refresh and try again.";
    }

    showModal(`
      <div class="modal-icon modal-icon-error">!</div>
      <h3 class="modal-error">Redemption failed</h3>
      <p>${escapeHtml(message)}</p>
      <button class="btn btn-primary" onclick="document.querySelector('.modal-overlay').remove()">Close</button>
    `);
  }
}

function onGeoError(venue) {
  showModal(`
    <div class="modal-icon modal-icon-error">!</div>
    <h3 class="modal-error">Location access needed</h3>
    <p>Enable location services so we can confirm you are at ${escapeHtml(venue.name)} before redeeming.</p>
    <button class="btn btn-primary" onclick="document.querySelector('.modal-overlay').remove()">Close</button>
  `);
}

function onRouteChange() {
  const token = getToken();
  const route = getRoute();

  if (!token) {
    renderOnboarding();
    return;
  }

  if (route.view === "venue") {
    renderVenueDetail(route.id);
    return;
  }

  renderVenueList();
}

window.addEventListener("hashchange", onRouteChange);

(function setupNavScrollHide() {
  let lastScrollY = 0;
  const scrollThreshold = 60;

  window.addEventListener("scroll", () => {
    const nav = document.querySelector(".nav");
    if (!nav) return;

    const currentScrollY = window.scrollY;
    if (currentScrollY > lastScrollY && currentScrollY > scrollThreshold) {
      nav.classList.add("nav-hidden");
    } else if (currentScrollY < lastScrollY) {
      nav.classList.remove("nav-hidden");
    }
    lastScrollY = currentScrollY;
  }, { passive: true });
})();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      // Keep the member flow functional even if offline support fails to register.
    });
  });
}

onRouteChange();
