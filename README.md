# NowFunded Setup Guide

## Step 1 — Google Apps Script

1. Go to script.google.com and create a new project
2. Paste the contents of `code.gs` into the editor
3. Run the `setup()` function once — it will auto-create the Google Sheet and all Script Properties
4. Deploy as Web App: Execute as **Me**, Who has access **Anyone**
5. Copy the Web App URL

## Step 2 — Configure Script Properties

Go to Project Settings → Script Properties and fill in:

| Key | Value |
|-----|-------|
| `botToken` | Your Telegram Bot token from @BotFather |
| `adminPassword` | Password you'll use to log into admin.html |
| `adminChatId` | Your personal Telegram chat ID (for admin notifications) |
| `walletAddress` | Your crypto wallet address for payments |
| `payoutSplit1` | First payout split % (e.g. 80) |
| `payoutSplitN` | Subsequent payout split % (e.g. 70) |
| `referralPoints` | Points awarded per referral conversion (e.g. 100) |
| `blownRefundEnabled` | true or false |
| `blownRefundPct` | Refund % as points for blown accounts (e.g. 35) |
| `appUrl` | Full URL of your hosted app.html |

You can also set all of these from inside admin.html → Settings after first login.

## Step 3 — Host the HTML files on GitHub Pages

1. Create a GitHub repo (can be private with Pages enabled, or public)
2. Push `app.html` and `admin.html` to the repo
3. Go to Settings → Pages → Deploy from branch → main / root
4. Your URLs will be:
   - `https://yourusername.github.io/yourrepo/app.html`
   - `https://yourusername.github.io/yourrepo/admin.html`

## Step 4 — Set the API URL in the HTML files

In both `app.html` and `admin.html`, find the line near the top of the `<script>` block:

```js
var API = "";
```

Replace with your Web App URL:

```js
var API = "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec";
```

Do this in both files before pushing to GitHub.

## Step 5 — Telegram Bot & Mini App

1. Message @BotFather on Telegram
2. `/newbot` to create your bot
3. `/newapp` or set the Mini App URL to your `app.html` GitHub Pages URL
4. Set `/setdomain` to your GitHub Pages domain
5. Your referral deep links will use `https://t.me/YourBotName?start=REFCODE`

## Google Sheet Structure (auto-created)

The `setup()` function creates these tabs automatically:
- **Users** — all registered traders
- **Orders** — payment submissions
- **Accounts** — MT5 accounts per trader per phase
- **Payouts** — payout requests and history
- **Plans** — challenge plan configurations
- **Discounts** — promo and redemption codes
- **Points** — full points ledger
- **Referrals** — referral tracking
- **Support** — support thread headers
- **Messages** — support thread messages
- **Settings** — key-value config mirror

## Daily Admin Workflow

1. **New order comes in** → Admin notified on Telegram → Open admin.html → Orders → Confirm or Reject
2. **Order confirmed** → Go to Accounts → Find the new Phase 1 account → Click "Issue Creds" → Enter MT5 details
3. **Trader passes a phase** → Accounts → Click "Pass" → System auto-creates next phase or marks as Funded
4. **Payout request** → Payouts tab → Review amount and wallet → Approve or Reject
5. **Support ticket** → Support tab → Select thread → Reply → Close when resolved

## Notes

- All Telegram notifications fire automatically on key events
- The points shop generates one-time discount codes redeemable at checkout
- Scale-up is triggered automatically after the 2nd approved payout
- Blown account refund as points is configurable per the `blownRefundEnabled` setting
- Session tokens are stored in `sessionStorage` on the admin side (cleared on tab close)
