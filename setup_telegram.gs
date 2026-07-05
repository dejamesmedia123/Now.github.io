/**
 * SETUP — telegram.gs project
 * Fill in CONFIG below, then select setupProperties in the function
 * dropdown at the top of the editor and click Run (once).
 * Delete this file afterward, or leave it — it does nothing until run again.
 */

const CONFIG = {
  // From @BotFather when you created the bot.
  BOT_TOKEN: '8563788754:AAGNrTLKaaL_V5L36rkJ4gjiWHavSv6_sf0',

  // The Telegram chat ID that should receive admin notifications.
  // Easiest way to find it: message your bot once, then hit
  //   https://api.telegram.org/bot<BOT_TOKEN>/getUpdates
  // in a browser and read "chat":{"id": ...} from the response.
  ADMIN_CHAT_ID: '8978029899',

  // The hosted URL of app.html (your static host, e.g. GitHub Pages).
  APP_URL: 'https://dejamesmedia123.github.io/Now.github.io/'
};

function setupProperties() {
  const props = PropertiesService.getScriptProperties();
  const entries = Object.entries(CONFIG);
  const unfilled = entries.filter(([k, v]) => !v || v.startsWith('PASTE_'));

  if (unfilled.length) {
    Logger.log('Not set — still has placeholder values: ' + unfilled.map(([k]) => k).join(', '));
    Logger.log('Fill these in in CONFIG above before running again.');
    return;
  }

  props.setProperties(CONFIG);
  Logger.log('Script properties set: ' + entries.map(([k]) => k).join(', '));
  Logger.log('Next: deploy this project as a Web App, then run setWebhook() from telegram.gs with the resulting URL.');
}

function checkProperties() {
  const props = PropertiesService.getScriptProperties().getProperties();
  const required = Object.keys(CONFIG);
  const missing = required.filter(k => !props[k]);
  if (missing.length) {
    Logger.log('MISSING: ' + missing.join(', '));
  } else {
    Logger.log('All required properties are set: ' + required.join(', '));
  }
}
