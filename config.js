// Vauxhall Terminal — deployment config. Everything here is PUBLIC (it ships to every visitor).
// Never put secret API keys in this file. Secrets live in your relay (worker/) as Cloudflare secrets,
// and personal keys (AI providers, Bluesky) are entered by each user under Connections and stay in their browser.
window.VT_CONFIG = {
  // Google OAuth 2.0 Client ID (Web application). Enables Gmail + Google Calendar + Meet. See README §Google.
  googleClientId: "",
  // URL of your deployed relay (worker/relay.js). Enables in-portal flights, hotels, shopping, X, Telegram, quotes.
  relayUrl: "",
  // Defaults users can override under Connections.
  country: "NL",
  currency: "EUR",
  amazonDomain: "amazon.nl",
  ebayDomain: "ebay.com",
  language: "en"
};
