import { Client, LocalAuth } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";

let _client: Client | null = null;
let _ready = false;

export async function getWhatsAppClient(): Promise<Client> {
  if (_client && _ready) return _client;

  _client = new Client({
    authStrategy: new LocalAuth({ dataPath: "./.wwebjs_auth" }),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });

  _client.on("qr", (qr) => {
    console.log("\n[WhatsApp] Scan this QR code with WhatsApp Business:");
    qrcode.generate(qr, { small: true });
  });

  _client.on("authenticated", () => {
    console.log("[WhatsApp] Session authenticated");
  });

  _client.on("ready", () => {
    console.log("[WhatsApp] Client ready");
    _ready = true;
  });

  _client.on("auth_failure", (msg) => {
    console.error("[WhatsApp] Auth failed:", msg);
    _ready = false;
    _client = null;
  });

  _client.on("disconnected", (reason) => {
    console.warn("[WhatsApp] Disconnected:", reason);
    _ready = false;
    _client = null;
  });

  await _client.initialize();
  return _client;
}

export function isClientReady(): boolean {
  return _ready;
}

/** Normalises phone to WhatsApp chat ID format: 919876543210@c.us */
export function toChatId(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const normalised = digits.startsWith("91") ? digits : `91${digits}`;
  return `${normalised}@c.us`;
}

export async function sendMessage(phone: string, message: string): Promise<void> {
  const client = await getWhatsAppClient();
  if (!_ready) throw new Error("WhatsApp client not ready");
  const chatId = toChatId(phone);
  await client.sendMessage(chatId, message);
}
