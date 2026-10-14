var RESULT_HEADERS = ["voted_at", "name", "email", "verification_code", "singer_name", "song_name"];
var REQUIRED_PROPS = [
  "AUDIENCE_SPREADSHEET_ID",
  "SINGERS_SPREADSHEET_ID",
  "RESULTS_SPREADSHEET_ID",
  "ADMIN_PASSWORD",
  "APP_URL",
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
    if (action === "voteState") return voteState_(String(data.code || ""));
    if (action === "vote") return castVote_(String(data.code || ""), String(data.singerName || ""), String(data.songName || ""));
    if (action === "login") return login_(String(data.password || ""));
    if (action === "logout") return logout_(String(data.token || ""));
    requireAdmin_(String(data.token || ""));
    if (action === "status") return status_();
    if (action === "codes") return { ok: true, created: generateCodes_() };
    if (action === "testEmail") return testEmail_(String(data.subject || ""), String(data.message || ""));
    if (action === "send") return sendBatch_(String(data.subject || ""), String(data.message || ""), data.skipRows);
    return { ok: false, error: "Unknown action." };
  } catch (error) {
    return {
      ok: false,
      error: error && error.message ? error.message : "Something went wrong.",
      unauthenticated: Boolean(error && error.unauthenticated),
    };
  }
}

function login_(password) {
  var expected = prop_("ADMIN_PASSWORD");
  if (!password || password !== expected) return { ok: false, error: "Wrong password." };
  var token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put("admin:" + token, "1", 21600);
  return { ok: true, token: token };
}

function logout_(token) {
  if (token) CacheService.getScriptCache().remove("admin:" + token);
  return { ok: true };
}

function requireAdmin_(token) {
  if (!token || !CacheService.getScriptCache().get("admin:" + token)) {
    var error = new Error("Not authenticated");
    error.unauthenticated = true;
    throw error;
  }
}

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

function appUrl_() {
  return prop_("APP_URL").replace(/\/+$/, "");
}

function voteLink_(code) {
  return appUrl_() + "/vote?code=" + encodeURIComponent(code);
}

function sheet_(idProp, label) {
  try {
    return SpreadsheetApp.openById(prop_(idProp)).getSheets()[0];
  } catch (error) {
    throw new Error(label + " spreadsheet could not be opened. Check the ID and that this Google account can access it.");
  }
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

function ensureColumn_(sheet, map, name) {
  if (map[name]) return map[name];
  var column = Math.max(sheet.getLastColumn(), Object.keys(map).length) + 1;
  sheet.getRange(1, column).setValue(name);
  map[name] = column;
  return column;
}

function cell_(row, column) {
  if (!column) return "";
  return String(row[column - 1] || "").trim();
}

function readAudience_() {
  var sheet = sheet_("AUDIENCE_SPREADSHEET_ID", "Audience");
  if (sheet.getLastRow() < 1) throw new Error("The audience spreadsheet is empty. Add a header row with Name and Email.");
  var map = headerMap_(sheet);
  if (!map.name || !map.email) throw new Error("The audience spreadsheet needs Name and Email columns in the first row.");
  ensureColumn_(sheet, map, "verification_code");
  ensureColumn_(sheet, map, "email_sent_at");
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getDisplayValues();
  var rows = [];
  values.forEach(function (row, index) {
    var record = {
      rowNumber: index + 2,
      name: cell_(row, map.name),
      email: cell_(row, map.email),
      verificationCode: cell_(row, map.verification_code),
      emailSentAt: cell_(row, map.email_sent_at),
    };
    if (record.name || record.email || record.verificationCode) rows.push(record);
  });
  return rows;
}

function readSingers_() {
  var sheet = sheet_("SINGERS_SPREADSHEET_ID", "Singers");
  if (sheet.getLastRow() < 1) return [];
  var map = headerMap_(sheet);
  if (!map.singer_name || !map.song_name) {
    throw new Error("The singer spreadsheet needs singer_name and song_name columns in the first row.");
  }
  if (sheet.getLastRow() < 2) return [];
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getDisplayValues();
  var seen = {};
  var singers = [];
  values.forEach(function (row) {
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

function ensureResultHeaders_(sheet) {
  if (sheet.getLastRow() > 0 && String(sheet.getRange(1, 1).getDisplayValue() || "").trim()) {
    var map = headerMap_(sheet);
    var missing = RESULT_HEADERS.filter(function (header) { return !map[header]; });
    if (missing.length) {
      throw new Error("The results spreadsheet is missing " + missing.join(", ") + ". The first row should be: " + RESULT_HEADERS.join(", ") + ".");
    }
    return;
  }
  sheet.getRange(1, 1, 1, RESULT_HEADERS.length).setValues([RESULT_HEADERS]);
}

function readBallots_() {
  var ballots = readBallotRows_();
  var extras = duplicateRows_(ballots);
  if (!extras.length) return ballots;
  var sheet = sheet_("RESULTS_SPREADSHEET_ID", "Results");
  extras.sort(function (a, b) { return b - a; });
  extras.forEach(function (rowNumber) { sheet.deleteRow(rowNumber); });
  return readBallotRows_();
}

function readBallotRows_() {
  var sheet = sheet_("RESULTS_SPREADSHEET_ID", "Results");
  ensureResultHeaders_(sheet);
  var map = headerMap_(sheet);
  if (sheet.getLastRow() < 2) return [];
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getDisplayValues();
  var ballots = [];
  values.forEach(function (row, index) {
    var record = {
      rowNumber: index + 2,
      votedAt: cell_(row, map.voted_at),
      name: cell_(row, map.name),
      email: cell_(row, map.email),
      verificationCode: cell_(row, map.verification_code),
      singerName: cell_(row, map.singer_name),
      songName: cell_(row, map.song_name),
    };
    if (record.verificationCode || record.singerName || record.songName) ballots.push(record);
  });
  return ballots;
}

function isEarlier_(candidate, current) {
  if (candidate.votedAt !== current.votedAt) return candidate.votedAt < current.votedAt;
  return candidate.rowNumber < current.rowNumber;
}

function winningBallots_(ballots) {
  var winners = {};
  ballots.forEach(function (ballot) {
    if (!ballot.verificationCode) return;
    var current = winners[ballot.verificationCode];
    if (!current || isEarlier_(ballot, current)) winners[ballot.verificationCode] = ballot;
  });
  return Object.keys(winners).map(function (code) { return winners[code]; });
}

function duplicateRows_(ballots) {
  var winnerRow = {};
  winningBallots_(ballots).forEach(function (ballot) {
    winnerRow[ballot.verificationCode] = ballot.rowNumber;
  });
  return ballots.filter(function (ballot) {
    return winnerRow[ballot.verificationCode] && winnerRow[ballot.verificationCode] !== ballot.rowNumber;
  }).map(function (ballot) { return ballot.rowNumber; });
}

function choiceKey_(choice) {
  return choice.singerName + "\n" + choice.songName;
}

function results_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get("results");
  if (cached) return JSON.parse(cached);
  var singers = readSingers_();
  var ballots = winningBallots_(readBallots_());
  var counts = {};
  singers.forEach(function (singer) { counts[choiceKey_(singer)] = 0; });
  ballots.forEach(function (ballot) {
    var key = choiceKey_(ballot);
    if (counts[key] === undefined) return;
    counts[key] += 1;
  });
  var ranked = singers.map(function (singer) {
    return { singerName: singer.singerName, songName: singer.songName, votes: counts[choiceKey_(singer)] || 0 };
  });
  ranked.sort(function (a, b) {
    return b.votes - a.votes || a.singerName.localeCompare(b.singerName) || a.songName.localeCompare(b.songName);
  });
  var payload = {
    ok: true,
    totalVotes: ballots.length,
    ranked: ranked.map(function (choice, index) {
      return { place: index + 1, singerName: choice.singerName, songName: choice.songName, votes: choice.votes };
    }),
    updatedAt: new Date().toISOString(),
  };
  cache.put("results", JSON.stringify(payload), 4);
  return payload;
}

function voteState_(code) {
  if (!code || code.length > 128) return { ok: true, status: "invalid" };
  var person = findPerson_(code);
  if (!person) return { ok: true, status: "invalid" };
  var existing = winningBallots_(readBallots_()).filter(function (ballot) {
    return ballot.verificationCode === code;
  })[0];
  if (existing) return { ok: true, status: "used", singerName: existing.singerName, songName: existing.songName };
  return { ok: true, status: "open", candidates: readSingers_() };
}

function findPerson_(code) {
  var matches = readAudience_().filter(function (row) { return row.verificationCode === code; });
  return matches[0] || null;
}

function castVote_(code, singerName, songName) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (!code || code.length > 128) return { ok: false, error: "invalid" };
    var person = findPerson_(code);
    if (!person) return { ok: false, error: "invalid" };
    var existing = winningBallots_(readBallots_()).filter(function (ballot) {
      return ballot.verificationCode === code;
    })[0];
    if (existing) return { ok: false, error: "used", singerName: existing.singerName, songName: existing.songName };
    var match = readSingers_().filter(function (singer) {
      return singer.singerName === singerName && singer.songName === songName;
    })[0];
    if (!match) return { ok: false, error: "unknown-choice" };
    var resultsSheet = sheet_("RESULTS_SPREADSHEET_ID", "Results");
    ensureResultHeaders_(resultsSheet);
    var map = headerMap_(resultsSheet);
    var row = new Array(resultsSheet.getLastColumn()).fill("");
    row[map.voted_at - 1] = new Date().toISOString();
    row[map.name - 1] = person.name;
    row[map.email - 1] = person.email;
    row[map.verification_code - 1] = code;
    row[map.singer_name - 1] = singerName;
    row[map.song_name - 1] = songName;
    resultsSheet.getRange(resultsSheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
    CacheService.getScriptCache().remove("results");
    return { ok: true, singerName: singerName, songName: songName };
  } finally {
    lock.releaseLock();
  }
}

function isEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function sheetStatus_(label, idProp, read) {
  try {
    var rows = read();
    return {
      status: { label: label, url: "https://docs.google.com/spreadsheets/d/" + prop_(idProp) + "/edit", rows: rows.length, error: null },
      rows: rows,
    };
  } catch (error) {
    var id = "";
    try { id = prop_(idProp); } catch (ignored) { id = ""; }
    return {
      status: {
        label: label,
        url: id ? "https://docs.google.com/spreadsheets/d/" + id + "/edit" : "",
        rows: null,
        error: error.message,
      },
      rows: null,
    };
  }
}

function status_() {
  var problems = missingProps_();
  var account = "";
  try { account = Session.getEffectiveUser().getEmail(); } catch (error) { account = ""; }
  var base = {
    ok: true,
    accountEmail: account,
    gmailUser: account,
    appUrl: null,
    problems: problems,
    sheets: null,
    audienceCount: 0,
    singerCount: 0,
    voteCount: 0,
    codesMissing: 0,
    unsent: 0,
    invalidEmails: [],
    preview: { name: "Alex", link: "" },
  };
  if (problems.length) return base;
  base.appUrl = appUrl_();
  var audienceResult = sheetStatus_("Audience", "AUDIENCE_SPREADSHEET_ID", readAudience_);
  var singersResult = sheetStatus_("Singers", "SINGERS_SPREADSHEET_ID", readSingers_);
  var ballotsResult = sheetStatus_("Results", "RESULTS_SPREADSHEET_ID", readBallots_);
  var audience = audienceResult.rows || [];
  var previewRow = audience.filter(function (row) { return row.verificationCode; })[0] || audience[0];
  base.sheets = { audience: audienceResult.status, singers: singersResult.status, results: ballotsResult.status };
  base.audienceCount = audience.length;
  base.singerCount = singersResult.rows ? singersResult.rows.length : 0;
  base.voteCount = ballotsResult.rows ? winningBallots_(ballotsResult.rows).length : 0;
  base.codesMissing = audience.filter(function (row) { return !row.verificationCode && (row.name || row.email); }).length;
  base.unsent = pending_(audience).length;
  base.invalidEmails = audience.filter(function (row) {
    return !row.emailSentAt && (row.name || row.email) && !isEmail_(row.email);
  }).map(function (row) { return { row: row.rowNumber, name: row.name, email: row.email }; });
  base.preview = {
    name: previewRow && previewRow.name ? previewRow.name : "Alex",
    link: voteLink_(previewRow && previewRow.verificationCode ? previewRow.verificationCode : "test-preview"),
  };
  return base;
}

function generateCodes_() {
  var rows = readAudience_();
  var used = {};
  rows.forEach(function (row) { if (row.verificationCode) used[row.verificationCode] = true; });
  var updates = [];
  rows.forEach(function (row) {
    if (row.verificationCode || (!row.name && !row.email)) return;
    var code = "";
    do { code = Utilities.getUuid().replace(/-/g, ""); } while (used[code]);
    used[code] = true;
    updates.push({ rowNumber: row.rowNumber, code: code });
  });
  if (!updates.length) return 0;
  var target = sheet_("AUDIENCE_SPREADSHEET_ID", "Audience");
  var column = headerMap_(target).verification_code;
  updates.forEach(function (update) {
    target.getRange(update.rowNumber, column).setValue(update.code);
  });
  return updates.length;
}

function pending_(audience) {
  return audience.filter(function (row) {
    return row.verificationCode && !row.emailSentAt && isEmail_(row.email);
  });
}

function draftError_(subject, body) {
  if (!String(subject || "").trim()) return "Add a subject line.";
  if (String(subject).trim().length > 200) return "Keep the subject under 200 characters.";
  if (String(body || "").indexOf("[link]") === -1) return "The message must include [link].";
  if (String(body || "").length > 5000) return "Keep the message under 5000 characters.";
  return "";
}

function render_(template, name, link) {
  return String(template).split("[Name]").join(name).split("[link]").join(link);
}

function sendMail_(to, subject, text) {
  var from = Session.getEffectiveUser().getEmail();
  var mime = [
    "From: Supernova <" + from + ">",
    "To: " + to,
    "Subject: =?UTF-8?B?" + Utilities.base64Encode(subject, Utilities.Charset.UTF_8) + "?=",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    text,
  ].join("\r\n");
  var response = UrlFetchApp.fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({ raw: Utilities.base64EncodeWebSafe(mime) }),
    muteHttpExceptions: true,
  });
  var code = response.getResponseCode();
  if (code >= 200 && code < 300) return;
  var detail = response.getContentText().slice(0, 300);
  var error = new Error(detail || "Gmail rejected the message.");
  error.halt = code === 429 || code === 403 || /quota|rate|limit|daily/i.test(detail);
  throw error;
}

function testEmail_(subject, message) {
  var problem = draftError_(subject, message);
  if (problem) throw new Error(problem);
  sendMail_(Session.getEffectiveUser().getEmail(), render_(subject, "Alex", voteLink_("test-preview")), render_(message, "Alex", voteLink_("test-preview")));
  return { ok: true };
}

function sendBatch_(subject, message, skipRows) {
  var problem = draftError_(subject, message);
  if (problem) throw new Error(problem);
  var skip = {};
  (Array.isArray(skipRows) ? skipRows : []).forEach(function (row) { skip[Number(row)] = true; });
  var audience = readAudience_();
  var queue = pending_(audience).filter(function (row) { return !skip[row.rowNumber]; });
  var batch = queue.slice(0, 8);
  var failed = [];
  var sentRows = [];
  var halt = null;
  batch.forEach(function (person, index) {
    if (halt) return;
    var link = voteLink_(person.verificationCode);
    try {
      sendMail_(person.email, render_(subject, person.name, link), render_(message, person.name, link));
      sentRows.push(person.rowNumber);
    } catch (error) {
      if (error.halt) halt = error.message;
      else failed.push({ row: person.rowNumber, email: person.email, error: error.message });
    }
    if (!halt && index < batch.length - 1) Utilities.sleep(400);
  });
  if (sentRows.length) {
    var target = sheet_("AUDIENCE_SPREADSHEET_ID", "Audience");
    var column = headerMap_(target).email_sent_at;
    var sentAt = new Date().toISOString();
    sentRows.forEach(function (rowNumber) { target.getRange(rowNumber, column).setValue(sentAt); });
  }
  return { ok: true, sent: sentRows.length, failed: failed, remaining: queue.length - sentRows.length, halt: halt };
}
