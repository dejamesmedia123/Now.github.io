// ===== NOW FUNDED — EMAIL PROJECT (standalone) =====
// This is its OWN Apps Script project with its OWN web app deployment/URL —
// separate from the Code.gs data-store project. It shares nothing with it,
// so it needs its own doPost and its own jsonOut_ helper.
//
// The frontend is in charge of *what* gets emailed and *when* — it builds the
// subject/body and decides which events warrant a send. This project only
// knows how to hand a message to MailApp. No templates, no event logic here.
//
// Deploy this as its own web app ("Execute as: me", "Who has access: Anyone"),
// then paste the resulting /exec URL into EMAIL_WEBAPP_URL in App.html and
// admin.html.
//
// Call pattern (text/plain avoids a CORS preflight, same trick as the state save):
//   fetch(EMAIL_WEBAPP_URL, {
//     method: 'POST',
//     headers: { 'Content-Type': 'text/plain;charset=utf-8' },
//     body: JSON.stringify({ to: 'user@example.com', subject: '...', body: '...' })
//   });

function doPost(e) {
  try {
    var payload = (e && e.postData) ? JSON.parse(e.postData.contents) : {};

    if (!payload.to || !payload.subject || !payload.body) {
      return jsonOut_(JSON.stringify({ ok: false, error: 'Missing required field: to, subject, or body' }));
    }

    var options = {};
    if (payload.htmlBody) options.htmlBody = payload.htmlBody;
    if (payload.replyTo) options.replyTo = payload.replyTo;
    if (payload.name) options.name = payload.name; // "from" display name

    MailApp.sendEmail(payload.to, payload.subject, payload.body, options);

    return jsonOut_(JSON.stringify({ ok: true }));
  } catch (err) {
    // Swallow quota errors etc. so a failed email never blocks the frontend's own flow —
    // the frontend fires-and-forgets this call.
    return jsonOut_(JSON.stringify({ ok: false, error: String(err) }));
  }
}

function jsonOut_(text) {
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}
