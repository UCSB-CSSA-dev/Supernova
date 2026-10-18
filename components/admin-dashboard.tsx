"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  BackendError,
  cancelResend,
  fetchAdminStatus,
  generateCodes as requestCodes,
  logout as requestLogout,
  sendBatch,
  sendTestEmail,
  startResend,
} from "@/lib/backend";
import { DEFAULT_BODY, DEFAULT_SUBJECT, renderTemplate } from "@/lib/template";
import type { AdminStatus, SendFailure, SendMode } from "@/lib/types";

const SUBJECT_KEY = "supernova-subject";
const BODY_KEY = "supernova-body";

type Draft = {
  subject: string;
  message: string;
};

const DEFAULT_DRAFT: Draft = {
  subject: DEFAULT_SUBJECT,
  message: DEFAULT_BODY,
};

const draftListeners = new Set<() => void>();
let draftSnapshot: Draft = DEFAULT_DRAFT;
let draftLoaded = false;

function readDraft(): Draft {
  try {
    return {
      subject: window.localStorage.getItem(SUBJECT_KEY) || DEFAULT_SUBJECT,
      message: window.localStorage.getItem(BODY_KEY) || DEFAULT_BODY,
    };
  } catch {
    return DEFAULT_DRAFT;
  }
}

function getDraftSnapshot(): Draft {
  if (!draftLoaded) {
    draftSnapshot = readDraft();
    draftLoaded = true;
  }
  return draftSnapshot;
}

function subscribeDraft(listener: () => void): () => void {
  draftListeners.add(listener);
  return () => draftListeners.delete(listener);
}

function saveDraft(next: Draft): void {
  draftSnapshot = next;
  window.localStorage.setItem(SUBJECT_KEY, next.subject);
  window.localStorage.setItem(BODY_KEY, next.message);
  for (const listener of draftListeners) listener();
}

type SendProgress = {
  running: boolean;
  sent: number;
  total: number;
  failed: SendFailure[];
  halt: string | null;
};

export function AdminDashboard() {
  const router = useRouter();
  const draft = useSyncExternalStore(subscribeDraft, getDraftSnapshot, () => DEFAULT_DRAFT);
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"codes" | "test" | "resend" | null>(null);
  const [progress, setProgress] = useState<SendProgress | null>(null);
  const [resendOpen, setResendOpen] = useState(false);
  const { subject, message } = draft;

  async function refresh() {
    try {
      setStatus(await fetchAdminStatus());
      setLoadError(null);
    } catch (error) {
      if (error instanceof BackendError && error.unauthenticated) {
        router.push("/admin/login");
        return;
      }
      setLoadError(error instanceof Error ? error.message : "Could not load the admin page.");
    }
  }

  useEffect(() => {
    // Load the sheet status once when the dashboard opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh().catch(() => setLoadError("Could not load the admin page."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const preview = status?.preview
    ? renderTemplate(message, status.preview)
    : "The preview appears after the spreadsheets are connected.";
  const sending = progress?.running ?? false;
  const draftReady = Boolean(status && status.problems.length === 0 && message.includes("[link]") && subject.trim());
  const canSend = draftReady && Boolean(status && status.unsent > 0);
  const canResend = draftReady && Boolean(status && status.reachable > 0);

  async function generateCodes() {
    setBusy("codes");
    try {
      const body = await requestCodes();
      const created = body.created;
      toast.success(created === 0 ? "Every row already has a code." : `Generated ${created} codes.`);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate codes.");
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    setBusy("test");
    try {
      await sendTestEmail(subject, message);
      toast.success(`Test sent to ${status?.gmailUser ?? "your Gmail"}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Test email failed.");
    } finally {
      setBusy(null);
    }
  }

  async function resendAll() {
    setResendOpen(false);
    setBusy("resend");
    let total = 0;
    try {
      total = (await startResend()).total;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the resend.");
      return;
    } finally {
      setBusy(null);
    }
    await runSend("all", total);
  }

  async function stopResend() {
    setBusy("resend");
    try {
      await cancelResend();
      toast.success("Resend cancelled.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel the resend.");
    } finally {
      setBusy(null);
    }
  }

  async function runSend(mode: SendMode, total: number) {
    const failed: SendFailure[] = [];
    let sent = 0;
    const skipRows: number[] = [];
    setProgress({ running: true, sent: 0, total, failed: [], halt: null });

    try {
      while (true) {
        const body = await sendBatch(subject, message, skipRows, mode);
        const batchSent = body.sent;
        const batchFailed = body.failed;
        const remaining = body.remaining;
        const halt = body.halt;
        sent += batchSent;
        failed.push(...batchFailed);
        skipRows.push(...batchFailed.map((failure) => failure.row));
        setProgress({ running: !halt && remaining > 0 && batchSent > 0, sent, total, failed, halt });
        if (halt || remaining === 0 || batchSent === 0) break;
      }
    } catch (error) {
      setProgress({
        running: false,
        sent,
        total,
        failed,
        halt: error instanceof Error ? error.message : "Sending stopped.",
      });
    } finally {
      setProgress((current) => (current ? { ...current, running: false } : current));
      await refresh().catch(() => undefined);
    }
  }

  async function logout() {
    await requestLogout();
    router.push("/admin/login");
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm tracking-[0.3em] text-primary uppercase">Supernova</p>
          <h1 className="font-heading text-4xl">Admin</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href="/results" />}>
            Results
          </Button>
          <Button variant="ghost" onClick={() => void logout()}>
            Log out
          </Button>
        </div>
      </header>

      {loadError ? <p className="text-destructive">{loadError}</p> : null}
      {!status && !loadError ? <p className="text-muted-foreground">Loading spreadsheets…</p> : null}

      {status ? (
        <>
          {status.problems.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Finish setup</CardTitle>
                <CardDescription>Add these script properties in the Apps Script project, then redeploy the web app.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {status.problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Spreadsheets</CardTitle>
              <CardDescription>
                Opened by {status.accountEmail || "the Google account that deployed the script"}. That account needs edit access to Audience and Results.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {status.sheets ? (
                Object.values(status.sheets).map((sheet) => (
                  <div key={sheet.label} className="flex items-start justify-between gap-3">
                    <div>
                      <a className="font-medium underline-offset-4 hover:underline" href={sheet.url} target="_blank" rel="noreferrer">
                        {sheet.label}
                      </a>
                      <p className="text-sm text-muted-foreground">
                        {sheet.error ?? `${sheet.rows ?? 0} rows`}
                      </p>
                    </div>
                    <Badge variant={sheet.error ? "destructive" : "secondary"}>
                      {sheet.error ? "Check share" : "Connected"}
                    </Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Set the spreadsheet script properties to open the sheet links.</p>
              )}
              <div className="flex flex-wrap gap-2 pt-2 text-sm text-muted-foreground">
                <span>{status.audienceCount} people</span>
                <span>{status.singerCount} performers</span>
                <span>{status.voteCount} votes</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Voting codes</CardTitle>
              <CardDescription>
                {status.codesMissing === 0
                  ? "Every audience row has a 6-character code and its link hash."
                  : `${status.codesMissing} rows still need a code. Older long codes are replaced and marked unsent.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => void generateCodes()} disabled={busy !== null || sending || status.problems.length > 0}>
                {busy === "codes" ? "Generating…" : "Generate missing codes"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Invitation</CardTitle>
              <CardDescription>
                `[Name]`, `[link]`, and `[vcode]` are replaced for each person. `[vcode]` is the 6-character code for the
                backup form. {status.unsent} unsent{" "}
                {status.unsent === 1 ? "message" : "messages"}. A full send of 300–400 takes several minutes.
                Gmail accounts are capped at about 500 messages a day.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(event) => saveDraft({ subject: event.target.value, message })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  rows={10}
                  value={message}
                  onChange={(event) => saveDraft({ subject, message: event.target.value })}
                />
                {!message.includes("[vcode]") ? (
                  <p className="text-sm text-destructive">
                    Add `[vcode]` so everyone has their code for the backup form.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Preview</p>
                <pre className="overflow-auto rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap">{preview}</pre>
                <p className="text-xs text-muted-foreground">
                  The test email uses the name Alex, the code TEST00, and a link that cannot vote. It is sent to{" "}
                  {status.gmailUser || "the script account"}.
                </p>
              </div>
              {status.invalidEmails.length > 0 ? (
                <div className="text-sm text-destructive">
                  <p>These rows have no usable email and will be skipped:</p>
                  <ul className="mt-1 list-disc pl-5">
                    {status.invalidEmails.slice(0, 8).map((row) => (
                      <li key={row.row}>
                        Row {row.row}: {row.name || "No name"} {row.email ? `(${row.email})` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {progress ? (
                <div className="space-y-2">
                  <Progress value={progress.total === 0 ? 0 : Math.round((progress.sent / progress.total) * 100)} />
                  <p className="text-sm text-muted-foreground">
                    Sent {progress.sent} of {progress.total}
                    {progress.failed.length > 0 ? `, ${progress.failed.length} failed` : ""}
                    {progress.running ? "…" : "."}
                  </p>
                  {progress.halt ? <p className="text-sm text-destructive">{progress.halt}</p> : null}
                  {progress.failed.length > 0 ? (
                    <ul className="max-h-40 overflow-auto text-sm text-destructive">
                      {progress.failed.map((failure) => (
                        <li key={failure.row}>
                          {failure.email}: {failure.error}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void runSend("unsent", status.unsent)} disabled={!canSend || sending || busy !== null}>
                  {sending ? "Sending…" : `Send ${status.unsent} emails`}
                </Button>
                <Button variant="outline" onClick={() => void sendTest()} disabled={sending || busy !== null || status.problems.length > 0}>
                  {busy === "test" ? "Sending test…" : "Send test to me"}
                </Button>
              </div>
              <div className="space-y-2 border-t pt-4">
                <p className="text-sm font-medium">Resend to everyone</p>
                {status.resend ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      A resend stopped with {status.resend.remaining} {status.resend.remaining === 1 ? "person" : "people"} left.
                      Resuming skips everyone who already got the resent email.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => void runSend("all", status.resend?.remaining ?? 0)}
                        disabled={!draftReady || sending || busy !== null}
                      >
                        {sending ? "Sending…" : `Resume resend (${status.resend.remaining})`}
                      </Button>
                      <Button variant="ghost" onClick={() => void stopResend()} disabled={sending || busy !== null}>
                        Cancel resend
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Sends the current draft to all {status.reachable} people with a code, including those who already got it.
                      Their codes and links stay the same.
                    </p>
                    <Button variant="outline" onClick={() => setResendOpen(true)} disabled={!canResend || sending || busy !== null}>
                      {busy === "resend" ? "Starting…" : `Resend to all ${status.reachable}`}
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <AlertDialog open={resendOpen} onOpenChange={setResendOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Resend to everyone?</AlertDialogTitle>
                <AlertDialogDescription>
                  This emails all {status.reachable} people again, including those who already got the invitation. Gmail
                  allows about 500 messages a day. If it stops, you can resume later without emailing anyone twice.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Go back</AlertDialogCancel>
                <AlertDialogAction onClick={() => void resendAll()}>Resend to all</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : null}
    </main>
  );
}
