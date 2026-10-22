import assert from "node:assert/strict";
import test from "node:test";
import { describeWindow, fromLocalInput, maskEmail, toLocalInput } from "./format.ts";

test("datetime-local values round-trip through ISO", () => {
  const iso = fromLocalInput("2026-11-07T19:30");
  assert.ok(iso);
  assert.equal(toLocalInput(iso), "2026-11-07T19:30");
  assert.equal(fromLocalInput(""), null);
  assert.equal(toLocalInput(null), "");
});

test("masks the middle of an email address", () => {
  assert.equal(maskEmail("jamesguo@ucsb.edu"), "jam•••••@ucsb.edu");
  assert.equal(maskEmail("abcd@ucsb.edu"), "abc••@ucsb.edu");
  assert.equal(maskEmail("ab@ucsb.edu"), "a••@ucsb.edu");
  assert.equal(maskEmail("not-an-email"), "not-an-email");
});

test("describes each window phase", () => {
  assert.equal(describeWindow({ opensAt: null, closesAt: null, phase: "unscheduled" }, "Voting"), "Voting is not open yet.");
  assert.equal(describeWindow({ opensAt: "2026-01-01T00:00:00.000Z", closesAt: null, phase: "open" }, "Voting"), "Voting is open.");
  assert.equal(
    describeWindow({ opensAt: "2026-01-01T00:00:00.000Z", closesAt: "2026-01-01T01:00:00.000Z", phase: "closed" }, "Check-in"),
    "Check-in has closed.",
  );
});
