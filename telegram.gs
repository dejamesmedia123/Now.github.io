/**
 * TELEGRAM PROJECT — the only place the bot token lives.
 *
 * Two jobs:
 *  1. notify(type, params) - a small dispatcher other projects (and
 *     engine.js, from the frontend) call to send a message. It never talks
 *     to nf.json directly; it just composes text and sends it.
 *  2. doPost webhook - handles incoming Telegram updates. The ONLY command
 *     handled is /start, which replies with a button that opens app.html as
 *     a Telegram WebApp. Every other message is ignored — this bot never
 *     reads or acts on trader replies.
 *
 * ---- ONE-TIME SETUP ----
 * 1. Script properties: BOT_TOKEN, ADMIN_CHAT_ID, APP_URL (your deployed
 *    app.html URL).
 * 2. Deploy as a Web App (Execute as: Me, Access: Anyone).
 * 3. Set the Telegram webhook once, from the Apps Script editor, by running
 *    setWebhook() after deployment (edit WEBHOOK_URL below to your /exec
 *    URL first).
 */

var WEBHOOK_URL = "#";

function prop_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function setWebhook() {
  var url = "https://api.telegram.org/bot" + prop_("BOT_TOKEN") + "/setWebhook";
  var resp = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ url: WEBHOOK_URL }),
    muteHttpExceptions: true
  });
  return resp.getContentText();
}

function sendMessage_(chatId, text, extra) {
  if (!chatId) return;
  var token = prop_("BOT_TOKEN");
  if (!token) return;
  var payload = { chat_id: String(chatId), text: text, parse_mode: "HTML" };
  if (extra) for (var k in extra) payload[k] = extra[k];
  UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

function ok_(data) {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, data: data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) { return handle_(e); }
function doPost(e) {
  // Telegram's own update payloads look like { update_id, message: {...} }
  // and don't have an "op" field — branch on that first.
  if (e.postData && e.postData.contents) {
    var data = {};
    try { data = JSON.parse(e.postData.contents); } catch (x) {}
    if (data && data.update_id !== undefined) return handleUpdate_(data);
  }
  return handle_(e);
}

function handle_(e) {
  try {
    var params = {};
    if (e.parameter) for (var k in e.parameter) params[k] = e.parameter[k];
    if (e.postData && e.postData.contents) {
      try {
        var body = JSON.parse(e.postData.contents);
        for (var k2 in body) params[k2] = body[k2];
      } catch (x) {}
    }
    if (params.op === "notify") return notify(params.type, params.params);
    return ok_(true);
  } catch (ex) {
    return ok_(false);
  }
}

// The only command this bot ever responds to. Everything else — replies,
// other commands, arbitrary text — is silently ignored by design.
function handleUpdate_(update) {
  var msg = update.message;
  if (!msg || !msg.text) return ok_(true);
  if (msg.text.indexOf("/start") === 0) {
    sendMessage_(msg.chat.id, "Welcome to NowFunded. Tap below to open the app.", {
      reply_markup: JSON.stringify({
        inline_keyboard: [[{ text: "Open NowFunded", web_app: { url: prop_("APP_URL") } }]]
      })
    });
  }
  return ok_(true);
}

// Central dispatcher — every notification trigger in the system funnels
// through here so message copy lives in exactly one place.
function notify(type, params) {
  params = params || {};
  var adminId = prop_("ADMIN_CHAT_ID");
  switch (type) {
    case "orderConfirmed":
      sendMessage_(params.telegramId, params.instant
        ? "✅ Payment confirmed! Your funded account is being set up."
        : "✅ Payment confirmed! Your Phase 1 account is being set up. You'll get your MT5 credentials shortly.");
      break;
    case "mt5CredentialsSent":
      sendMessage_(params.telegramId,
        "🖥 Your MT5 credentials are ready!\n\nLogin: <code>" + params.mt5Login +
        "</code>\nPassword: <code>" + params.mt5Password + "</code>\nServer: <code>" + params.mt5Server + "</code>");
      break;
    case "payoutRequested":
      sendMessage_(adminId, "💸 Payout request from " + (params.username || params.telegramId) + " — $" + params.amount);
      break;
    case "payoutApproved":
      sendMessage_(params.telegramId, "✅ Your payout of $" + params.amount + " has been approved and is being sent.");
      break;
    case "payoutSent":
      var traderAmt = (parseFloat(params.amount) * parseFloat(params.splitPct) / 100).toFixed(2);
      sendMessage_(params.telegramId, "💰 Your payout of $" + traderAmt + " (" + params.splitPct + "% split) has been sent.");
      break;
    case "accountPassed":
      sendMessage_(params.telegramId, params.funded
        ? "🏆 You passed and are now FUNDED! You can request payouts from your dashboard."
        : "🎉 You passed this phase! Your next phase account will be set up shortly.");
      break;
    case "accountBreached":
      sendMessage_(params.telegramId, "⚠️ Your account has been marked as breached — you exceeded a drawdown limit.");
      break;
    case "accountBlown":
      sendMessage_(params.telegramId, "💥 Your account has been blown." + (params.refundPts ? (" You received " + params.refundPts + " points as a consolation refund.") : ""));
      break;
    case "referralConverted":
      sendMessage_(params.telegramId, "🎉 You earned " + params.points + " points! Your referral just purchased a challenge.");
      break;
    case "adminAlert":
      sendMessage_(adminId, "⚠️ " + params.message);
      break;
    default:
      break;
  }
  return ok_(true);
}
