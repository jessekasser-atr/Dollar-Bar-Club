import crypto from "node:crypto";
import http2 from "node:http2";

// Minimal APNs HTTP/2 client using built-ins only.
// Docs: https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns
//
// Required env vars (set on Render for production):
//   APNS_AUTH_KEY    - Contents of the .p8 file (including BEGIN/END lines, literal \n preserved)
//   APNS_KEY_ID      - 10-char key ID shown in the Apple Developer portal
//   APNS_TEAM_ID     - 10-char Apple Developer team ID
//   APNS_BUNDLE_ID   - App bundle ID, defaults to com.barglance.dollarbarclub
//   APNS_PRODUCTION  - "true" to target production APNs, anything else targets sandbox

const PROD_HOST = "api.push.apple.com";
const SANDBOX_HOST = "api.sandbox.push.apple.com";
const JWT_TTL_MS = 50 * 60 * 1000; // Apple requires tokens be refreshed at least every hour.

function getConfig() {
  const rawKey = process.env.APNS_AUTH_KEY || "";
  // Allow both real newlines and escaped "\n" sequences from env vars.
  const authKey = rawKey.replace(/\\n/g, "\n").trim();
  const keyId = (process.env.APNS_KEY_ID || "").trim();
  const teamId = (process.env.APNS_TEAM_ID || "").trim();
  const bundleId = (process.env.APNS_BUNDLE_ID || "com.barglance.dollarbarclub").trim();
  const production = String(process.env.APNS_PRODUCTION || "").toLowerCase() === "true";

  if (!authKey || !keyId || !teamId) {
    return { ok: false, reason: "apns_not_configured" };
  }

  return { ok: true, authKey, keyId, teamId, bundleId, production };
}

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

let cachedToken = null;

function signJwt(config) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId, typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({ iss: config.teamId, iat: Math.floor(Date.now() / 1000) })
  );
  const signingInput = `${header}.${payload}`;

  const signer = crypto.createSign("SHA256");
  signer.update(signingInput);
  const derSignature = signer.sign({ key: config.authKey, format: "pem" });

  // Apple requires the raw r||s (64-byte) JOSE signature format, not DER.
  const joseSignature = derToJose(derSignature, 32);
  const token = `${signingInput}.${base64url(joseSignature)}`;

  cachedToken = { token, expiresAt: Date.now() + JWT_TTL_MS };
  return token;
}

function derToJose(derSignature, partSize) {
  // Strip the ASN.1 SEQUENCE/INTEGER wrapping produced by crypto.sign and return r||s.
  let offset = 2;
  if (derSignature[1] & 0x80) {
    offset += derSignature[1] & 0x7f;
  }

  // First INTEGER (r)
  if (derSignature[offset] !== 0x02) throw new Error("invalid_der_signature");
  const rLength = derSignature[offset + 1];
  let rStart = offset + 2;
  let rEnd = rStart + rLength;

  // Second INTEGER (s)
  if (derSignature[rEnd] !== 0x02) throw new Error("invalid_der_signature");
  const sLength = derSignature[rEnd + 1];
  let sStart = rEnd + 2;
  let sEnd = sStart + sLength;

  const r = trimLeadingZeros(derSignature.slice(rStart, rEnd));
  const s = trimLeadingZeros(derSignature.slice(sStart, sEnd));

  const out = Buffer.alloc(partSize * 2);
  r.copy(out, partSize - r.length);
  s.copy(out, partSize * 2 - s.length);
  return out;
}

function trimLeadingZeros(buf) {
  let i = 0;
  while (i < buf.length - 1 && buf[i] === 0x00) i += 1;
  return buf.slice(i);
}

let cachedClient = null;

function getClient(config) {
  const host = config.production ? PROD_HOST : SANDBOX_HOST;
  if (cachedClient && cachedClient.host === host && !cachedClient.session.destroyed) {
    return cachedClient.session;
  }
  if (cachedClient) {
    try { cachedClient.session.close(); } catch (_) { /* ignore */ }
  }
  const session = http2.connect(`https://${host}`);
  session.on("error", () => { /* swallow; next call will reconnect */ });
  cachedClient = { host, session };
  return session;
}

function sendOne({ config, session, deviceToken, payload }) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = session.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      "apns-topic": config.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "authorization": `bearer ${signJwt(config)}`,
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body)
    });

    let status = 0;
    let responseBody = "";

    req.on("response", (headers) => {
      status = Number(headers[":status"] || 0);
    });
    req.on("data", (chunk) => { responseBody += chunk.toString(); });
    req.on("end", () => {
      if (status === 200) {
        resolve({ ok: true, deviceToken, status });
        return;
      }
      let reason = "unknown";
      try { reason = JSON.parse(responseBody || "{}").reason || reason; } catch (_) { /* ignore */ }
      resolve({ ok: false, deviceToken, status, reason });
    });
    req.on("error", (err) => {
      resolve({ ok: false, deviceToken, status: 0, reason: err?.code || "request_error" });
    });

    req.end(body);
  });
}

/**
 * Send a notification to a batch of device tokens.
 *
 * @param {Object} args
 * @param {Array<{deviceToken: string}>} args.devices
 * @param {{title: string, body: string}} args.alert
 * @param {Object} [args.data] - Custom data injected at the top level of the APNs payload.
 * @returns {Promise<{ok: boolean, sent: number, failed: number, invalidTokens: string[], errors: Array}>}
 */
async function sendApnsNotification({ devices, alert, data = {} }) {
  const config = getConfig();
  if (!config.ok) {
    return { ok: false, reason: config.reason, sent: 0, failed: 0, invalidTokens: [], errors: [] };
  }

  if (!Array.isArray(devices) || devices.length === 0) {
    return { ok: true, sent: 0, failed: 0, invalidTokens: [], errors: [] };
  }

  const payload = {
    aps: {
      alert: { title: String(alert?.title || ""), body: String(alert?.body || "") },
      sound: "default"
    },
    ...data
  };

  const session = getClient(config);
  const results = await Promise.all(
    devices.map((d) => sendOne({ config, session, deviceToken: d.deviceToken, payload }))
  );

  const sent = results.filter((r) => r.ok).length;
  const failed = results.length - sent;
  // Tokens APNs considers permanently invalid - caller should revoke these in the DB.
  const invalidTokens = results
    .filter((r) => !r.ok && (r.status === 410 || r.reason === "BadDeviceToken" || r.reason === "Unregistered"))
    .map((r) => r.deviceToken);
  const errors = results.filter((r) => !r.ok).map(({ deviceToken, status, reason }) => ({ deviceToken, status, reason }));

  return { ok: true, sent, failed, invalidTokens, errors };
}

function isApnsConfigured() {
  return getConfig().ok;
}

export { sendApnsNotification, isApnsConfigured };
