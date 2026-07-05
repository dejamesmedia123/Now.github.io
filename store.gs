/**
 * NF STORE — the entire "backend".
 *
 * This project does exactly two things, on two Drive files:
 *   - read(file)          -> returns the whole JSON blob
 *   - write(file, state)  -> overwrites the whole JSON blob
 *
 * It has no concept of users, plans, orders, payouts, MT5, Telegram, or
 * Flutterwave. All of that logic lives in engine.js on the frontend, or in
 * the flutterwave.gs / telegram.gs satellite projects. If you find yourself
 * wanting to add an "action" here beyond read/write, that logic belongs
 * somewhere else.
 *
 * Two files, two trust levels:
 *   - "public"  -> nf.json          (plans, orders, accounts, payouts, discounts...)
 *   - "private" -> nf-private.json  (MT5 credentials, the MT5 pool, payout bank details)
 *
 * The private file requires a shared key on every request (see PRIVATE_KEY
 * below). This is NOT real access control — it's obscurity, the same
 * tradeoff as the hard-to-guess admin URL. Anyone who has the key can read
 * or overwrite it, same as the public file. Treat it as a speed bump, not a
 * lock.
 *
 * ---- ONE-TIME SETUP ----
 * 1. Run setup() once from the Apps Script editor. It creates nf.json and
 *    nf-private.json in your Drive (root folder) with empty-but-valid
 *    starting shapes, and prints their file IDs.
 * 2. Deploy this project as a Web App (Execute as: Me, Access: Anyone).
 * 3. Put the resulting /exec URL into engine.js as STORE_URL.
 * 4. Set a PRIVATE_KEY script property (Project Settings > Script
 *    properties) to any long random string, and put the same string into
 *    engine.js as PRIVATE_KEY.
 */

var PUBLIC_FILENAME = "nf.json";
var PRIVATE_FILENAME = "nf-private.json";

var EMPTY_PUBLIC_STATE = {
  accountCategories: [
    { categoryId: "cat_instant", name: "Instant", phaseCount: 0, scaleUp: false, createdAt: "" },
    { categoryId: "cat_1step", name: "1-Step", phaseCount: 1, scaleUp: false, createdAt: "" },
    { categoryId: "cat_2step", name: "2-Step", phaseCount: 2, scaleUp: false, createdAt: "" }
  ],
  plans: [],
  discounts: [],
  users: [],
  orders: [],
  accounts: [],
  payouts: [],
  points: [],
  referrals: [],
  support: [],
  messages: [],
  settings: {
    referralPoints: 100,
    blownRefundEnabled: true,
    blownRefundPct: 35,
    pointsPerDollar: 100,
    paymentCurrency: "NGN"
  }
};

var EMPTY_PRIVATE_STATE = {
  accountCredentials: [],   // [{accountId, mt5Login, mt5Password, mt5Server, updatedAt}]
  mt5Pool: [],              // [{poolId, mt5Login, mt5Password, mt5Server, categoryId, accountSize, status, assignedAccountId, uploadedAt}]
  payoutBanks: []           // [{telegramId, bankName, bankCode, accountNumber, accountName, updatedAt}]
};

function setup() {
  var pub = getOrCreateFile_(PUBLIC_FILENAME, EMPTY_PUBLIC_STATE);
  var priv = getOrCreateFile_(PRIVATE_FILENAME, EMPTY_PRIVATE_STATE);
  return "Public file ID: " + pub.getId() + " | Private file ID: " + priv.getId() +
    " | Now set a PRIVATE_KEY script property before deploying.";
}

function getOrCreateFile_(filename, emptyState) {
  var files = DriveApp.getFilesByName(filename);
  if (files.hasNext()) return files.next();
  var file = DriveApp.createFile(filename, JSON.stringify(emptyState, null, 2), MimeType.PLAIN_TEXT);
  return file;
}

function getFile_(filename) {
  var files = DriveApp.getFilesByName(filename);
  if (!files.hasNext()) throw new Error("Store file not found: " + filename + ". Run setup() first.");
  return files.next();
}

function readState_(which) {
  var filename = which === "private" ? PRIVATE_FILENAME : PUBLIC_FILENAME;
  var file = getFile_(filename);
  var text = file.getBlob().getDataAsString();
  return text ? JSON.parse(text) : {};
}

function writeState_(which, state) {
  var filename = which === "private" ? PRIVATE_FILENAME : PUBLIC_FILENAME;
  var file = getFile_(filename);
  file.setContent(JSON.stringify(state));
  return true;
}

function checkPrivateKey_(params) {
  var configured = PropertiesService.getScriptProperties().getProperty("PRIVATE_KEY");
  return configured && params.key === configured;
}

function ok_(data) {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, data: data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function err_(msg) {
  return ContentService.createTextOutput(JSON.stringify({ ok: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return handle_(e);
}

function doPost(e) {
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
      } catch (x) { /* not JSON, ignore */ }
    }

    var which = params.file === "private" ? "private" : "public";
    if (which === "private" && !checkPrivateKey_(params)) {
      return err_("Unauthorized");
    }

    if (params.op === "read") {
      return ok_(readState_(which));
    }
    if (params.op === "write") {
      var newState = typeof params.state === "string" ? JSON.parse(params.state) : params.state;
      if (!newState) return err_("Missing state");
      writeState_(which, newState);
      return ok_(true);
    }
    return err_("Unknown op. Use op=read or op=write.");
  } catch (ex) {
    return err_("Store error: " + ex.message);
  }
}
