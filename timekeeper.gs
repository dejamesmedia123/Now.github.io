// ===== TIMEKEEPER — Optimistic Versioning Library =====
// A SEPARATE Apps Script project. It knows nothing about "Now Funded" data —
// it just hands out and checks version numbers for a named file. That
// separation is deliberate: it can't corrupt or interfere with nnnn.json or
// any other project's logic, because it never reads or writes that file.
//
// It keeps its own tiny companion file "<fileName>.ver" in Drive root,
// containing nothing but an integer.
//
// ---- HOW TO WIRE THIS UP ----
// 1. Create a new Apps Script project (script.google.com/create), paste this
//    file in as Code.gs (or any name), save it.
// 2. Project Settings (gear icon) -> copy the "Script ID".
// 3. Open the Code-1.gs project (the Now Funded backend). In the editor,
//    click "Libraries" (+ icon) in the left sidebar, paste the Script ID,
//    click "Look up", pick the latest version, set the identifier to
//    "Timekeeper", click "Add".
// 4. That's it — Code-1.gs can now call Timekeeper.getVersion(...) and
//    Timekeeper.checkAndBump(...). No deployment/web app needed for a
//    library; Code-1.gs runs it in-process.
//
// ---- USAGE CONTRACT ----
// getVersion(fileName) -> current version (0 if never written)
// checkAndBump(fileName, clientVersion):
//   - clientVersion === null/undefined -> skips the check, unconditionally
//     bumps and returns the new version (use this for callers that don't
//     care about conflicts).
//   - clientVersion matches current -> bumps, returns { ok:true, newVersion }
//   - clientVersion does NOT match  -> returns { ok:false, currentVersion }
//     and does NOT bump. Caller must not write the data file in this case.

function getVersion(fileName) {
  var f = findVersionFile_(fileName);
  if (!f) return 0;
  var n = parseInt(f.getBlob().getDataAsString(), 10);
  return isNaN(n) ? 0 : n;
}

function checkAndBump(fileName, clientVersion) {
  // A short-lived lock around just this check+increment (not around any
  // read/write of the actual data file). This is what makes the version
  // bump itself atomic even if two saves land in the same instant — it's
  // a few milliseconds of contention on a tiny file, not the "wait for the
  // whole record" locking scheme this whole approach is meant to avoid.
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var current = getVersion(fileName);
    var checking = (clientVersion !== null && clientVersion !== undefined);
    if (checking && clientVersion !== current) {
      return { ok: false, currentVersion: current };
    }
    var next = current + 1;
    writeVersion_(fileName, next);
    return { ok: true, newVersion: next };
  } finally {
    lock.releaseLock();
  }
}

function findVersionFile_(fileName) {
  var files = DriveApp.getFilesByName(fileName + '.ver');
  return files.hasNext() ? files.next() : null;
}

function writeVersion_(fileName, version) {
  var f = findVersionFile_(fileName);
  if (!f) {
    DriveApp.createFile(fileName + '.ver', String(version), MimeType.PLAIN_TEXT);
  } else {
    f.setContent(String(version));
  }
}
