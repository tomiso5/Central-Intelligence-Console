# Vauxhall Terminal

A spy-themed personal operations dashboard that runs as a static website (GitHub Pages) on real, live data and **your own** accounts. It has OSINT collection, a 3D flight radar, a conflict map, a route explorer, travel booking search, a marketplace, food delivery, rides, peer-to-peer messaging with friends, and your choice of AI assistants.

> **Unofficial fan project.** It is not affiliated with, endorsed by, or connected to the Secret Intelligence Service (MI6), HM Government, or any film or book franchise. "Vauxhall Terminal", its crest and the gadgets are original inventions. Classification markings are decorative.

---

## What works out of the box (no keys, no server)

| Section | Live source |
|---|---|
| Conflict map | Curated, dated flashpoint snapshot (`data/intel.json`) plus live layers: GDELT news geolocation, USGS earthquakes, NASA EONET hazards, ISS position, OSINT place mentions |
| Flight radar (3D) | ADS-B from [adsb.lol](https://adsb.lol) / [airplanes.live](https://airplanes.live); routes from [adsbdb](https://www.adsbdb.com); photos from [Planespotters.net](https://www.planespotters.net) |
| Route explorer | ~59,000 nonstop routes and 4,000 airports from [Jonty/airline-route-data](https://github.com/Jonty/airline-route-data), refreshed weekly by a GitHub Action |
| OSINT | Mastodon hashtags, Reddit, GDELT world news, plus military ADS-B activity by region. Each item is tagged against an indicators & warnings taxonomy and cross-checked between sources |
| Social | Reddit, Mastodon, Bluesky (search and timeline need an app password), X post embeds, Instagram post board, WhatsApp click-to-chat, and a cross-post composer |
| Field messages | Peer-to-peer chat between friends (WebRTC via [Trystero](https://github.com/dmotz/trystero)). Includes friend requests, DMs, group channels, presence, typing, read receipts, reactions, burn-on-read, pings, images and video calls |
| Food delivery | Nearby restaurants from OpenStreetMap (Overpass), with order links for Thuisbezorgd, Uber Eats and other local services |
| Ride | Routing (OSRM) and geocoding (Photon), then hand-off to Uber with pickup and drop-off filled in |
| Cyber | CISA Known Exploited Vulnerabilities, Hacker News security wire, curated advisories |
| Markets | Frankfurter FX, CoinGecko; indices and commodities come from the snapshot, or live via the relay |

## What you unlock by linking accounts

Everything below is stored **only in the visitor's browser**. Nothing goes to the site owner.

- **AI connectors** (*Support › AI connectors*): Claude, ChatGPT, Gemini, Meta Muse Spark, Mistral, Grok, OpenRouter, or any OpenAI-compatible endpoint (Azure OpenAI, Ollama, LM Studio). Copilot has no public consumer API, so it opens in a new tab with your prompt copied. These power the Analyst desk, Q Branch, travel risk briefs, mail drafting and the compare-all panel.
- **Google** (Gmail, Calendar, Meet): read and send mail, see your agenda, and create meetings with real Meet links. Needs an OAuth Client ID (see [Google setup](#google-setup)).
- **Bluesky**: home timeline, search and posting with an app password.

## What needs the relay

Some services need a secret key that must never sit in a public website. Others block browser requests (CORS). `worker/relay.js` is a ~150-line Cloudflare Worker that **you** deploy. It holds secrets and only talks to an allow-list of hosts; it is not an open proxy.

| Feature | Relay secret |
|---|---|
| In-portal **flight fares and booking options** (Google Flights) | `SERPAPI_KEY` |
| In-portal **hotel rates** from every provider (Google Hotels) | `SERPAPI_KEY` |
| **Marketplace** results from Amazon, eBay and Google Shopping (Etsy, bol.com, Zalando…) | `SERPAPI_KEY` |
| **X** search in OSINT and Social | `X_BEARER_TOKEN` (X API, paid tier) |
| **Telegram** public channel OSINT | none |
| Live **index and commodity quotes** | none |
| CORS fallback for Reddit / ADS-B / GDELT, AI providers that block browsers | none |

Final payment for flights, hotels and products always happens on the airline's, hotel's or store's own checkout. No card data passes through the terminal.

---

## Deploy

### 1. GitHub Pages

```bash
git clone https://github.com/YOU/vauxhall-terminal && cd vauxhall-terminal
npm start                     # local preview at http://localhost:8080 (ES modules need http://, not file://)
git push origin main
```

In the repo: **Settings › Pages › Source: GitHub Actions**. The included `pages.yml` deploys on every push. Keep the `.nojekyll` file, because Jekyll would otherwise hide `views/_icons.js`.

### 2. Relay (optional, ~5 minutes, Cloudflare free tier)

```bash
cd worker
# edit wrangler.toml → ALLOWED_ORIGINS = "https://YOU.github.io,http://localhost:8080"
npx wrangler login
npx wrangler secret put SERPAPI_KEY        # https://serpapi.com/manage-api-key
npx wrangler secret put X_BEARER_TOKEN     # optional, https://developer.x.com
npx wrangler secret put RELAY_TOKEN        # recommended: a random string
npx wrangler deploy
```

Put the worker URL in `config.js → relayUrl`, or let each visitor enter their own under **Connections**.

> **Cost control:** if your site is public and the relay has no `RELAY_TOKEN`, every visitor spends your SerpApi and X quota. Set `RELAY_TOKEN` and share it only with people you trust, or don't put `relayUrl` in `config.js` and let visitors bring their own relay. Cloudflare's rate-limiting rules add a second layer.

### 3. Google setup

1. [Google Cloud Console](https://console.cloud.google.com/) › create a project › enable the **Gmail API** and **Google Calendar API**.
2. **OAuth consent screen**: External. Add the scopes `gmail.readonly`, `gmail.send` and `calendar.events`. While the app is in *Testing*, add yourself and your friends as test users.
3. **Credentials › Create OAuth client ID › Web application**. Under *Authorised JavaScript origins*, add `https://YOU.github.io` and `http://localhost:8080`.
4. Put the client ID in `config.js → googleClientId`. It is public by design; there is no client secret in this flow.

Gmail's read scope is a *restricted* scope. To open sign-in to the general public you'd need Google's verification and security assessment. For personal use and friends, Testing mode is fine.

---

## Architecture

```
index.html, config.js          static shell + public config
assets/js/core.js              storage, relay client, fetch-with-fallback, UI helpers
assets/js/ai.js                AI providers (streaming, BYOK)
assets/js/google.js            Google Identity Services token flow, Gmail + Calendar REST
assets/js/bsky.js              AT Protocol client
assets/js/airports.js          route network + airport autocomplete
assets/js/map2d.js             SVG world map (pre-projected Natural Earth paths)
assets/js/views/*.js           one module per section, lazily rendered
data/intel.json                curated, dated snapshot (edit to update flashpoints / ticker)
data/routes.min.json           built by scripts/build-routes.mjs (weekly Action)
worker/relay.js                optional Cloudflare Worker
```

There is no build step and no framework. CDN libraries (Leaflet, globe.gl, Trystero, Google Identity Services) load only when a section needs them.

**Messaging model.** Friends connect directly over WebRTC data channels. Public Nostr relays carry only the connection handshake, which Trystero encrypts with a room password. Messages are stored in each participant's browser and are never on a server. Because of that, a message to an offline friend waits in your outbox until you are both online at the same time. Group channels sync recent history from whichever member is online.

## Updating the intelligence snapshot

`data/intel.json` holds the hand-curated layer: flashpoints with dates and sources, cyber advisories, market closes, the ticker and the UK threat level. Edit it and push. Every item carries its own date, and the UI labels the file as a dated snapshot. Live layers (GDELT, OSINT, ADS-B, USGS, NASA, CISA) update themselves.

## Responsible use, terms and attribution

- **OSINT is unverified by default.** Items are labelled UNVERIFIED, CORROBORATED or OFFICIAL. Default channels and subreddits are starting points, not endorsements; many conflict sources are partisan. Use the verification checklist before sharing.
- **Scraping.** The terminal uses official APIs, public JSON endpoints, embeds and deep links. The relay reads Telegram's public web preview (`t.me/s/…`) and Yahoo Finance's chart endpoint. Check that your use fits each service's terms, and remove either route if it doesn't.
- **Fair use of free infrastructure:** OSRM demo server, Photon, Overpass, adsb.lol, airplanes.live, adsbdb and Planespotters are community-run. Keep request rates modest. ADS-B data from adsb.lol is ODbL-licensed. Map data © OpenStreetMap contributors, tiles © CARTO.
- **AI keys** are stored in `localStorage` on the visitor's own device. Anyone with access to that browser profile can read them. Use keys with spending limits.
- **Privacy.** Remote images in emails are blocked until you allow them. The Google token lives in memory only. *Connections › Your data* exports or wipes everything.

## Licence

MIT. Third-party data and services keep their own licences and terms.
