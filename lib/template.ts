export const DEFAULT_SUBJECT = "Your Supernova voting link";

export const DEFAULT_BODY = `Hi [Name],

You're invited to vote for the best singer in Supernova. Your personal voting link:

[link]

You can vote once, and your vote can't be changed.

If the voting page is down during the show, use this verification code on the backup form: [vcode]`;

export function renderTemplate(
  template: string,
  values: { name: string; link: string; vcode: string },
): string {
  return template
    .replaceAll("[Name]", values.name)
    .replaceAll("[link]", values.link)
    .replaceAll("[vcode]", values.vcode);
}

export function draftError(subject: string, body: string): string | null {
  if (!subject.trim()) return "Add a subject line.";
  if (subject.trim().length > 200) return "Keep the subject under 200 characters.";
  if (!body.includes("[link]")) return "The message must include [link].";
  if (body.length > 5000) return "Keep the message under 5000 characters.";
  return null;
}

export function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function textToHtml(text: string): string {
  const escaped = escapeHtml(text);
  const linked = escaped.replace(
    /https?:\/\/[^\s<]+/g,
    (url) => `<a href="${url}">${url}</a>`,
  );
  return `<div style="font-family:sans-serif;line-height:1.5">${linked.replaceAll("\n", "<br>")}</div>`;
}
