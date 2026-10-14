import assert from "node:assert/strict";
import test from "node:test";
import { draftError, renderTemplate, textToHtml } from "./template.ts";

test("replaces name and link placeholders", () => {
  assert.equal(
    renderTemplate("Hi [Name], vote at [link]. Thanks, [Name].", {
      name: "Mina",
      link: "https://show.example/vote/abc",
    }),
    "Hi Mina, vote at https://show.example/vote/abc. Thanks, Mina.",
  );
});

test("requires a link placeholder", () => {
  assert.equal(draftError("Subject", "Hello [Name]"), "The message must include [link].");
  assert.equal(draftError("Subject", "Vote: [link]"), null);
});

test("escapes html and keeps the voting url clickable", () => {
  const html = textToHtml("Hi <Mina>\nhttps://show.example/vote/abc");
  assert.match(html, /Hi &lt;Mina&gt;/);
  assert.match(html, /<a href="https:\/\/show\.example\/vote\/abc">/);
  assert.match(html, /<br>/);
});
