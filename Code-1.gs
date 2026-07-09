// ===== NOW FUNDED — BACKEND =====
// Dumb file store, exposed as a plain JSON HTTP API (frontend is hosted on GitHub,
// a different origin, so it talks to this via fetch(), not google.script.run).
// GET  ?action=read  -> returns the whole state as JSON, now including _version
// POST body=JSON     -> overwrites the whole state
//
// OPTIMISTIC VERSIONING (added):
// If the "Timekeeper" library is attached to this project (Editor > Libraries,
// see timekeeper.gs), every doGet response includes a _version number. A
// client that includes a matching _expectedVersion in its POST body gets a
// version-checked write: rejected with {ok:false, conflict:true,
// currentVersion} if someone else wrote in between.
//
// This is entirely OPT-IN and backward compatible:
//   - No Timekeeper library attached at all        -> behaves exactly as before.
//   - Client POSTs without _expectedVersion         -> unconditional overwrite,
//     exactly as before (this is what e.html and any unmodified client do).
//   - Client POSTs with _expectedVersion             -> version-checked write.
// So existing/unmodified pages can't be broken by this change.

var FILE_NAME = 'nnnn.json';

function hasTimekeeper_() {
  // True once the Timekeeper library has been added under Editor > Libraries
  // with identifier "Timekeeper". Until then this always returns false and
  // every code path below behaves exactly like the original file.
  return typeof Timekeeper !== 'undefined';
}

function doGet(e) {
  var action = e && e.parameter ? e.parameter.action : 'read';
  if (action === 'default') {
    var def = defaultState_();
    def._version = hasTimekeeper_() ? Timekeeper.getVersion(FILE_NAME) : 0;
    return jsonOut_(JSON.stringify(def));
  }
  var text = readData_();
  var parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    parsed = defaultState_();
  }
  parsed._version = hasTimekeeper_() ? Timekeeper.getVersion(FILE_NAME) : 0;
  return jsonOut_(JSON.stringify(parsed));
}

function doPost(e) {
  var body = e && e.postData ? e.postData.contents : '{}';

  if (hasTimekeeper_()) {
    var parsed;
    try {
      parsed = JSON.parse(body);
    } catch (err) {
      // Not valid JSON — fall back to the old unconditional write rather
      // than erroring, matching the original file's total lack of validation.
      writeData_(body);
      return jsonOut_(JSON.stringify({ ok: true }));
    }

    if (Object.prototype.hasOwnProperty.call(parsed, '_expectedVersion')) {
      var result = Timekeeper.checkAndBump(FILE_NAME, parsed._expectedVersion);
      if (!result.ok) {
        return jsonOut_(JSON.stringify({
          ok: false,
          conflict: true,
          currentVersion: result.currentVersion
        }));
      }
      delete parsed._expectedVersion; // bookkeeping only, don't persist it
      parsed._version = result.newVersion;
      writeData_(JSON.stringify(parsed));
      return jsonOut_(JSON.stringify({ ok: true, version: result.newVersion }));
    }
  }

  // Original behavior: full overwrite, last write wins, no checks.
  writeData_(body);
  return jsonOut_(JSON.stringify({ ok: true }));
}

function jsonOut_(text) {
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}

// Looks up nnnn.json in Drive root. Returns null if it doesn't exist yet —
// does NOT create it. Creation only happens on the first actual write
// (i.e. the first time a user signs up / logs data), not on page load.
function findFile_() {
  var files = DriveApp.getFilesByName(FILE_NAME);
  return files.hasNext() ? files.next() : null;
}

// If the file doesn't exist yet (no one has signed up/written anything),
// hands back the default seed state without creating anything in Drive.
function readData_() {
  var file = findFile_();
  if (!file) return JSON.stringify(defaultState_());
  var text = file.getBlob().getDataAsString();
  return text || JSON.stringify(defaultState_());
}

// Full overwrite — last write wins. No validation, no merge.
// Creates nnnn.json here, on the first real write (e.g. first user signup).
function writeData_(jsonString) {
  var file = findFile_();
  if (!file) {
    file = DriveApp.createFile(FILE_NAME, jsonString, MimeType.PLAIN_TEXT);
  } else {
    file.setContent(jsonString);
  }
  return true;
}

function defaultState_() {
  return {
    settings: {
      accessCode: 'admin123',
      bank: { name: '', accountNumber: '', accountName: '', instructions: 'Transfer the exact amount and include your order code in the narration.' },
      stats: { tradersCount: 565, totalPayouts: 5000000, fundedAccounts: 210 },
      recentPayouts: [
        { name: 'Ngozi Okafor', amount: 128000, hoursAgo: 4 },
        { name: 'David Olusegun', amount: 35000, hoursAgo: 5 },
        { name: 'Yusuf Ibrahim', amount: 87000, hoursAgo: 9 },
        { name: 'Aminat Sani', amount: 175000, hoursAgo: 14 }
      ],
      adminEmail: '',
      emailNotificationsEnabled: true,
      seo: {
        title: 'Now Funded — Get Funded. Trade With Clear Daily Limits.',
        description: 'Pass a Now Funded trading challenge and get a funded MT5 account with clear end-of-day drawdown limits, instant funding options, and fast payouts.',
        keywords: 'prop firm, funded trading account, forex challenge, MT5 funding, get funded to trade',
        ogImage: '',
        favicon: '',
        canonicalUrl: '',
        siteName: 'Now Funded'
      },
      affiliateDiscountRate: 20,
      affiliateCommissionRate: 10,
      minPayout: 5000,
      minAffiliatePayout: 5000,
      lowStockThreshold: 5,
      affiliateToolkit: [],
      affiliateTiers: [
        { id: 'tier_starter', name: 'Affiliate Starter', minReferrals: 0, commissionPct: 15 },
        { id: 'tier_rising', name: 'Rising Star', minReferrals: 5, commissionPct: 15 },
        { id: 'tier_champion', name: 'NairaProp Champion', minReferrals: 45, commissionPct: 18 },
        { id: 'tier_elite', name: 'Elite Ambassador', minReferrals: 60, commissionPct: 20 },
        { id: 'tier_partner', name: 'NairaProp Partner', minReferrals: 80, commissionPct: 25 }
      ]
    },
    drawdownTypes: [
      { id: 'dd_equity', name: 'Equity-Based EOD Drawdown', description: 'Your end-of-day equity (including floating P&L) must stay above the drawdown line.' },
      { id: 'dd_balance', name: 'Balance-Based EOD Drawdown', description: 'Only your end-of-day closed balance is checked — floating losses overnight don\'t count against you.' }
    ],
    planTypes: [
      { id: 'pt_2step', name: '2-Step' },
      { id: 'pt_1step', name: '1-Step' },
      { id: 'pt_instant', name: 'Instant Funding' }
    ],
    plans: [],
    mt5Pool: [],
    discountCodes: [],
    users: [],
    orders: [],
    traderAccounts: [],
    payoutRequests: [],
    certificates: [],
    testimonials: [],
    faqs: [],
    notifications: [],
    activityLog: [],
    chatMessages: [],
    supportTickets: []
  };
}
