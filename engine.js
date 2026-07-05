/**
 * NF ENGINE — shared by app.html and admin.html.
 *
 * Everything that used to be server-side logic in code.gs lives here now,
 * except: Flutterwave secret-key calls (flutterwave.gs), Telegram sends
 * (telegram.gs), and order finalization on payment webhook (also
 * flutterwave.gs, since webhooks fire without a browser open).
 *
 * Pattern used throughout: load() -> mutate the in-memory object -> save().
 * save() re-uploads the ENTIRE blob. There is no diffing and no locking —
 * two saves close together can silently drop one (see project notes on
 * concurrency). Fine at low traffic; something to watch as usage grows.
 */

var NF = (function () {
  var STORE_URL = "https://script.google.com/macros/s/AKfycbyzeZQaPcX7NKfcXSrcTe-itW37eO1wTEPka79ZayRYRLhwn7aJf3JzKWf3exaVuYbtNw/exec";
  var PRIVATE_KEY = "Rejudo123";
  var TELEGRAM_URL = "https://script.google.com/macros/s/AKfycbx-f6NW97kY9NsVqPywaaOYZvgaoXQFvK-kWI4doJMYPzL-hI049EUFBrz1FMmew0yQ7g/exec";
  var FLW_URL = "https://script.google.com/macros/s/AKfycbyZAE5tPA1r9A7kgqL_VQHoJiuHdwCZvAZdfBx-iLCBzxxSxsDmxNFqj5s1L1tSKO6w/exec";

  function genId(prefix) {
    return prefix + "_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6);
  }
  function nowIso() {
    return new Date().toISOString();
  }

  // ---------- transport ----------
  function call_(url, params) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(params)
    }).then(function (r) { return r.json(); })
      .then(function (body) {
        if (!body.ok) throw new Error(body.error || "Request failed");
        return body.data;
      });
  }

  function loadPublic() { return call_(STORE_URL, { op: "read", file: "public" }); }
  function savePublic(state) { return call_(STORE_URL, { op: "write", file: "public", state: state }); }
  function loadPrivate() { return call_(STORE_URL, { op: "read", file: "private", key: PRIVATE_KEY }); }
  function savePrivate(state) { return call_(STORE_URL, { op: "write", file: "private", state: state, key: PRIVATE_KEY }); }

  function notify(type, params) {
    // Fire-and-forget: a failed notification should never block or fail
    // the underlying state change that triggered it.
    call_(TELEGRAM_URL, { op: "notify", type: type, params: params }).catch(function () {});
  }

  function flw(op, params) {
    var payload = Object.assign({ op: op }, params);
    return call_(FLW_URL, payload);
  }

  // ---------- identity ----------
  function getTelegramUser() {
    var tg = window.Telegram && window.Telegram.WebApp;
    if (!tg || !tg.initDataUnsafe || !tg.initDataUnsafe.user) return null;
    var u = tg.initDataUnsafe.user;
    return { telegramId: String(u.id), username: u.username || "", firstName: u.first_name || "", lastName: u.last_name || "", photoUrl: u.photo_url || "" };
  }

  function initUser(state, tgUser, referredBy) {
    var existing = state.users.find(function (u) { return u.telegramId === tgUser.telegramId; });
    if (existing) return { user: existing, isNew: false };
    var refCode = "NF" + Math.random().toString(36).substr(2, 8).toUpperCase();
    var user = {
      telegramId: tgUser.telegramId, username: tgUser.username, firstName: tgUser.firstName,
      lastName: tgUser.lastName, photoUrl: tgUser.photoUrl, referralCode: refCode,
      referredBy: referredBy || "", onboarded: false, createdAt: nowIso()
    };
    state.users.push(user);
    if (referredBy) {
      var referrer = state.users.find(function (u) { return u.referralCode === referredBy; });
      if (referrer) {
        state.referrals.push({
          refId: genId("ref"), referrerTelegramId: referrer.telegramId, refereeTelegramId: tgUser.telegramId,
          status: "pending", pointsAwarded: 0, createdAt: nowIso(), updatedAt: nowIso()
        });
      }
    }
    return { user: user, isNew: true };
  }

  // ---------- pricing / discounts ----------
  // Mirrors the old applyDiscountToPrice: enforces per-plan/per-user lock,
  // usage cap, and marks the code used if markUsed is true. Mutates state
  // in place when markUsed is true — caller saves afterward.
  function applyDiscountToPrice(state, price, discountCodeStr, planId, telegramId, markUsed) {
    var discount = 0, discountCode = "";
    if (discountCodeStr) {
      var code = state.discounts.find(function (c) { return c.code === discountCodeStr && c.active; });
      if (!code) return { error: "Invalid or inactive discount code" };
      if (code.planId && code.planId !== planId) return { error: "This code isn't valid for the selected plan" };
      if (code.telegramId && code.telegramId !== telegramId) return { error: "This code isn't valid for your account" };
      if (code.maxUses > 0 && code.usedCount >= code.maxUses) return { error: "Discount code usage limit reached" };
      discount = code.discountType === "fixed" ? Math.min(code.discountValue, price) : price * code.discountValue / 100;
      discountCode = discountCodeStr;
      if (markUsed) code.usedCount = (code.usedCount || 0) + 1;
    }
    return { finalAmount: Math.max(0, price - discount), discount: discount, discountCode: discountCode };
  }

  // ---------- orders ----------
  // Step 1 of the Flutterwave flow: append an "awaiting_payment" order.
  // The browser then calls flutterwave.gs's initFlutterwaveOrder to get a
  // checkout config, opens Flutterwave's inline checkout, and the webhook
  // (handled entirely in flutterwave.gs, not here) confirms the order and
  // creates the account once payment is verified server-side.
  function createOrder(state, telegramId, planId, discountCode) {
    var plan = state.plans.find(function (p) { return p.planId === planId; });
    if (!plan) return { error: "Plan not found" };
    var priced = applyDiscountToPrice(state, plan.price, discountCode, planId, telegramId, false);
    if (priced.error) return priced;
    var order = {
      orderId: genId("ord"), telegramId: telegramId, planId: planId, amount: priced.finalAmount,
      discount: priced.discount, discountCode: priced.discountCode, status: "awaiting_payment",
      createdAt: nowIso(), updatedAt: nowIso()
    };
    state.orders.push(order);
    return { order: order };
  }

  function getUserOrders(state, telegramId) {
    return state.orders.filter(function (o) { return o.telegramId === telegramId; });
  }

  // ---------- accounts ----------
  function getUserAccounts(state, telegramId) {
    var accounts = state.accounts.filter(function (a) { return a.telegramId === telegramId; });
    return accounts.map(function (a) {
      var plan = state.plans.find(function (p) { return p.planId === a.planId; }) || {};
      var category = state.accountCategories.find(function (c) { return c.categoryId === a.categoryId; }) || {};
      var payouts = state.payouts.filter(function (p) { return p.accountId === a.accountId; });
      return Object.assign({}, a, { plan: plan, category: category, payouts: payouts });
    });
  }

  // Admin action: moves an account through its category's phase sequence.
  // Generic across however many phases a category defines — no hardcoded
  // "phase 1 / phase 2".
  function updateAccountStatus(state, accountId, status) {
    var account = state.accounts.find(function (a) { return a.accountId === accountId; });
    if (!account) return { error: "Account not found" };
    var plan = state.plans.find(function (p) { return p.planId === account.planId; }) || {};
    var category = state.accountCategories.find(function (c) { return c.categoryId === account.categoryId; }) || { phaseCount: 2 };

    account.status = status;
    account.updatedAt = nowIso();

    if (status === "passed") {
      var currentPhase = parseInt(account.phase, 10) || 0;
      if (currentPhase < category.phaseCount) {
        var newAccId = genId("acc");
        state.accounts.push({
          accountId: newAccId, orderId: account.orderId, telegramId: account.telegramId,
          planId: account.planId, categoryId: account.categoryId, phase: currentPhase + 1,
          status: "awaiting_credentials", createdAt: nowIso(), updatedAt: nowIso()
        });
        notify("accountPassed", { telegramId: account.telegramId, funded: false });
      } else {
        account.status = "funded";
        account.phase = "funded";
        notify("accountPassed", { telegramId: account.telegramId, funded: true });
      }
    } else if (status === "breached") {
      notify("accountBreached", { telegramId: account.telegramId });
    } else if (status === "blown") {
      var refundPts = 0;
      if (state.settings.blownRefundEnabled) {
        refundPts = Math.round((plan.price || 0) * (state.settings.blownRefundPct || 35) / 100);
        if (refundPts > 0) {
          state.points.push({ entryId: genId("pt"), telegramId: account.telegramId, type: "earn", amount: refundPts, description: "Blown account consolation refund", refId: accountId, createdAt: nowIso() });
        }
      }
      notify("accountBlown", { telegramId: account.telegramId, refundPts: refundPts });
    }
    return { account: account };
  }

  // ---------- MT5 pool (admin) ----------
  // entries: [{mt5Login, mt5Password, mt5Server, categoryId, accountSize}]
  function addMt5PoolEntries(privateState, entries) {
    entries.forEach(function (e) {
      privateState.mt5Pool.push(Object.assign({ poolId: genId("pool"), status: "available", assignedAccountId: "", uploadedAt: nowIso() }, e));
    });
    return privateState;
  }

  function poolAvailability(privateState) {
    var counts = {};
    privateState.mt5Pool.filter(function (m) { return m.status === "available"; }).forEach(function (m) {
      var key = m.categoryId + "_" + m.accountSize;
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }

  // ---------- payouts ----------
  // Trader-initiated. No money moves here — just records the request.
  function requestPayout(state, telegramId, accountId, amount, username) {
    var account = state.accounts.find(function (a) { return a.accountId === accountId && a.telegramId === telegramId; });
    if (!account) return { error: "Account not found" };
    if (account.status !== "funded") return { error: "Account not eligible for payout" };
    var existing = state.payouts.filter(function (p) { return p.accountId === accountId; });
    if (existing.some(function (p) { return p.status === "requested"; })) return { error: "A payout is already pending for this account" };
    var approvedCount = existing.filter(function (p) { return p.status === "paid" || p.status === "approved" || p.status === "sending"; }).length;
    var splitPct = approvedCount === 0 ? state.settings.payoutSplit1 || 80 : state.settings.payoutSplitN || 70;
    var payout = {
      payoutId: genId("pay"), accountId: accountId, telegramId: telegramId, amount: amount,
      splitPct: splitPct, status: "requested", createdAt: nowIso(), updatedAt: nowIso()
    };
    state.payouts.push(payout);
    notify("payoutRequested", { telegramId: telegramId, username: username, amount: amount });
    return { payout: payout };
  }

  // Admin: metadata-only, no money movement. This is the reviewed
  // checkpoint before anything irreversible happens.
  function approvePayout(state, payoutId) {
    var payout = state.payouts.find(function (p) { return p.payoutId === payoutId; });
    if (!payout) return { error: "Payout not found" };
    payout.status = "approved";
    payout.updatedAt = nowIso();
    notify("payoutApproved", { telegramId: payout.telegramId, amount: payout.amount });
    return { payout: payout };
  }

  function rejectPayout(state, payoutId) {
    var payout = state.payouts.find(function (p) { return p.payoutId === payoutId; });
    if (!payout) return { error: "Payout not found" };
    payout.status = "rejected";
    payout.updatedAt = nowIso();
    return { payout: payout };
  }

  // Admin: the actual "send" button. This calls flutterwave.gs, which is
  // the only place that talks to the Transfers API — engine.js never
  // touches the Flutterwave secret key.
  function sendPayout(payoutId) {
    return flw("disbursePayout", { payoutId: payoutId });
  }

  function savePayoutBank(privateState, telegramId, bankName, bankCode, accountNumber, accountName) {
    privateState.payoutBanks.push({ telegramId: telegramId, bankName: bankName, bankCode: bankCode, accountNumber: accountNumber, accountName: accountName, updatedAt: nowIso() });
    return privateState;
  }

  function resolveAccountName(accountNumber, bankCode) {
    return flw("resolveAccountName", { accountNumber: accountNumber, bankCode: bankCode });
  }

  // ---------- points / referrals / discount shop ----------
  function getPointsBalance(state, telegramId) {
    return state.points.filter(function (e) { return e.telegramId === telegramId; })
      .reduce(function (s, e) { return s + (e.amount || 0); }, 0);
  }

  function redeemPoints(state, telegramId, planId, pointsRequested) {
    var plan = state.plans.find(function (p) { return p.planId === planId; });
    if (!plan) return { error: "Plan not found" };
    var rate = state.settings.pointsPerDollar || 100;
    var balance = getPointsBalance(state, telegramId);
    var pointsForFullPrice = Math.ceil(plan.price * rate);
    var requested = pointsRequested !== undefined ? Math.max(0, Math.floor(pointsRequested)) : balance;
    var pointsToSpend = Math.min(requested, balance, pointsForFullPrice);
    if (pointsToSpend <= 0) return { error: "Insufficient points" };
    var dollarOff = Math.round((pointsToSpend / rate) * 100) / 100;
    var code = "REDEEM" + Math.random().toString(36).substr(2, 8).toUpperCase();
    var codeId = genId("disc");
    state.discounts.push({ codeId: codeId, code: code, discountType: "fixed", discountValue: dollarOff, planId: planId, telegramId: telegramId, maxUses: 1, usedCount: 0, active: true, createdAt: nowIso() });
    state.points.push({ entryId: genId("pt"), telegramId: telegramId, type: "spend", amount: -pointsToSpend, description: "Redeemed " + pointsToSpend + " points for $" + dollarOff + " off " + plan.name, refId: codeId, createdAt: nowIso() });
    return { code: code, discountAmount: dollarOff, pointsSpent: pointsToSpend };
  }

  // ---------- support ----------
  function createThread(state, telegramId, subject, body) {
    var threadId = genId("thr");
    state.support.push({ threadId: threadId, telegramId: telegramId, subject: subject, status: "open", createdAt: nowIso(), updatedAt: nowIso() });
    state.messages.push({ messageId: genId("msg"), threadId: threadId, senderRole: "trader", senderTelegramId: telegramId, body: body, createdAt: nowIso() });
    return { threadId: threadId };
  }

  function replyThread(state, threadId, senderRole, senderTelegramId, body) {
    var thread = state.support.find(function (t) { return t.threadId === threadId; });
    if (!thread) return { error: "Thread not found" };
    state.messages.push({ messageId: genId("msg"), threadId: threadId, senderRole: senderRole, senderTelegramId: senderTelegramId, body: body, createdAt: nowIso() });
    thread.updatedAt = nowIso();
    return { ok: true };
  }

  // ---------- plans / categories (admin) ----------
  function createCategory(state, name, phaseCount) {
    var category = { categoryId: genId("cat"), name: name, phaseCount: phaseCount, scaleUp: false, createdAt: nowIso() };
    state.accountCategories.push(category);
    return { category: category };
  }

  function createPlan(state, fields) {
    var plan = Object.assign({ planId: genId("plan"), active: true, createdAt: nowIso() }, fields);
    state.plans.push(plan);
    return { plan: plan };
  }

  function togglePlan(state, planId) {
    var plan = state.plans.find(function (p) { return p.planId === planId; });
    if (!plan) return { error: "Plan not found" };
    plan.active = !plan.active;
    return { plan: plan };
  }

  function createDiscount(state, fields) {
    var discount = Object.assign({ codeId: genId("disc"), usedCount: 0, active: true, createdAt: nowIso() }, fields);
    state.discounts.push(discount);
    return { discount: discount };
  }

  function toggleDiscount(state, codeId) {
    var code = state.discounts.find(function (c) { return c.codeId === codeId; });
    if (!code) return { error: "Code not found" };
    code.active = !code.active;
    return { discount: code };
  }

  // ---------- admin stats ----------
  function adminStats(state) {
    return {
      totalUsers: state.users.length,
      totalOrders: state.orders.length,
      pendingOrders: state.orders.filter(function (o) { return o.status === "awaiting_payment"; }).length,
      activeAccounts: state.accounts.filter(function (a) { return a.status === "active"; }).length,
      fundedAccounts: state.accounts.filter(function (a) { return a.status === "funded"; }).length,
      pendingPayouts: state.payouts.filter(function (p) { return p.status === "requested"; }).length,
      openThreads: state.support.filter(function (t) { return t.status === "open"; }).length
    };
  }

  return {
    loadPublic: loadPublic, savePublic: savePublic, loadPrivate: loadPrivate, savePrivate: savePrivate,
    getTelegramUser: getTelegramUser, initUser: initUser,
    applyDiscountToPrice: applyDiscountToPrice,
    createOrder: createOrder, getUserOrders: getUserOrders,
    getUserAccounts: getUserAccounts, updateAccountStatus: updateAccountStatus,
    addMt5PoolEntries: addMt5PoolEntries, poolAvailability: poolAvailability,
    requestPayout: requestPayout, approvePayout: approvePayout, rejectPayout: rejectPayout, sendPayout: sendPayout,
    savePayoutBank: savePayoutBank, resolveAccountName: resolveAccountName,
    getPointsBalance: getPointsBalance, redeemPoints: redeemPoints,
    createThread: createThread, replyThread: replyThread,
    createCategory: createCategory, createPlan: createPlan, togglePlan: togglePlan,
    createDiscount: createDiscount, toggleDiscount: toggleDiscount,
    adminStats: adminStats,
    flw: flw, notify: notify, genId: genId, nowIso: nowIso
  };
})();
