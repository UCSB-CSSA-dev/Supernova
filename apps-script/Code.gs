var ALLOWED_DOMAIN = "ucsb.edu";
// Always an admin, and the only account that can remove trusted admins. Any admin can add one.
var OWNER_EMAIL = "jamesguo@ucsb.edu";
var REGISTRATION_HEADERS = ["registered_at", "email", "name"];
var RESULT_HEADERS = ["voted_at", "name", "email", "singer_name", "song_name"];
var LOTTERY_HEADERS = ["drawn_at", "round", "email", "name"];
var LOTTERY_SHEET = "Lottery";
// Singing order lives on its own tab of the Variables spreadsheet; the shuffle is the ORDER_SHUFFLE variable.
var ORDER_SIZE = 20;
var ORDER_SHEET = "Singing order";
var ORDER_HEADERS = ["number", "name", "email", "claimed_at"];
var ORDER_NAME_MAX = 40;
// Runtime settings (CHECKIN_OPENS_AT, VOTING_CLOSES_AT, ADMIN_EMAILS, ...), one row per variable.
var VARIABLE_HEADERS = ["variable_name", "value", "created_at"];
// Hand edits to the Variables sheet take effect within this long; dashboard changes apply immediately.
var VARIABLES_CACHE_SECONDS = 5;
var SESSION_MS = 12 * 60 * 60 * 1000;
var WINDOWS = { checkin: "CHECKIN", voting: "VOTING" };
var REQUIRED_PROPS = [
  "REGISTRATIONS_SPREADSHEET_ID",
  "SINGERS_SPREADSHEET_ID",
  "RESULTS_SPREADSHEET_ID",
  "VARIABLES_SPREADSHEET_ID",
  "GOOGLE_CLIENT_ID",
];

function doGet(e) {
  return json_(handle_((e && e.parameter) || {}));
}

function doPost(e) {
  var data = {};
  try {
    data = JSON.parse((e.postData && e.postData.contents) || "{}");
  } catch (error) {
    return json_({ ok: false, error: "The request was not valid JSON." });
  }
  return json_(handle_(data));
}

function json_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

function handle_(data) {
  try {
    var action = String(data.action || "");
    if (action === "results") return results_();
    if (action === "signIn") return signIn_(String(data.credential || ""));
    if (action === "me") return me_(requireUser_(data.session));
    if (action === "register") return register_(requireUser_(data.session));
    if (action === "voteState") return voteState_(requireUser_(data.session));
    if (action === "vote") return castVote_(requireUser_(data.session), String(data.singerName || ""), String(data.songName || ""));
    if (action === "orderState") return orderState_(requireUser_(data.session));
    if (action === "claimOrder") return claimOrder_(requireUser_(data.session), String(data.name || ""));
    var admin = requireAdmin_(data.session);
    if (action === "adminCheck") return { ok: true, email: admin.email, isOwner: isOwner_(admin.email) };
    if (action === "status") return status_(admin);
    if (action === "addAdmin") return addAdmin_(admin, String(data.email || ""));
    if (action === "removeAdmin") return removeAdmin_(admin, String(data.email || ""));
    if (action === "setWindow") return setWindow_(String(data.name || ""), data.opensAt, data.closesAt);
    if (action === "checkinStatus") return checkinStatus_();
    if (action === "lotteryState") return lotteryState_();
    if (action === "lotteryDraw") return lotteryDraw_();
    if (action === "orderAdmin") return orderAdmin_();
    if (action === "orderReset") return orderReset_();
    return { ok: false, error: "Unknown action." };
  } catch (error) {
    return {
      ok: false,
      error: error && error.message ? error.message : "Something went wrong.",
      unauthenticated: Boolean(error && error.unauthenticated),
      signedOut: Boolean(error && error.signedOut),
    };
  }
}

// ---------- Admin ----------

function isOwner_(email) {
  return email === OWNER_EMAIL;
}

function trustedAdmins_(fresh) {
  var raw = readVariables_(fresh).ADMIN_EMAILS || "";
  return raw.split(",").map(function (email) { return email.trim().toLowerCase(); }).filter(function (email) {
    return email && email !== OWNER_EMAIL;
  });
}

function saveTrustedAdmins_(emails) {
  setVariables_({ ADMIN_EMAILS: emails.join(",") });
}

// Checked on every request, so removing someone takes effect immediately.
function requireAdmin_(session) {
  var user = requireUser_(session);
  if (!isOwner_(user.email) && trustedAdmins_().indexOf(user.email) === -1) {
    var error = new Error(user.email + " is not an admin.");
    error.unauthenticated = true;
    throw error;
  }
  return user;
}

function requireOwner_(admin) {
  if (!isOwner_(admin.email)) throw new Error("Only " + OWNER_EMAIL + " can remove admins.");
}

function adminList_() {
  return { owner: OWNER_EMAIL, trusted: trustedAdmins_() };
}

// Any admin can add admins; only the owner can remove them.
function addAdmin_(admin, email) {
  email = email.trim().toLowerCase();
  if (!isAllowedEmail_(email)) throw new Error("Admins must use a @" + ALLOWED_DOMAIN + " address.");
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var trusted = trustedAdmins_(true);
    if (email !== OWNER_EMAIL && trusted.indexOf(email) === -1) saveTrustedAdmins_(trusted.concat([email]));
    return { ok: true, admins: adminList_() };
  } finally {
    lock.releaseLock();
  }
}

function removeAdmin_(admin, email) {
  requireOwner_(admin);
  email = email.trim().toLowerCase();
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    saveTrustedAdmins_(trustedAdmins_(true).filter(function (item) { return item !== email; }));
    return { ok: true, admins: adminList_() };
  } finally {
    lock.releaseLock();
  }
}

// ---------- Properties and signing ----------

function missingProps_() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var missing = [];
  REQUIRED_PROPS.forEach(function (name) {
    if (!props[name]) missing.push(name);
  });
  return missing;
}

function prop_(name) {
  var value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) throw new Error("Missing Apps Script property " + name + ".");
  return String(value).trim();
}

// Deleting SESSION_SECRET signs everyone out.
function secret_() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty("SESSION_SECRET");
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty("SESSION_SECRET", secret);
  }
  return secret;
}

function hmac_(value) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(value, secret_())).replace(/=+$/, "");
}

function sign_(payload) {
  var body = Utilities.base64EncodeWebSafe(JSON.stringify(payload), Utilities.Charset.UTF_8).replace(/=+$/, "");
  return body + "." + hmac_(body);
}

function verify_(token, type) {
  var parts = String(token || "").split(".");
  if (parts.length !== 2 || !parts[0] || hmac_(parts[0]) !== parts[1]) return null;
  try {
    var padded = parts[0] + "===".slice((parts[0].length + 3) % 4);
    var payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(padded)).getDataAsString("UTF-8"));
    if (!payload || payload.t !== type || !(Number(payload.x) > Date.now())) return null;
    return payload;
  } catch (error) {
    return null;
  }
}

// ---------- Google sign-in ----------

function isAllowedEmail_(email) {
  return /^[^\s@]+@ucsb\.edu$/.test(String(email || ""));
}

function signIn_(credential) {
  if (!credential) throw new Error("Google did not return a sign-in credential.");
  var response = UrlFetchApp.fetch(
    "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential),
    { muteHttpExceptions: true }
  );
  if (response.getResponseCode() !== 200) throw new Error("Google could not verify this sign-in. Try again.");
  var claims = JSON.parse(response.getContentText());
  if (claims.aud !== prop_("GOOGLE_CLIENT_ID")) throw new Error("This sign-in was issued for a different app.");
  if (claims.iss !== "accounts.google.com" && claims.iss !== "https://accounts.google.com") {
    throw new Error("This sign-in did not come from Google.");
  }
  var email = String(claims.email || "").trim().toLowerCase();
  if (String(claims.email_verified) !== "true") throw new Error("Your Google email address is not verified.");
  // hd is only set for Google Workspace accounts, so a personal Google account registered with a ucsb.edu address is rejected.
  if (!isAllowedEmail_(email) || claims.hd !== ALLOWED_DOMAIN) {
    throw new Error("Sign in with your @" + ALLOWED_DOMAIN + " Google account." + (email ? " " + email + " can't be used." : ""));
  }
  var name = String(claims.name || "").trim() || email.split("@")[0];
  var expiresAt = Date.now() + SESSION_MS;
  return {
    ok: true,
    session: sign_({ t: "session", e: email, n: name, x: expiresAt }),
    email: email,
    name: name,
    expiresAt: expiresAt,
  };
}

function requireUser_(token) {
  var payload = verify_(token, "session");
  if (!payload || !isAllowedEmail_(payload.e)) {
    var error = new Error("Your sign-in expired. Sign in again.");
    error.signedOut = true;
    throw error;
  }
  return { email: String(payload.e), name: String(payload.n || "") };
}

// ---------- Check-in and voting windows ----------

// A time typed into the Variables sheet by hand that can't be read is treated as unset.
function storedTime_(value) {
  if (!value) return "";
  var date = new Date(value);
  return isNaN(date.getTime()) ? "" : date.toISOString();
}

function windowState_(name) {
  var prefix = WINDOWS[name];
  var variables = readVariables_();
  var opensAt = storedTime_(variables[prefix + "_OPENS_AT"]);
  var closesAt = storedTime_(variables[prefix + "_CLOSES_AT"]);
  var now = new Date().toISOString();
  var phase = "unscheduled";
  if (opensAt) {
    if (now < opensAt) phase = "scheduled";
    else if (closesAt && now >= closesAt) phase = "closed";
    else phase = "open";
  }
  return { opensAt: opensAt || null, closesAt: closesAt || null, phase: phase };
}

function isoOrEmpty_(value, label) {
  if (value === null || value === undefined || String(value).trim() === "") return "";
  var date = new Date(String(value));
  if (isNaN(date.getTime())) throw new Error("The " + label + " time is not a valid date.");
  return date.toISOString();
}

function setWindow_(name, opensAt, closesAt) {
  var prefix = WINDOWS[name];
  if (!prefix) throw new Error("Unknown window " + name + ".");
  var opens = isoOrEmpty_(opensAt, "opening");
  var closes = isoOrEmpty_(closesAt, "closing");
  if (closes && !opens) throw new Error("Set an opening time before a closing time.");
  if (opens && closes && closes <= opens) throw new Error("The closing time must be after the opening time.");
  var updates = {};
  updates[prefix + "_OPENS_AT"] = opens;
  updates[prefix + "_CLOSES_AT"] = closes;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    setVariables_(updates);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, window: windowState_(name) };
}

function checkinStatus_() {
  return { ok: true, window: windowState_("checkin"), registeredCount: readRegistrations_().length };
}

// ---------- Spreadsheets ----------

function spreadsheet_(idProp, label) {
  try {
    return SpreadsheetApp.openById(prop_(idProp));
  } catch (error) {
    throw new Error(label + " spreadsheet could not be opened. Check the ID and that this Google account can access it.");
  }
}

function sheet_(idProp, label) {
  return spreadsheet_(idProp, label).getSheets()[0];
}

function headerMap_(sheet) {
  var width = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, width).getDisplayValues()[0];
  var map = {};
  headers.forEach(function (header, index) {
    var key = String(header || "").trim().toLowerCase();
    if (key) map[key] = index + 1;
  });
  return map;
}

// Plain text format stops Sheets from turning timestamps into dates.
function ensureHeaders_(sheet, headers, label) {
  if (sheet.getLastRow() > 0 && String(sheet.getRange(1, 1).getDisplayValue() || "").trim()) {
    var map = headerMap_(sheet);
    var missing = headers.filter(function (header) { return !map[header]; });
    if (missing.length) {
      throw new Error("The " + label + " sheet is missing " + missing.join(", ") + ". The first row should be: " + headers.join(", ") + ".");
    }
    return map;
  }
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, sheet.getMaxRows(), headers.length).setNumberFormat("@");
  return headerMap_(sheet);
}

function cell_(row, column) {
  if (!column) return "";
  return String(row[column - 1] || "").trim();
}

function dataRows_(sheet) {
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getDisplayValues();
}

// appendRow is atomic, so concurrent requests never overwrite each other's rows.
function appendRecord_(sheet, map, record) {
  var row = new Array(sheet.getLastColumn()).fill("");
  Object.keys(record).forEach(function (key) { row[map[key] - 1] = record[key]; });
  sheet.appendRow(row);
}

function variablesSheet_() {
  return sheet_("VARIABLES_SPREADSHEET_ID", "Variables");
}

// Read on nearly every request, so it's cached; pass fresh when about to write back.
function readVariables_(fresh) {
  var cache = CacheService.getScriptCache();
  var cached = fresh ? null : cache.get("variables");
  if (cached) return JSON.parse(cached);
  var sheet = variablesSheet_();
  var map = ensureHeaders_(sheet, VARIABLE_HEADERS, "Variables");
  var values = {};
  dataRows_(sheet).forEach(function (row) {
    var name = cell_(row, map.variable_name).toUpperCase();
    if (name && !Object.prototype.hasOwnProperty.call(values, name)) values[name] = cell_(row, map.value);
  });
  cache.put("variables", JSON.stringify(values), VARIABLES_CACHE_SECONDS);
  return values;
}

// Updates each variable's row in place (or adds one); "" clears a value. Callers must hold the script lock.
function setVariables_(updates) {
  var sheet = variablesSheet_();
  var map = ensureHeaders_(sheet, VARIABLE_HEADERS, "Variables");
  var names = dataRows_(sheet).map(function (row) { return cell_(row, map.variable_name).toUpperCase(); });
  var createdAt = new Date().toISOString();
  Object.keys(updates).forEach(function (name) {
    var rowNumber = names.indexOf(name) + 2;
    if (rowNumber === 1) rowNumber = sheet.getLastRow() + 1;
    var record = { variable_name: name, value: updates[name], created_at: createdAt };
    Object.keys(record).forEach(function (key) {
      // Plain text keeps Sheets from turning ISO timestamps into dates.
      sheet.getRange(rowNumber, map[key]).setNumberFormat("@").setValue(record[key]);
    });
  });
  CacheService.getScriptCache().remove("variables");
}

function registrationsSheet_() {
  return sheet_("REGISTRATIONS_SPREADSHEET_ID", "Registrations");
}

// Duplicate rows from simultaneous check-ins are ignored; the first row for an email wins.
function readRegistrations_() {
  var sheet = registrationsSheet_();
  var map = ensureHeaders_(sheet, REGISTRATION_HEADERS, "Registrations");
  var seen = {};
  var rows = [];
  dataRows_(sheet).forEach(function (row) {
    var email = cell_(row, map.email).toLowerCase();
    if (!email || seen[email]) return;
    seen[email] = true;
    rows.push({ registeredAt: cell_(row, map.registered_at), email: email, name: cell_(row, map.name) });
  });
  return rows;
}

function findRegistration_(email) {
  return readRegistrations_().filter(function (row) { return row.email === email; })[0] || null;
}

function readSingers_() {
  var sheet = sheet_("SINGERS_SPREADSHEET_ID", "Singers");
  if (sheet.getLastRow() < 1) return [];
  var map = headerMap_(sheet);
  if (!map.singer_name || !map.song_name) {
    throw new Error("The singer spreadsheet needs singer_name and song_name columns in the first row.");
  }
  var seen = {};
  var singers = [];
  dataRows_(sheet).forEach(function (row) {
    var singerName = cell_(row, map.singer_name);
    var songName = cell_(row, map.song_name);
    if (!singerName && !songName) return;
    if (!singerName || !songName) throw new Error("Each singer row needs both singer_name and song_name.");
    var key = singerName + "\n" + songName;
    if (seen[key]) return;
    seen[key] = true;
    singers.push({ singerName: singerName, songName: songName });
  });
  return singers;
}

function resultsSheet_() {
  return sheet_("RESULTS_SPREADSHEET_ID", "Results");
}

// Only the first ballot from each email counts.
function readBallots_() {
  var sheet = resultsSheet_();
  var map = ensureHeaders_(sheet, RESULT_HEADERS, "Results");
  var seen = {};
  var ballots = [];
  dataRows_(sheet).forEach(function (row) {
    var email = cell_(row, map.email).toLowerCase();
    if (!email || seen[email]) return;
    seen[email] = true;
    ballots.push({
      votedAt: cell_(row, map.voted_at),
      name: cell_(row, map.name),
      email: email,
      singerName: cell_(row, map.singer_name),
      songName: cell_(row, map.song_name),
    });
  });
  return ballots;
}

function findBallot_(email) {
  return readBallots_().filter(function (ballot) { return ballot.email === email; })[0] || null;
}

function lotterySheet_() {
  var spreadsheet = spreadsheet_("REGISTRATIONS_SPREADSHEET_ID", "Registrations");
  var sheet = spreadsheet.getSheetByName(LOTTERY_SHEET) || spreadsheet.insertSheet(LOTTERY_SHEET, spreadsheet.getSheets().length);
  return sheet;
}

function readDraws_() {
  var sheet = lotterySheet_();
  var map = ensureHeaders_(sheet, LOTTERY_HEADERS, "Lottery");
  var draws = [];
  dataRows_(sheet).forEach(function (row) {
    var email = cell_(row, map.email).toLowerCase();
    if (!email) return;
    draws.push({
      round: Number(cell_(row, map.round)) || draws.length + 1,
      drawnAt: cell_(row, map.drawn_at),
      email: email,
      name: cell_(row, map.name),
    });
  });
  return draws;
}

// ---------- Audience actions ----------

function me_(user) {
  var registration = findRegistration_(user.email);
  return {
    ok: true,
    email: user.email,
    name: user.name,
    registered: Boolean(registration),
    registeredAt: registration ? registration.registeredAt : null,
    checkin: windowState_("checkin"),
    voting: windowState_("voting"),
  };
}

// Anyone signed in with a @ucsb.edu account who opens the check-in page while check-in is open is checked in.
function register_(user) {
  var existing = findRegistration_(user.email);
  if (existing) {
    return { ok: true, status: "registered", registeredAt: existing.registeredAt, already: true, voting: windowState_("voting") };
  }
  var win = windowState_("checkin");
  if (win.phase !== "open") return { ok: true, status: "closed", window: win };
  var sheet = registrationsSheet_();
  var map = ensureHeaders_(sheet, REGISTRATION_HEADERS, "Registrations");
  var registeredAt = new Date().toISOString();
  appendRecord_(sheet, map, { registered_at: registeredAt, email: user.email, name: user.name });
  return { ok: true, status: "registered", registeredAt: registeredAt, already: false, voting: windowState_("voting") };
}

// Once voting is scheduled, phones get the ballot early and open it on their own at opensAt,
// so nobody has to ask the script at the moment voting opens. castVote_ still enforces the window.
function notOpen_(win) {
  return {
    ok: true,
    status: "notOpen",
    window: win,
    serverTime: Date.now(),
    candidates: win.phase === "scheduled" ? readSingers_() : null,
  };
}

function voteState_(user) {
  if (!findRegistration_(user.email)) return { ok: true, status: "unregistered" };
  var ballot = findBallot_(user.email);
  if (ballot) return { ok: true, status: "used", singerName: ballot.singerName, songName: ballot.songName };
  var win = windowState_("voting");
  if (win.phase !== "open") return notOpen_(win);
  return { ok: true, status: "open", candidates: readSingers_() };
}

function castVote_(user, singerName, songName) {
  if (!findRegistration_(user.email)) return { ok: true, status: "unregistered" };
  var existing = findBallot_(user.email);
  if (existing) return { ok: true, status: "used", singerName: existing.singerName, songName: existing.songName };
  var win = windowState_("voting");
  if (win.phase !== "open") return notOpen_(win);
  var match = readSingers_().filter(function (singer) {
    return singer.singerName === singerName && singer.songName === songName;
  })[0];
  if (!match) return { ok: true, status: "unknownChoice" };
  var sheet = resultsSheet_();
  var map = ensureHeaders_(sheet, RESULT_HEADERS, "Results");
  appendRecord_(sheet, map, {
    voted_at: new Date().toISOString(),
    name: user.name,
    email: user.email,
    singer_name: singerName,
    song_name: songName,
  });
  CacheService.getScriptCache().remove("results");
  // If the same person voted from two devices at once, the earlier row is the one that counts.
  var counted = findBallot_(user.email);
  if (counted && (counted.singerName !== singerName || counted.songName !== songName)) {
    return { ok: true, status: "used", singerName: counted.singerName, songName: counted.songName };
  }
  return { ok: true, status: "voted", singerName: singerName, songName: songName };
}

// ---------- Public results ----------

function choiceKey_(choice) {
  return choice.singerName + "\n" + choice.songName;
}

function results_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get("results");
  if (cached) return JSON.parse(cached);
  var singers = readSingers_();
  var ballots = readBallots_();
  var counts = {};
  singers.forEach(function (singer) { counts[choiceKey_(singer)] = 0; });
  var counted = 0;
  ballots.forEach(function (ballot) {
    var key = choiceKey_(ballot);
    if (counts[key] === undefined) return;
    counts[key] += 1;
    counted += 1;
  });
  var ranked = singers.map(function (singer) {
    return { singerName: singer.singerName, songName: singer.songName, votes: counts[choiceKey_(singer)] || 0 };
  });
  ranked.sort(function (a, b) {
    return b.votes - a.votes || a.singerName.localeCompare(b.singerName) || a.songName.localeCompare(b.songName);
  });
  var place = 0;
  var payload = {
    ok: true,
    totalVotes: counted,
    ranked: ranked.map(function (choice, index) {
      if (index === 0 || choice.votes !== ranked[index - 1].votes) place = index + 1;
      return { place: place, singerName: choice.singerName, songName: choice.songName, votes: choice.votes };
    }),
    updatedAt: new Date().toISOString(),
    voting: windowState_("voting"),
  };
  cache.put("results", JSON.stringify(payload), 1);
  return payload;
}

// ---------- Lottery ----------

// Rejection sampling keeps every index equally likely.
function randomIndex_(n) {
  var limit = Math.floor(4294967296 / n) * n;
  while (true) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid());
    var value = (bytes[0] & 255) * 16777216 + ((bytes[1] & 255) << 16) + ((bytes[2] & 255) << 8) + (bytes[3] & 255);
    if (value < limit) return value % n;
  }
}

function lotteryPayload_(registrations, draws) {
  var drawn = {};
  draws.forEach(function (draw) { drawn[draw.email] = true; });
  var pool = registrations.filter(function (row) { return !drawn[row.email]; });
  return {
    ok: true,
    draws: draws,
    registered: registrations.length,
    eligible: pool.length,
    names: pool.slice(0, 200).map(function (row) { return row.name || row.email.split("@")[0]; }),
  };
}

function lotteryState_() {
  return lotteryPayload_(readRegistrations_(), readDraws_());
}

function lotteryDraw_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var registrations = readRegistrations_();
    var draws = readDraws_();
    var drawn = {};
    draws.forEach(function (draw) { drawn[draw.email] = true; });
    var pool = registrations.filter(function (row) { return !drawn[row.email]; });
    if (!pool.length) {
      throw new Error(registrations.length ? "Everyone who checked in has already been drawn." : "Nobody has checked in yet.");
    }
    var person = pool[randomIndex_(pool.length)];
    var round = draws.reduce(function (max, draw) { return Math.max(max, draw.round); }, 0) + 1;
    var winner = { round: round, drawnAt: new Date().toISOString(), email: person.email, name: person.name };
    var sheet = lotterySheet_();
    var map = ensureHeaders_(sheet, LOTTERY_HEADERS, "Lottery");
    appendRecord_(sheet, map, { drawn_at: winner.drawnAt, round: String(round), email: winner.email, name: winner.name });
    var payload = lotteryPayload_(registrations, draws.concat([winner]));
    payload.winner = winner;
    return payload;
  } finally {
    lock.releaseLock();
  }
}

// ---------- Singing order ----------

function orderSheet_() {
  var spreadsheet = spreadsheet_("VARIABLES_SPREADSHEET_ID", "Variables");
  return spreadsheet.getSheetByName(ORDER_SHEET) || spreadsheet.insertSheet(ORDER_SHEET, spreadsheet.getSheets().length);
}

// The first row for an email and for a number wins, so a hand edit can never give out a number twice.
function readOrder_() {
  var sheet = orderSheet_();
  var map = ensureHeaders_(sheet, ORDER_HEADERS, "Singing order");
  var byEmail = {};
  var byNumber = {};
  var entries = [];
  dataRows_(sheet).forEach(function (row) {
    var email = cell_(row, map.email).toLowerCase();
    var number = Number(cell_(row, map.number));
    if (!email || byEmail[email] || number % 1 !== 0 || number < 1 || number > ORDER_SIZE || byNumber[number]) return;
    var entry = { number: number, name: cell_(row, map.name), email: email, claimedAt: cell_(row, map.claimed_at) };
    byEmail[email] = entry;
    byNumber[number] = entry;
    entries.push(entry);
  });
  return entries;
}

function orderPayload_(user, entries) {
  var mine = entries.filter(function (entry) { return entry.email === user.email; })[0] || null;
  return {
    ok: true,
    size: ORDER_SIZE,
    mine: mine ? { number: mine.number, name: mine.name, claimedAt: mine.claimedAt } : null,
    lineup: entries
      .map(function (entry) { return { number: entry.number, name: entry.name }; })
      .sort(function (a, b) { return a.number - b.number; }),
    remaining: ORDER_SIZE - entries.length,
  };
}

function orderState_(user) {
  return orderPayload_(user, readOrder_());
}

function isOrderShuffle_(list) {
  if (list.length !== ORDER_SIZE) return false;
  var seen = {};
  return list.every(function (number) {
    if (number % 1 !== 0 || number < 1 || number > ORDER_SIZE || seen[number]) return false;
    seen[number] = true;
    return true;
  });
}

// Shuffled once, then kept. To start over, clear ORDER_SHUFFLE and the Singing order rows. Caller holds the script lock.
function orderShuffle_() {
  var stored = readVariables_(true).ORDER_SHUFFLE || "";
  var list = stored.split(",").map(function (item) { return Number(item.trim()); });
  if (isOrderShuffle_(list)) return list;
  list = [];
  for (var number = 1; number <= ORDER_SIZE; number++) list.push(number);
  for (var index = list.length - 1; index > 0; index--) {
    var swap = randomIndex_(index + 1);
    var held = list[index];
    list[index] = list[swap];
    list[swap] = held;
  }
  setVariables_({ ORDER_SHUFFLE: list.join(",") });
  return list;
}

// Each signed-in account gets one number; asking again returns the same one.
function claimOrder_(user, name) {
  name = name.replace(/\s+/g, " ").trim();
  if (!name) throw new Error("Enter your name.");
  if (name.length > ORDER_NAME_MAX) throw new Error("Keep your name to " + ORDER_NAME_MAX + " characters.");
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var entries = readOrder_();
    var payload;
    if (entries.some(function (entry) { return entry.email === user.email; })) {
      payload = orderPayload_(user, entries);
      payload.status = "already";
      return payload;
    }
    var taken = {};
    entries.forEach(function (entry) { taken[entry.number] = true; });
    var number = orderShuffle_().filter(function (item) { return !taken[item]; })[0];
    if (!number) {
      payload = orderPayload_(user, entries);
      payload.status = "full";
      return payload;
    }
    var entry = { number: number, name: name, email: user.email, claimedAt: new Date().toISOString() };
    var sheet = orderSheet_();
    var map = ensureHeaders_(sheet, ORDER_HEADERS, "Singing order");
    var row = new Array(sheet.getLastColumn()).fill("");
    row[map.number - 1] = String(entry.number);
    row[map.name - 1] = entry.name;
    row[map.email - 1] = entry.email;
    row[map.claimed_at - 1] = entry.claimedAt;
    // Plain text, so a name like "=SUM(...)" is stored as typed rather than run as a formula.
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setNumberFormat("@").setValues([row]);
    payload = orderPayload_(user, entries.concat([entry]));
    payload.status = "claimed";
    return payload;
  } finally {
    lock.releaseLock();
  }
}

function orderAdminPayload_(entries) {
  return {
    ok: true,
    size: ORDER_SIZE,
    entries: entries.slice().sort(function (a, b) { return a.number - b.number; }),
    remaining: ORDER_SIZE - entries.length,
  };
}

function orderAdmin_() {
  return orderAdminPayload_(readOrder_());
}

// Keeps the old claims: the tab is renamed rather than cleared, and the next claim starts a new tab and shuffle.
function orderReset_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var spreadsheet = spreadsheet_("VARIABLES_SPREADSHEET_ID", "Variables");
    var sheet = spreadsheet.getSheetByName(ORDER_SHEET);
    if (sheet && sheet.getLastRow() > 1) {
      var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
      sheet.setName(ORDER_SHEET + " (reset " + stamp + ")");
    }
    setVariables_({ ORDER_SHUFFLE: "" });
    return orderAdminPayload_(readOrder_());
  } finally {
    lock.releaseLock();
  }
}

// ---------- Admin status ----------

function sheetStatus_(label, idProp, read) {
  var id = "";
  try { id = prop_(idProp); } catch (ignored) { id = ""; }
  var url = id ? "https://docs.google.com/spreadsheets/d/" + id + "/edit" : "";
  try {
    var rows = read();
    return { status: { label: label, url: url, rows: rows.length, error: null }, rows: rows };
  } catch (error) {
    return { status: { label: label, url: url, rows: null, error: error.message }, rows: null };
  }
}

function orDefault_(read, fallback) {
  try { return read(); } catch (error) { return fallback; }
}

function status_(admin) {
  var problems = missingProps_();
  var account = "";
  try { account = Session.getEffectiveUser().getEmail(); } catch (error) { account = ""; }
  var unscheduled = { opensAt: null, closesAt: null, phase: "unscheduled" };
  var base = {
    ok: true,
    viewer: admin.email,
    isOwner: isOwner_(admin.email),
    admins: orDefault_(adminList_, { owner: OWNER_EMAIL, trusted: [] }),
    accountEmail: account,
    problems: problems,
    sheets: null,
    registeredCount: 0,
    singerCount: 0,
    voteCount: 0,
    drawCount: 0,
    recentRegistrations: [],
    checkin: orDefault_(function () { return windowState_("checkin"); }, unscheduled),
    voting: orDefault_(function () { return windowState_("voting"); }, unscheduled),
  };
  if (problems.length) return base;
  var registrations = sheetStatus_("Registrations", "REGISTRATIONS_SPREADSHEET_ID", readRegistrations_);
  var singers = sheetStatus_("Singers", "SINGERS_SPREADSHEET_ID", readSingers_);
  var ballots = sheetStatus_("Results", "RESULTS_SPREADSHEET_ID", readBallots_);
  var variables = sheetStatus_("Variables", "VARIABLES_SPREADSHEET_ID", function () {
    return Object.keys(readVariables_(true));
  });
  var draws = [];
  try { draws = readDraws_(); } catch (error) { draws = []; }
  base.sheets = {
    registrations: registrations.status,
    singers: singers.status,
    results: ballots.status,
    variables: variables.status,
  };
  base.registeredCount = registrations.rows ? registrations.rows.length : 0;
  base.singerCount = singers.rows ? singers.rows.length : 0;
  base.voteCount = ballots.rows ? ballots.rows.length : 0;
  base.drawCount = draws.length;
  base.recentRegistrations = (registrations.rows || []).slice(-5).reverse();
  return base;
}
