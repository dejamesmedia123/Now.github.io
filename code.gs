var SHEET_NAMES = {
  users: "Users",
  orders: "Orders",
  accounts: "Accounts",
  payouts: "Payouts",
  plans: "Plans",
  discounts: "Discounts",
  points: "Points",
  referrals: "Referrals",
  support: "Support",
  messages: "Messages",
  settings: "Settings"
};

var HEADERS = {
  users: ["telegramId","username","firstName","lastName","photoUrl","referralCode","referredBy","onboarded","createdAt"],
  orders: ["orderId","telegramId","planId","amount","discount","discountCode","paymentRef","status","createdAt","updatedAt"],
  accounts: ["accountId","orderId","telegramId","planId","phase","status","mt5Login","mt5Password","mt5Server","createdAt","updatedAt"],
  payouts: ["payoutId","accountId","telegramId","amount","walletAddress","splitPct","status","payoutCount","createdAt","updatedAt"],
  plans: ["planId","name","accountSize","price","phase1Target","phase2Target","maxDrawdown","payoutSplit1","payoutSplitN","active","createdAt"],
  discounts: ["codeId","code","discountPct","maxUses","usedCount","active","createdAt"],
  points: ["entryId","telegramId","type","amount","description","refId","createdAt"],
  referrals: ["refId","referrerTelegramId","refereeTelegramId","status","pointsAwarded","createdAt","updatedAt"],
  support: ["threadId","telegramId","subject","status","createdAt","updatedAt"],
  messages: ["messageId","threadId","senderRole","senderTelegramId","body","createdAt"],
  settings: ["key","value","updatedAt"]
};

var DEFAULT_SETTINGS = [
  ["walletAddress","",""],
  ["botToken","",""],
  ["adminChatId","",""],
  ["payoutSplit1","80",""],
  ["payoutSplitN","70",""],
  ["referralPoints","100",""],
  ["blownRefundEnabled","true",""],
  ["blownRefundPct","35",""],
  ["appUrl","",""],
  ["adminPassword",""]
];

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    ss = SpreadsheetApp.create("NowFunded_DB");
  }
  for (var name in SHEET_NAMES) {
    var label = SHEET_NAMES[name];
    var sheet = ss.getSheetByName(label);
    if (!sheet) {
      sheet = ss.insertSheet(label);
    }
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS[name]);
    }
  }
  var props = PropertiesService.getScriptProperties();
  var existing = props.getProperties();
  DEFAULT_SETTINGS.forEach(function(row) {
    if (!existing[row[0]]) {
      props.setProperty(row[0], row[1] || "");
    }
  });
  var ssId = ss.getId();
  props.setProperty("spreadsheetId", ssId);
  return "Setup complete. Spreadsheet ID: " + ssId;
}

function getSheet(name) {
  var props = PropertiesService.getScriptProperties();
  var ssId = props.getProperty("spreadsheetId");
  var ss = ssId ? SpreadsheetApp.openById(ssId) : SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAMES[name]);
}

function getSetting(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || "";
}

function setSetting(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
}

function sheetToObjects(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    headers.forEach(function(h, j) { obj[h] = data[i][j]; });
    rows.push(obj);
  }
  return rows;
}

function findRow(sheet, colName, value) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colIdx = headers.indexOf(colName);
  if (colIdx < 0) return -1;
  var colData = sheet.getRange(2, colIdx + 1, sheet.getLastRow(), 1).getValues();
  for (var i = 0; i < colData.length; i++) {
    if (String(colData[i][0]) === String(value)) return i + 2;
  }
  return -1;
}

function updateRow(sheet, rowNum, fields) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  fields.forEach(function(f) {
    var idx = headers.indexOf(f.key);
    if (idx >= 0) sheet.getRange(rowNum, idx + 1).setValue(f.value);
  });
}

function genId(prefix) {
  return prefix + "_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6);
}

function now() {
  return new Date().toISOString();
}

function sendTelegram(chatId, text) {
  var token = getSetting("botToken");
  if (!token || !chatId) return;
  var url = "https://api.telegram.org/bot" + token + "/sendMessage";
  UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ chat_id: String(chatId), text: text, parse_mode: "HTML" }),
    muteHttpExceptions: true
  });
}

function notifyAdmin(text) {
  var adminId = getSetting("adminChatId");
  if (adminId) sendTelegram(adminId, text);
}

function ok(data) {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, data: data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function err(msg) {
  return ContentService.createTextOutput(JSON.stringify({ ok: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

function validateSession(token) {
  var stored = getSetting("sessionToken");
  return stored && stored === token;
}

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  try {
    var params = {};
    if (e.postData && e.postData.contents) {
      try { params = JSON.parse(e.postData.contents); } catch(x) {}
    }
    if (e.parameter) {
      for (var k in e.parameter) params[k] = e.parameter[k];
    }
    var action = params.action || "";
    var publicActions = [
      "getPublicStats","getPlans","getPlan","validateDiscount",
      "initUser","getUser","submitOrder","adminLogin",
      "getUserAccounts","getUserAccount","requestPayout","getPayouts",
      "getPoints","getReferrals","getDiscountShop","redeemPoints",
      "getThreads","getThread","sendMessage","createThread"
    ];
    var adminActions = [
      "getOrders","confirmOrder","rejectOrder",
      "getAccounts","issueCredentials","updateAccountStatus",
      "getPendingPayouts","approvePayout","rejectPayout",
      "getAdminThreads","adminReply","closeThread",
      "adminGetPlans","createPlan","updatePlan","togglePlan",
      "getDiscountCodes","createDiscount","toggleDiscount",
      "getUsers","getAdminUser",
      "getSettings","saveSetting",
      "adminGetStats"
    ];
    if (adminActions.indexOf(action) >= 0) {
      if (!validateSession(params.token)) return err("Unauthorized");
    }
    if (action === "getPublicStats") return getPublicStats();
    if (action === "getPlans") return getPlans();
    if (action === "getPlan") return getPlan(params);
    if (action === "validateDiscount") return validateDiscount(params);
    if (action === "initUser") return initUser(params);
    if (action === "getUser") return getUser(params);
    if (action === "submitOrder") return submitOrder(params);
    if (action === "getUserAccounts") return getUserAccounts(params);
    if (action === "getUserAccount") return getUserAccount(params);
    if (action === "requestPayout") return requestPayout(params);
    if (action === "getPayouts") return getPayouts(params);
    if (action === "getPoints") return getPoints(params);
    if (action === "getReferrals") return getReferrals(params);
    if (action === "getDiscountShop") return getDiscountShop(params);
    if (action === "redeemPoints") return redeemPoints(params);
    if (action === "getThreads") return getThreads(params);
    if (action === "getThread") return getThread(params);
    if (action === "sendMessage") return sendMessage(params);
    if (action === "createThread") return createThread(params);
    if (action === "adminLogin") return adminLogin(params);
    if (action === "getOrders") return getOrders(params);
    if (action === "confirmOrder") return confirmOrder(params);
    if (action === "rejectOrder") return rejectOrder(params);
    if (action === "getAccounts") return getAccounts(params);
    if (action === "issueCredentials") return issueCredentials(params);
    if (action === "updateAccountStatus") return updateAccountStatus(params);
    if (action === "getPendingPayouts") return getPendingPayouts(params);
    if (action === "approvePayout") return approvePayout(params);
    if (action === "rejectPayout") return rejectPayout(params);
    if (action === "getAdminThreads") return getAdminThreads(params);
    if (action === "adminReply") return adminReply(params);
    if (action === "closeThread") return closeThread(params);
    if (action === "adminGetPlans") return adminGetPlans(params);
    if (action === "createPlan") return createPlan(params);
    if (action === "updatePlan") return updatePlan(params);
    if (action === "togglePlan") return togglePlan(params);
    if (action === "getDiscountCodes") return getDiscountCodes(params);
    if (action === "createDiscount") return createDiscount(params);
    if (action === "toggleDiscount") return toggleDiscount(params);
    if (action === "getUsers") return getUsers(params);
    if (action === "getAdminUser") return getAdminUser(params);
    if (action === "getSettings") return getSettingsAll(params);
    if (action === "saveSetting") return saveSettingAction(params);
    if (action === "adminGetStats") return adminGetStats(params);
    return err("Unknown action");
  } catch(ex) {
    return err("Server error: " + ex.message);
  }
}

function getPublicStats() {
  var accounts = sheetToObjects(getSheet("accounts"));
  var payouts = sheetToObjects(getSheet("payouts"));
  var funded = accounts.filter(function(a){ return a.status === "funded" || a.status === "scaled"; }).length;
  var totalPaid = payouts.filter(function(p){ return p.status === "approved"; })
    .reduce(function(s, p){ return s + (parseFloat(p.amount) || 0); }, 0);
  return ok({
    accountsIssued: funded,
    totalPayouts: totalPaid,
    payoutSplit1: getSetting("payoutSplit1"),
    payoutSplitN: getSetting("payoutSplitN")
  });
}

function getPlans() {
  var plans = sheetToObjects(getSheet("plans")).filter(function(p){ return p.active === true || p.active === "TRUE" || p.active === "true"; });
  return ok(plans);
}

function getPlan(params) {
  var plans = sheetToObjects(getSheet("plans"));
  var plan = plans.find(function(p){ return p.planId === params.planId; });
  if (!plan) return err("Plan not found");
  return ok(plan);
}

function validateDiscount(params) {
  var codes = sheetToObjects(getSheet("discounts"));
  var code = codes.find(function(c){
    return c.code === params.code && (c.active === true || c.active === "TRUE" || c.active === "true");
  });
  if (!code) return err("Invalid or inactive code");
  if (parseInt(code.maxUses) > 0 && parseInt(code.usedCount) >= parseInt(code.maxUses)) return err("Code usage limit reached");
  return ok({ discountPct: code.discountPct, codeId: code.codeId });
}

function initUser(params) {
  if (!params.telegramId) return err("No telegramId");
  var sheet = getSheet("users");
  var existing = sheetToObjects(sheet).find(function(u){ return String(u.telegramId) === String(params.telegramId); });
  if (existing) return ok({ user: existing, isNew: false });
  var refCode = "NF" + Math.random().toString(36).substr(2, 8).toUpperCase();
  var row = [
    params.telegramId, params.username || "", params.firstName || "",
    params.lastName || "", params.photoUrl || "", refCode,
    params.referredBy || "", "false", now()
  ];
  sheet.appendRow(row);
  if (params.referredBy) {
    var refSheet = getSheet("users");
    var referrer = sheetToObjects(refSheet).find(function(u){ return u.referralCode === params.referredBy; });
    if (referrer) {
      var refId = genId("ref");
      getSheet("referrals").appendRow([refId, referrer.telegramId, params.telegramId, "pending", "0", now(), now()]);
    }
  }
  var newUser = sheetToObjects(sheet).find(function(u){ return String(u.telegramId) === String(params.telegramId); });
  return ok({ user: newUser, isNew: true });
}

function getUser(params) {
  if (!params.telegramId) return err("No telegramId");
  var users = sheetToObjects(getSheet("users"));
  var user = users.find(function(u){ return String(u.telegramId) === String(params.telegramId); });
  if (!user) return err("User not found");
  return ok(user);
}

function markOnboarded(params) {
  var sheet = getSheet("users");
  var rowNum = findRow(sheet, "telegramId", params.telegramId);
  if (rowNum < 0) return err("User not found");
  updateRow(sheet, rowNum, [{ key: "onboarded", value: "true" }]);
  return ok(true);
}

function submitOrder(params) {
  if (!params.telegramId || !params.planId || !params.paymentRef) return err("Missing fields");
  var plans = sheetToObjects(getSheet("plans"));
  var plan = plans.find(function(p){ return p.planId === params.planId; });
  if (!plan) return err("Plan not found");
  var price = parseFloat(plan.price);
  var discount = 0;
  var discountCode = "";
  if (params.discountCode) {
    var codes = sheetToObjects(getSheet("discounts"));
    var code = codes.find(function(c){ return c.code === params.discountCode && (c.active === "true" || c.active === true || c.active === "TRUE"); });
    if (code) {
      discount = parseFloat(code.discountPct);
      discountCode = params.discountCode;
      var cSheet = getSheet("discounts");
      var cRow = findRow(cSheet, "code", params.discountCode);
      if (cRow > 0) {
        var used = parseInt(code.usedCount) + 1;
        updateRow(cSheet, cRow, [{ key: "usedCount", value: used }]);
      }
    }
  }
  var finalAmount = price - (price * discount / 100);
  var orderId = genId("ord");
  getSheet("orders").appendRow([orderId, params.telegramId, params.planId, finalAmount, discount, discountCode, params.paymentRef, "pending", now(), now()]);
  notifyAdmin("📥 New order from @" + (params.username || params.telegramId) + "\nPlan: " + plan.name + "\nAmount: $" + finalAmount + "\nRef: " + params.paymentRef);
  return ok({ orderId: orderId });
}

function getUserAccounts(params) {
  if (!params.telegramId) return err("No telegramId");
  var accounts = sheetToObjects(getSheet("accounts")).filter(function(a){ return String(a.telegramId) === String(params.telegramId); });
  var plans = sheetToObjects(getSheet("plans"));
  accounts = accounts.map(function(a){
    var plan = plans.find(function(p){ return p.planId === a.planId; }) || {};
    a.planDetails = plan;
    return a;
  });
  return ok(accounts);
}

function getUserAccount(params) {
  var accounts = sheetToObjects(getSheet("accounts"));
  var account = accounts.find(function(a){ return a.accountId === params.accountId && String(a.telegramId) === String(params.telegramId); });
  if (!account) return err("Account not found");
  var plans = sheetToObjects(getSheet("plans"));
  account.planDetails = plans.find(function(p){ return p.planId === account.planId; }) || {};
  var payouts = sheetToObjects(getSheet("payouts")).filter(function(p){ return p.accountId === account.accountId; });
  account.payouts = payouts;
  return ok(account);
}

function requestPayout(params) {
  if (!params.telegramId || !params.accountId || !params.amount || !params.walletAddress) return err("Missing fields");
  var accounts = sheetToObjects(getSheet("accounts"));
  var account = accounts.find(function(a){ return a.accountId === params.accountId && String(a.telegramId) === String(params.telegramId); });
  if (!account) return err("Account not found");
  if (account.status !== "funded" && account.status !== "scaled") return err("Account not eligible for payout");
  var payouts = sheetToObjects(getSheet("payouts")).filter(function(p){ return p.accountId === params.accountId; });
  var hasPending = payouts.find(function(p){ return p.status === "pending"; });
  if (hasPending) return err("A payout is already pending for this account");
  var approvedCount = payouts.filter(function(p){ return p.status === "approved"; }).length;
  var splitPct = approvedCount === 0 ? getSetting("payoutSplit1") : getSetting("payoutSplitN");
  var payoutId = genId("pay");
  getSheet("payouts").appendRow([payoutId, params.accountId, params.telegramId, params.amount, params.walletAddress, splitPct, "pending", approvedCount + 1, now(), now()]);
  notifyAdmin("💸 Payout request from @" + (params.username || params.telegramId) + "\nAmount: $" + params.amount + "\nWallet: " + params.walletAddress);
  return ok({ payoutId: payoutId, splitPct: splitPct });
}

function getPayouts(params) {
  if (!params.telegramId) return err("No telegramId");
  var payouts = sheetToObjects(getSheet("payouts")).filter(function(p){ return String(p.telegramId) === String(params.telegramId); });
  return ok(payouts);
}

function getPoints(params) {
  if (!params.telegramId) return err("No telegramId");
  var entries = sheetToObjects(getSheet("points")).filter(function(e){ return String(e.telegramId) === String(params.telegramId); });
  var balance = entries.reduce(function(s, e){ return s + (parseFloat(e.amount) || 0); }, 0);
  return ok({ balance: balance, ledger: entries });
}

function getReferrals(params) {
  if (!params.telegramId) return err("No telegramId");
  var refs = sheetToObjects(getSheet("referrals")).filter(function(r){ return String(r.referrerTelegramId) === String(params.telegramId); });
  var users = sheetToObjects(getSheet("users"));
  refs = refs.map(function(r){
    var referee = users.find(function(u){ return String(u.telegramId) === String(r.refereeTelegramId); }) || {};
    r.refereeName = referee.firstName || referee.username || r.refereeTelegramId;
    return r;
  });
  return ok(refs);
}

function getDiscountShop(params) {
  var plans = sheetToObjects(getSheet("plans")).filter(function(p){ return p.active === "true" || p.active === true || p.active === "TRUE"; });
  var pointsBalance = 0;
  if (params.telegramId) {
    var entries = sheetToObjects(getSheet("points")).filter(function(e){ return String(e.telegramId) === String(params.telegramId); });
    pointsBalance = entries.reduce(function(s, e){ return s + (parseFloat(e.amount) || 0); }, 0);
  }
  var items = plans.map(function(p){
    var cost = Math.round(parseFloat(p.price) * 0.1);
    return { planId: p.planId, name: p.name, discountPct: 10, pointsCost: cost, canAfford: pointsBalance >= cost };
  });
  return ok({ items: items, balance: pointsBalance });
}

function redeemPoints(params) {
  if (!params.telegramId || !params.planId) return err("Missing fields");
  var plans = sheetToObjects(getSheet("plans"));
  var plan = plans.find(function(p){ return p.planId === params.planId; });
  if (!plan) return err("Plan not found");
  var cost = Math.round(parseFloat(plan.price) * 0.1);
  var entries = sheetToObjects(getSheet("points")).filter(function(e){ return String(e.telegramId) === String(params.telegramId); });
  var balance = entries.reduce(function(s, e){ return s + (parseFloat(e.amount) || 0); }, 0);
  if (balance < cost) return err("Insufficient points");
  var code = "REDEEM" + Math.random().toString(36).substr(2, 8).toUpperCase();
  var codeId = genId("disc");
  getSheet("discounts").appendRow([codeId, code, 10, 1, 0, "true", now()]);
  getSheet("points").appendRow([genId("pt"), params.telegramId, "spend", -cost, "Redeemed for discount code " + code, codeId, now()]);
  return ok({ code: code, discountPct: 10 });
}

function getThreads(params) {
  if (!params.telegramId) return err("No telegramId");
  var threads = sheetToObjects(getSheet("support")).filter(function(t){ return String(t.telegramId) === String(params.telegramId); });
  return ok(threads);
}

function getThread(params) {
  var thread = sheetToObjects(getSheet("support")).find(function(t){ return t.threadId === params.threadId; });
  if (!thread) return err("Thread not found");
  var messages = sheetToObjects(getSheet("messages")).filter(function(m){ return m.threadId === params.threadId; });
  thread.messages = messages;
  return ok(thread);
}

function createThread(params) {
  if (!params.telegramId || !params.subject || !params.body) return err("Missing fields");
  var threadId = genId("thr");
  getSheet("support").appendRow([threadId, params.telegramId, params.subject, "open", now(), now()]);
  var msgId = genId("msg");
  getSheet("messages").appendRow([msgId, threadId, "trader", params.telegramId, params.body, now()]);
  notifyAdmin("💬 New support thread from @" + (params.username || params.telegramId) + "\nSubject: " + params.subject);
  return ok({ threadId: threadId });
}

function sendMessage(params) {
  if (!params.telegramId || !params.threadId || !params.body) return err("Missing fields");
  var thread = sheetToObjects(getSheet("support")).find(function(t){ return t.threadId === params.threadId; });
  if (!thread) return err("Thread not found");
  var msgId = genId("msg");
  getSheet("messages").appendRow([msgId, params.threadId, "trader", params.telegramId, params.body, now()]);
  var tSheet = getSheet("support");
  var tRow = findRow(tSheet, "threadId", params.threadId);
  updateRow(tSheet, tRow, [{ key: "updatedAt", value: now() }]);
  notifyAdmin("💬 Reply from @" + (params.username || params.telegramId) + " on thread: " + thread.subject);
  return ok(true);
}

function adminLogin(params) {
  var password = getSetting("adminPassword");
  if (!password || password !== params.password) return err("Invalid password");
  var token = genId("sess") + genId("tok");
  setSetting("sessionToken", token);
  return ok({ token: token });
}

function getOrders(params) {
  var orders = sheetToObjects(getSheet("orders"));
  var users = sheetToObjects(getSheet("users"));
  var plans = sheetToObjects(getSheet("plans"));
  var status = params.status || "pending";
  var filtered = status === "all" ? orders : orders.filter(function(o){ return o.status === status; });
  filtered = filtered.map(function(o){
    var user = users.find(function(u){ return String(u.telegramId) === String(o.telegramId); }) || {};
    var plan = plans.find(function(p){ return p.planId === o.planId; }) || {};
    o.userName = user.username || user.firstName || o.telegramId;
    o.planName = plan.name || o.planId;
    return o;
  });
  return ok(filtered);
}

function confirmOrder(params) {
  if (!params.orderId) return err("No orderId");
  var oSheet = getSheet("orders");
  var rowNum = findRow(oSheet, "orderId", params.orderId);
  if (rowNum < 0) return err("Order not found");
  var order = sheetToObjects(oSheet).find(function(o){ return o.orderId === params.orderId; });
  updateRow(oSheet, rowNum, [{ key: "status", value: "confirmed" }, { key: "updatedAt", value: now() }]);
  var accountId = genId("acc");
  getSheet("accounts").appendRow([accountId, params.orderId, order.telegramId, order.planId, "1", "active", "", "", "", now(), now()]);
  var refs = sheetToObjects(getSheet("referrals")).filter(function(r){ return String(r.refereeTelegramId) === String(order.telegramId) && r.status === "pending"; });
  refs.forEach(function(r){
    var refSheet = getSheet("referrals");
    var rRow = findRow(refSheet, "refId", r.refId);
    var pts = parseInt(getSetting("referralPoints")) || 100;
    updateRow(refSheet, rRow, [{ key: "status", value: "converted" }, { key: "pointsAwarded", value: pts }, { key: "updatedAt", value: now() }]);
    getSheet("points").appendRow([genId("pt"), r.referrerTelegramId, "earn", pts, "Referral bonus for " + order.telegramId, r.refId, now()]);
    sendTelegram(r.referrerTelegramId, "🎉 You earned " + pts + " points! Your referral just purchased a challenge.");
  });
  sendTelegram(order.telegramId, "✅ Your payment has been confirmed! Your Phase 1 account is being set up. You'll receive your MT5 credentials shortly.");
  return ok({ accountId: accountId });
}

function rejectOrder(params) {
  if (!params.orderId) return err("No orderId");
  var oSheet = getSheet("orders");
  var rowNum = findRow(oSheet, "orderId", params.orderId);
  if (rowNum < 0) return err("Order not found");
  var order = sheetToObjects(oSheet).find(function(o){ return o.orderId === params.orderId; });
  updateRow(oSheet, rowNum, [{ key: "status", value: "rejected" }, { key: "updatedAt", value: now() }]);
  sendTelegram(order.telegramId, "❌ Your payment could not be verified. Please contact support if you believe this is a mistake.");
  return ok(true);
}

function getAccounts(params) {
  var accounts = sheetToObjects(getSheet("accounts"));
  var users = sheetToObjects(getSheet("users"));
  var plans = sheetToObjects(getSheet("plans"));
  var phase = params.phase || "";
  var status = params.status || "";
  var filtered = accounts;
  if (phase) filtered = filtered.filter(function(a){ return String(a.phase) === String(phase); });
  if (status) filtered = filtered.filter(function(a){ return a.status === status; });
  filtered = filtered.map(function(a){
    var user = users.find(function(u){ return String(u.telegramId) === String(a.telegramId); }) || {};
    var plan = plans.find(function(p){ return p.planId === a.planId; }) || {};
    a.userName = user.username || user.firstName || a.telegramId;
    a.planName = plan.name || a.planId;
    return a;
  });
  return ok(filtered);
}

function issueCredentials(params) {
  if (!params.accountId || !params.mt5Login || !params.mt5Password || !params.mt5Server) return err("Missing credentials");
  var aSheet = getSheet("accounts");
  var rowNum = findRow(aSheet, "accountId", params.accountId);
  if (rowNum < 0) return err("Account not found");
  var account = sheetToObjects(aSheet).find(function(a){ return a.accountId === params.accountId; });
  updateRow(aSheet, rowNum, [
    { key: "mt5Login", value: params.mt5Login },
    { key: "mt5Password", value: params.mt5Password },
    { key: "mt5Server", value: params.mt5Server },
    { key: "updatedAt", value: now() }
  ]);
  sendTelegram(account.telegramId, "🖥 Your MT5 credentials are ready!\n\nLogin: <code>" + params.mt5Login + "</code>\nPassword: <code>" + params.mt5Password + "</code>\nServer: <code>" + params.mt5Server + "</code>\n\nPhase 1 starts now. Good luck!");
  return ok(true);
}

function updateAccountStatus(params) {
  if (!params.accountId || !params.status) return err("Missing params");
  var aSheet = getSheet("accounts");
  var rowNum = findRow(aSheet, "accountId", params.accountId);
  if (rowNum < 0) return err("Account not found");
  var account = sheetToObjects(aSheet).find(function(a){ return a.accountId === params.accountId; });
  var plans = sheetToObjects(getSheet("plans"));
  var plan = plans.find(function(p){ return p.planId === account.planId; }) || {};
  updateRow(aSheet, rowNum, [{ key: "status", value: params.status }, { key: "updatedAt", value: now() }]);
  if (params.status === "passed") {
    var currentPhase = parseInt(account.phase);
    if (currentPhase === 1) {
      var newAccId = genId("acc");
      getSheet("accounts").appendRow([newAccId, account.orderId, account.telegramId, account.planId, "2", "active", "", "", "", now(), now()]);
      sendTelegram(account.telegramId, "🎉 You passed Phase 1! Your Phase 2 account will be set up shortly.");
    } else if (currentPhase === 2) {
      updateRow(aSheet, rowNum, [{ key: "status", value: "funded" }, { key: "phase", value: "funded" }]);
      sendTelegram(account.telegramId, "🏆 You passed Phase 2 and are now FUNDED! Congratulations! You can now request payouts from your dashboard.");
    }
  } else if (params.status === "breached") {
    sendTelegram(account.telegramId, "⚠️ Your account has been marked as breached. You have exceeded a drawdown limit.");
  } else if (params.status === "blown") {
    var msg = "💥 Your account has been blown.";
    if (getSetting("blownRefundEnabled") === "true") {
      var pct = parseFloat(getSetting("blownRefundPct")) || 35;
      var refundPts = Math.round(parseFloat(plan.price || 0) * pct / 100);
      if (refundPts > 0) {
        getSheet("points").appendRow([genId("pt"), account.telegramId, "earn", refundPts, pct + "% refund as points for blown account", params.accountId, now()]);
        msg += " You received " + refundPts + " points as a " + pct + "% consolation refund.";
      }
    }
    sendTelegram(account.telegramId, msg);
  } else if (params.status === "scaled") {
    sendTelegram(account.telegramId, "🚀 Your account has been scaled up! Keep up the great trading.");
  }
  return ok(true);
}

function getPendingPayouts(params) {
  var payouts = sheetToObjects(getSheet("payouts")).filter(function(p){ return p.status === "pending"; });
  var users = sheetToObjects(getSheet("users"));
  payouts = payouts.map(function(p){
    var user = users.find(function(u){ return String(u.telegramId) === String(p.telegramId); }) || {};
    p.userName = user.username || user.firstName || p.telegramId;
    return p;
  });
  return ok(payouts);
}

function approvePayout(params) {
  if (!params.payoutId) return err("No payoutId");
  var pSheet = getSheet("payouts");
  var rowNum = findRow(pSheet, "payoutId", params.payoutId);
  if (rowNum < 0) return err("Payout not found");
  var payout = sheetToObjects(pSheet).find(function(p){ return p.payoutId === params.payoutId; });
  updateRow(pSheet, rowNum, [{ key: "status", value: "approved" }, { key: "updatedAt", value: now() }]);
  var traderAmt = parseFloat(payout.amount) * parseFloat(payout.splitPct) / 100;
  sendTelegram(payout.telegramId, "✅ Your payout of $" + traderAmt.toFixed(2) + " (" + payout.splitPct + "% split) has been approved and sent to your wallet!");
  var approvedPayouts = sheetToObjects(pSheet).filter(function(p){ return p.accountId === payout.accountId && p.status === "approved"; });
  if (approvedPayouts.length >= 2) {
    var aSheet = getSheet("accounts");
    var aRow = findRow(aSheet, "accountId", payout.accountId);
    if (aRow > 0) {
      var account = sheetToObjects(aSheet).find(function(a){ return a.accountId === payout.accountId; });
      if (account.status === "funded") {
        updateRow(aSheet, aRow, [{ key: "status", value: "scale_ready" }, { key: "updatedAt", value: now() }]);
        sendTelegram(payout.telegramId, "🚀 You are now eligible for a scale-up! Check your dashboard.");
        notifyAdmin("🚀 Scale-up ready for account " + payout.accountId);
      }
    }
  }
  return ok(true);
}

function rejectPayout(params) {
  if (!params.payoutId) return err("No payoutId");
  var pSheet = getSheet("payouts");
  var rowNum = findRow(pSheet, "payoutId", params.payoutId);
  if (rowNum < 0) return err("Payout not found");
  var payout = sheetToObjects(pSheet).find(function(p){ return p.payoutId === params.payoutId; });
  updateRow(pSheet, rowNum, [{ key: "status", value: "rejected" }, { key: "updatedAt", value: now() }]);
  sendTelegram(payout.telegramId, "❌ Your payout request has been rejected. Please contact support for more information.");
  return ok(true);
}

function getAdminThreads(params) {
  var threads = sheetToObjects(getSheet("support"));
  var users = sheetToObjects(getSheet("users"));
  var status = params.status || "open";
  var filtered = status === "all" ? threads : threads.filter(function(t){ return t.status === status; });
  filtered = filtered.map(function(t){
    var user = users.find(function(u){ return String(u.telegramId) === String(t.telegramId); }) || {};
    t.userName = user.username || user.firstName || t.telegramId;
    return t;
  });
  return ok(filtered);
}

function adminReply(params) {
  if (!params.threadId || !params.body) return err("Missing params");
  var thread = sheetToObjects(getSheet("support")).find(function(t){ return t.threadId === params.threadId; });
  if (!thread) return err("Thread not found");
  var msgId = genId("msg");
  getSheet("messages").appendRow([msgId, params.threadId, "admin", "admin", params.body, now()]);
  var tSheet = getSheet("support");
  var tRow = findRow(tSheet, "threadId", params.threadId);
  updateRow(tSheet, tRow, [{ key: "updatedAt", value: now() }]);
  sendTelegram(thread.telegramId, "💬 You have a new reply from the NowFunded team on your support ticket: \"" + thread.subject + "\"\n\nOpen the app to view the full reply.");
  return ok(true);
}

function closeThread(params) {
  if (!params.threadId) return err("No threadId");
  var tSheet = getSheet("support");
  var tRow = findRow(tSheet, "threadId", params.threadId);
  if (tRow < 0) return err("Thread not found");
  updateRow(tSheet, tRow, [{ key: "status", value: "closed" }, { key: "updatedAt", value: now() }]);
  return ok(true);
}

function adminGetPlans(params) {
  var plans = sheetToObjects(getSheet("plans"));
  return ok(plans);
}

function createPlan(params) {
  if (!params.name || !params.accountSize || !params.price) return err("Missing fields");
  var planId = genId("plan");
  getSheet("plans").appendRow([
    planId, params.name, params.accountSize, params.price,
    params.phase1Target, params.phase2Target, params.maxDrawdown,
    params.payoutSplit1 || getSetting("payoutSplit1"),
    params.payoutSplitN || getSetting("payoutSplitN"),
    "true", now()
  ]);
  return ok({ planId: planId });
}

function updatePlan(params) {
  if (!params.planId) return err("No planId");
  var pSheet = getSheet("plans");
  var rowNum = findRow(pSheet, "planId", params.planId);
  if (rowNum < 0) return err("Plan not found");
  var fields = ["name","accountSize","price","phase1Target","phase2Target","maxDrawdown","payoutSplit1","payoutSplitN"];
  var updates = [];
  fields.forEach(function(f){ if (params[f] !== undefined) updates.push({ key: f, value: params[f] }); });
  updateRow(pSheet, rowNum, updates);
  return ok(true);
}

function togglePlan(params) {
  if (!params.planId) return err("No planId");
  var pSheet = getSheet("plans");
  var rowNum = findRow(pSheet, "planId", params.planId);
  if (rowNum < 0) return err("Plan not found");
  var plan = sheetToObjects(pSheet).find(function(p){ return p.planId === params.planId; });
  var newVal = (plan.active === "true" || plan.active === true || plan.active === "TRUE") ? "false" : "true";
  updateRow(pSheet, rowNum, [{ key: "active", value: newVal }]);
  return ok({ active: newVal });
}

function getDiscountCodes(params) {
  var codes = sheetToObjects(getSheet("discounts"));
  return ok(codes);
}

function createDiscount(params) {
  if (!params.code || !params.discountPct) return err("Missing fields");
  var codeId = genId("disc");
  getSheet("discounts").appendRow([codeId, params.code.toUpperCase(), params.discountPct, params.maxUses || 0, 0, "true", now()]);
  return ok({ codeId: codeId });
}

function toggleDiscount(params) {
  if (!params.codeId) return err("No codeId");
  var cSheet = getSheet("discounts");
  var rowNum = findRow(cSheet, "codeId", params.codeId);
  if (rowNum < 0) return err("Code not found");
  var code = sheetToObjects(cSheet).find(function(c){ return c.codeId === params.codeId; });
  var newVal = (code.active === "true" || code.active === true || code.active === "TRUE") ? "false" : "true";
  updateRow(cSheet, rowNum, [{ key: "active", value: newVal }]);
  return ok({ active: newVal });
}

function getUsers(params) {
  var users = sheetToObjects(getSheet("users"));
  if (params.query) {
    var q = String(params.query).toLowerCase();
    users = users.filter(function(u){
      return String(u.telegramId).includes(q) || (u.username && u.username.toLowerCase().includes(q)) || (u.firstName && u.firstName.toLowerCase().includes(q));
    });
  }
  return ok(users);
}

function getAdminUser(params) {
  if (!params.telegramId) return err("No telegramId");
  var users = sheetToObjects(getSheet("users"));
  var user = users.find(function(u){ return String(u.telegramId) === String(params.telegramId); });
  if (!user) return err("User not found");
  var orders = sheetToObjects(getSheet("orders")).filter(function(o){ return String(o.telegramId) === String(params.telegramId); });
  var accounts = sheetToObjects(getSheet("accounts")).filter(function(a){ return String(a.telegramId) === String(params.telegramId); });
  var pointEntries = sheetToObjects(getSheet("points")).filter(function(e){ return String(e.telegramId) === String(params.telegramId); });
  var pointBalance = pointEntries.reduce(function(s, e){ return s + (parseFloat(e.amount) || 0); }, 0);
  var refs = sheetToObjects(getSheet("referrals")).filter(function(r){ return String(r.referrerTelegramId) === String(params.telegramId); });
  return ok({ user: user, orders: orders, accounts: accounts, points: { balance: pointBalance, ledger: pointEntries }, referrals: refs });
}

function getSettingsAll(params) {
  var props = PropertiesService.getScriptProperties().getProperties();
  var safe = {};
  var allowed = ["walletAddress","payoutSplit1","payoutSplitN","referralPoints","blownRefundEnabled","blownRefundPct","appUrl","adminChatId"];
  allowed.forEach(function(k){ safe[k] = props[k] || ""; });
  return ok(safe);
}

function saveSettingAction(params) {
  if (!params.key || params.value === undefined) return err("Missing key/value");
  var allowed = ["walletAddress","payoutSplit1","payoutSplitN","referralPoints","blownRefundEnabled","blownRefundPct","appUrl","adminChatId","adminPassword","botToken"];
  if (allowed.indexOf(params.key) < 0) return err("Key not allowed");
  setSetting(params.key, params.value);
  return ok(true);
}

function adminGetStats(params) {
  var orders = sheetToObjects(getSheet("orders"));
  var accounts = sheetToObjects(getSheet("accounts"));
  var payouts = sheetToObjects(getSheet("payouts"));
  var users = sheetToObjects(getSheet("users"));
  var threads = sheetToObjects(getSheet("support"));
  return ok({
    pendingOrders: orders.filter(function(o){ return o.status === "pending"; }).length,
    totalOrders: orders.length,
    totalUsers: users.length,
    activeAccounts: accounts.filter(function(a){ return a.status === "active"; }).length,
    fundedAccounts: accounts.filter(function(a){ return a.status === "funded" || a.status === "scaled"; }).length,
    pendingPayouts: payouts.filter(function(p){ return p.status === "pending"; }).length,
    totalPayoutsPaid: payouts.filter(function(p){ return p.status === "approved"; }).reduce(function(s, p){ return s + (parseFloat(p.amount) || 0); }, 0),
    openThreads: threads.filter(function(t){ return t.status === "open"; }).length
  });
}
