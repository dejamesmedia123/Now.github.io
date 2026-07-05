# NowFunded — dumb-store architecture

## Files
| File | Where it runs | Job |
|---|---|---|
| `store.gs` | Apps Script project #1 | Dumb store: `read()`/`write()` on `nf.json` + `nf-private.json` in Drive. No business logic. |
| `flutterwave.gs` | Apps Script project #2 | Holds the Flutterwave secret key. Checkout init, webhook verification, order finalization (account + MT5 pool assignment), account-name resolution, payout disbursement. |
| `telegram.gs` | Apps Script project #3 | Holds the bot token. `/start` → WebApp button. `notify(type, params)` dispatcher for every trigger. |
| `engine.js` | Static hosting (same place as the HTML files) | All trader/admin business logic. Imported by both HTML files. |
| `app.html` | Static hosting | Trader-facing Telegram Mini App. |
| `admin-x7k9qm3vtz2p8w.html` | Static hosting | Admin panel. No login — access = knowing this URL. Rename to your own random string before deploying; don't share it beyond people who should have full access. |
| `nf.sample.json` / `nf-private.sample.json` | Reference only | Shows the full data shape once categories/plans exist — not used directly, `store.gs`'s `setup()` creates the real files empty. |

## Setup order
1. **store.gs**: create the Apps Script project, paste in the file, run `setup()` once, deploy as a Web App. Note the `/exec` URL.
2. **telegram.gs**: new project, paste in file, set script properties `BOT_TOKEN` / `ADMIN_CHAT_ID` / `APP_URL`, deploy as Web App, edit `WEBHOOK_URL` to the deployed URL, run `setWebhook()` once.
3. **flutterwave.gs**: new project, paste in file, set script properties `FLW_SECRET_KEY` / `FLW_PUBLIC_KEY` / `FLW_WEBHOOK_HASH` / `STORE_URL` (from step 1) / `PRIVATE_KEY` (a long random string, matching what you'll put in `store.gs`'s properties) / `TELEGRAM_URL` (from step 2). Deploy as Web App, put that URL into your Flutterwave dashboard's webhook settings.
4. **store.gs** (finish): set the `PRIVATE_KEY` script property to the same value used in step 3.
5. **engine.js**: fill in `STORE_URL`, `PRIVATE_KEY`, `TELEGRAM_URL`, `FLW_URL` at the top.
6. Host `engine.js`, `app.html`, and the admin HTML file together on any static host (GitHub Pages, Cloudflare Pages, etc.) so `<script src="engine.js">` resolves.
7. Point your Telegram bot's Menu Button / Mini App URL at the hosted `app.html`.
8. In the admin panel, add at least one account category, one plan, and some MT5 pool logins (bulk-add box on the Pool tab) before testing an order end to end.

## Known simplifications, called out on purpose
- **Concurrency**: last-write-wins on both files. Fine at low volume; revisit if multiple admins act at once.
- **Private file "auth"** is a shared key baked into `engine.js` — obscurity, not real access control, matching the admin-URL approach.
- **Telegram identity isn't cryptographically verified** — `initDataUnsafe` is trusted as-is.
- **Instant-category accounts** now get a real MT5 login from the pool too, same as any other category — they're just created already `"funded"`, so pool assignment attaches credentials without downgrading that status.
- **Scale-up is fully removed**, per your call — funded accounts stay at their original size; bigger accounts come from buying a new challenge.
