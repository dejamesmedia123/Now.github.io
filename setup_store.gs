/**
 * SETUP — store.gs project
 * Fill in CONFIG below, then select setupProperties in the function
 * dropdown at the top of the editor and click Run (once).
 * Delete this file afterward, or leave it — it does nothing until run again.
 */

const CONFIG = {
  // Must exactly match PRIVATE_KEY in the flutterwave.gs project.
  // Invent a long random string, e.g. run:
  //   Utilities.getUuid() + Utilities.getUuid()
  // in a scratch function once and paste the result here.
  PRIVATE_KEY: 'Rejudo123'
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
