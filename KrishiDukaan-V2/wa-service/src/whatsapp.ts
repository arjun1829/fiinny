import { Client, LocalAuth } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";

let _client: Client | null = null;
let _ready = false;
let _initPromise: Promise<Client> | null = null;

// ─── Lifecycle helpers ────────────────────────────────────────────────────────

async function destroyClient(): Promise<void> {
  const client = _client;
  _client = null;
  _ready = false;

  if (!client) return;

  console.log("[WhatsApp] Destroying client and Puppeteer browser");
  try {
    await client.destroy();
    console.log("[WhatsApp] Client destroyed successfully");
  } catch (err) {
    console.warn(
      "[WhatsApp] Error during destroy (ignored):",
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function initClient(): Promise<Client> {
  console.log("[WhatsApp] Creating new Client instance");

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: "./.wwebjs_auth" }),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });

  _client = client;

  // ── Always-active listeners ───────────────────────────────────────────────

  client.on("qr", (qr) => {
    console.log("\n[WhatsApp] QR code ready — scan with WhatsApp:");
    qrcode.generate(qr, { small: true });
  });

  client.on("authenticated", () => {
    console.log("[WhatsApp] Session authenticated");
  });

  // ── Post-ready operational listeners (registered once the session is live) ─
  //
  // Deliberately NOT registered before "ready". whatsapp-web.js emits
  // "disconnected: LOGOUT" when it finds an expired cached session in
  // .wwebjs_auth, then immediately shows a fresh QR in the same browser.
  // If we called destroyClient() on that disconnect the browser would be
  // killed before the user could scan the new QR. By deferring these
  // handlers until after the first successful "ready", we let the library
  // handle the re-auth flow on its own — the browser stays alive and the
  // new QR appears naturally.
  client.once("ready", () => {
    console.log("[WhatsApp] Client ready — messages can now be sent");
    _ready = true;

    client.on("disconnected", async (reason) => {
      console.warn(
        `[WhatsApp] Disconnected (reason=${String(reason)}) — destroying client for clean reinit`,
      );
      await destroyClient();
    });

    client.on("auth_failure", async (msg) => {
      console.error(`[WhatsApp] Auth failure: ${String(msg)} — destroying client`);
      await destroyClient();
    });
  });

  // ── Awaitable promise that settles when the client becomes usable ─────────
  //
  // Only rejects on auth_failure — NOT on disconnected — because a disconnect
  // during init is the normal "invalid cached session → show new QR" path and
  // must not abort the initialization.
  const readyPromise = new Promise<void>((resolve, reject) => {
    client.once("ready", resolve);
    client.once("auth_failure", (msg) =>
      reject(new Error(`auth_failure during init: ${String(msg)}`)),
    );
  });

  console.log("[WhatsApp] Calling client.initialize()");
  await client.initialize();
  console.log("[WhatsApp] initialize() returned — awaiting ready event");

  await readyPromise;

  console.log("[WhatsApp] Initialization complete");
  return client;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the singleton WhatsApp client, blocking until it is fully ready.
 *
 * Concurrent callers share a single initialization promise — only one Client
 * is ever created regardless of how many callers arrive simultaneously.
 * This prevents the "onQRChangedEvent already exists" Puppeteer collision that
 * occurs when two Client instances try to use the same browser session.
 */
export async function getWhatsAppClient(): Promise<Client> {
  // Fast path: already initialized and ready.
  if (_client && _ready) return _client;

  // Initialization already in flight — join the existing promise instead of
  // spawning a second Client.
  if (_initPromise) {
    console.log("[WhatsApp] Initialization in progress — joining existing init");
    return _initPromise;
  }

  // Start a fresh initialization. The IIFE's finally block clears _initPromise
  // as soon as the promise settles (success or failure), making the slot
  // available for the next attempt without racing concurrent callers.
  console.log("[WhatsApp] Starting new client initialization");
  _initPromise = (async () => {
    try {
      return await initClient();
    } catch (err) {
      console.error(
        "[WhatsApp] Client initialization failed:",
        err instanceof Error ? err.message : String(err),
      );
      // The auth_failure event handler may have already cleaned up. If the
      // failure came from a non-event path (e.g. Puppeteer launch error),
      // _client may still be set — destroy it to leave a clean state.
      if (_client) await destroyClient();
      throw err;
    } finally {
      _initPromise = null;
    }
  })();

  return _initPromise;
}

export function isClientReady(): boolean {
  return _ready;
}

/** Normalises a phone number to WhatsApp chat ID format: 919876543210@c.us */
export function toChatId(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const normalised = digits.startsWith("91") ? digits : `91${digits}`;
  return `${normalised}@c.us`;
}

/**
 * Sends a WhatsApp message using the current singleton client.
 *
 * Uses the module-level _client directly — does NOT call getWhatsAppClient() —
 * to prevent a second Client being spawned if the client disconnects between
 * items in the same queue batch.
 */
export async function sendMessage(phone: string, message: string): Promise<void> {
  if (!_client || !_ready) {
    throw new Error("WhatsApp client not ready");
  }
  const chatId = toChatId(phone);
  await _client.sendMessage(chatId, message);
}
