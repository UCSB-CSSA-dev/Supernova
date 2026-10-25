# Supernova voting

The audience checks in at the venue, votes later in the show, and is entered in a lucky draw. Everyone signs in with a `@ucsb.edu` Google account. A projector on `/result` ranks the performances live.

## Pages

| Page | Who can open it |
| --- | --- |
| `/login` | Everyone. Google sign-in, then back to the page you were trying to open |
| `/check-in` | Signed in. Opening it while check-in is open checks you in |
| `/vote` | Signed in. Only people who checked in can actually vote |
| `/random-order` | Signed in. **Singing Order (Finals)**: singers on the singer list enter their name and get a unique random singing number from 1 to the number of singers. Everyone else is told only finalists can pick |
| `/dashboard` | Signed in. Links to every page; admin links appear for admins |
| `/admin`, `/admin/check-in`, `/admin/voting-qr`, `/admin/lottery` | Admins only |
| `/result` | Admins only. Live ranking for the projector, with a "Scan to vote" QR in the bottom-right until voting closes. Kept off audience phones so hundreds of people refreshing it can't overload Apps Script |

`/` sends signed-out visitors to `/login` and signed-in people to `/dashboard`. Signed-out visitors who open any other page are sent to `/login`. The site is static, so this blocking only affects what the browser shows. The real rules (who can check in, vote, or use admin actions) are enforced by Apps Script on every request.

1. **Check in.** While check-in is open, anyone who opens `/check-in` and signs in with a @ucsb.edu Google account is recorded in the Registrations sheet and told they're qualified for the lucky draw, and that winners must claim their prize right after the show. Singers on the singer list can't check in; the page tells them they're in the lucky draw anyway. `/admin/check-in` shows a QR code for that page on the projector. People who open the page before check-in opens are checked in automatically once it opens. The link works from anywhere, so check-in is limited by time, not by being in the room.
2. **Vote.** `/vote` (or the QR on `/admin/voting-qr`) is the same for everyone. Only people who checked in can vote, once each, and only while voting is open. People who arrive before voting opens see a waiting screen that turns into the ballot when voting opens.
3. **Lucky draw.** `/admin/lottery` draws one person at a time from everyone who checked in plus every singer on the singer list. Nobody can win twice. Every draw is saved to a `Lottery` tab in the Registrations spreadsheet.

GitHub Pages serves only the static site. Google Apps Script is the backend: it verifies Google sign-ins, and reads and writes the spreadsheets as the Google account that owns the script. Nothing sends email.

## 1. Google sign-in client

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), pick or create a project and configure the OAuth consent screen (External, app name "Supernova"). Only the default `email`, `profile`, and `openid` scopes are needed, so Google doesn't need to verify the app.
2. Create credentials → **OAuth client ID** → **Web application**.
3. Under **Authorized JavaScript origins**, add the site origin with no path, plus local origins for testing:
   - `https://ucsb-cssa-dev.github.io` (or wherever the site is published)
   - `http://localhost:3000`
   - `http://localhost`
4. Copy the client ID (it ends in `.apps.googleusercontent.com`). It's public, not a secret.

Sign-in only accepts verified Google Workspace accounts whose address ends in `@ucsb.edu` (the token's `hd` claim must be `ucsb.edu`). A personal Google account registered with a ucsb.edu address is rejected.

## 2. Apps Script

1. Open [script.google.com](https://script.google.com) while signed in as the dedicated Supernova Google account and create a project.
2. Replace the default `Code.gs` with `apps-script/Code.gs`.
3. Open Project Settings, check **Show "appsscript.json" manifest file**, and replace that file with `apps-script/appsscript.json`.
4. In Project Settings → Script properties, add:

   | Property | Value |
   | --- | --- |
   | `REGISTRATIONS_SPREADSHEET_ID` | Registrations spreadsheet id |
   | `SINGERS_SPREADSHEET_ID` | Singers spreadsheet id |
   | `RESULTS_SPREADSHEET_ID` | Results spreadsheet id |
   | `VARIABLES_SPREADSHEET_ID` | Variables spreadsheet id |
   | `GOOGLE_CLIENT_ID` | The OAuth client ID from step 1 |

   There is no admin password. `jamesguo@ucsb.edu` (`OWNER_EMAIL` at the top of `Code.gs`) is always an admin. Any admin can add more @ucsb.edu admins from the admin page, and only the owner can remove them. Those are stored in the `ADMIN_EMAILS` row of the Variables sheet.

   The script creates `SESSION_SECRET` on first use and keeps it in script properties. Deleting it signs everyone out.

5. Deploy → New deployment → Web app.
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Authorize Sheets when Google prompts. Copy the web app URL that ends in `/exec`.

If you're updating the older email-based deployment, use Deploy → Manage deployments → Edit → **New version** so the `/exec` URL stays the same, replace the old `AUDIENCE_SPREADSHEET_ID` with `REGISTRATIONS_SPREADSHEET_ID`, and delete `ADMIN_PASSWORD`. Point `RESULTS_SPREADSHEET_ID` at a fresh sheet so votes from the old system aren't counted.

## Spreadsheets

Create four files on the same Google account:

- **Variables** with columns `variable_name`, `value`, `created_at`. It can start with only the header row. The script keeps one row per variable and stamps `created_at` whenever a value is set:

  | `variable_name` | Holds |
  | --- | --- |
  | `CHECKIN_OPENS_AT`, `CHECKIN_CLOSES_AT` | Check-in window (ISO times) |
  | `VOTING_OPENS_AT`, `VOTING_CLOSES_AT` | Voting window (ISO times) |
  | `ADMIN_EMAILS` | Trusted admin emails, comma-separated |
  | `SINGER_EMAILS` | The singer (finalist) list, comma-separated. Set it from **4. Singing Order (Finals)** on `/admin` |
  | `FINALS_ORDER_SHUFFLE` | The shuffled numbers 1–(number of singers) for `/random-order`, created on the first claim |
  | `ORDER_SHUFFLE` | The semifinal shuffle. No longer used |

  `/random-order` saves claims (`number`, `name`, `email`, `claimed_at`) to a `Singing Order (Finals)` tab it adds to this spreadsheet; the semifinal `Singing order` tab is left as it was. Only emails in `SINGER_EMAILS` can claim, and each gets the next unclaimed number from `FINALS_ORDER_SHUFFLE`. If the number of singers changes, the next claim reshuffles the numbers still open; numbers already claimed never change. The singer list also decides who can't check in (singers) and adds every singer to the lucky draw, under the name they typed when picking a number, or their email otherwise. Admins paste the list and see every claim (with emails) under **4. Singing Order (Finals)** on `/admin`. **Reset** renames the tab to `Singing Order (Finals) (reset <time>)` so the old list is kept, and clears `FINALS_ORDER_SHUFFLE`. The next claim then starts a new tab and a new shuffle.

  Sponsor ad views are counted on an `Ad views` tab (`viewed_at`, `ads`, `email`) it adds here. Each time an ad is shown the browser queues it and sends it along with its next request, so counting adds almost no traffic. **Sponsor ad views** at the bottom of `/admin` shows views and distinct signed-in viewers per ad. The ad ids (`welcome`, `checkin`, `poster`, `logo`) are set in `components/ad-slot.tsx` and must match `AD_IDS` in `Code.gs`. Ads are cropped to fill their frame (4:3 for `welcome`, 4:5 for `checkin` and `poster`), so supply sponsor ads at that shape to show them uncropped. Delete the tab's rows to start counting from zero.

  Set these from `/admin`. Edits made directly in the sheet take effect within 5 seconds. An empty value means unset.
- **Registrations** can start empty. The script writes `registered_at`, `email`, `name` on the first tab and keeps lottery draws (`drawn_at`, `round`, `email`, `name`) on a `Lottery` tab it creates.
- **Singers** with columns `singer_name` and `song_name`.
- **Results** can start empty. The script writes `voted_at`, `name`, `email`, `singer_name`, `song_name`.

The script account must be able to edit Variables, Registrations, and Results. Singers can be view-only if that same account can read it. If the same person somehow appears twice (two phones at once), only their first row counts. To start over, use the reset buttons on `/admin`. **Reset check-in** copies the check-ins to a dated tab and clears the first tab, so everyone has to check in again (votes and lucky draw winners are kept). **Reset votes** does the same for the Results spreadsheet, so the board goes back to zero and everyone who checked in can vote again. **Reset lucky draw** renames the `Lottery` tab with a date, so everyone who checked in can be drawn again.

## 3. Local frontend

```bash
npm install
```

Copy `.env.example` to `.env.local`, set `NEXT_PUBLIC_APPS_SCRIPT_URL` to the `/exec` URL and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` to the OAuth client ID. Leave `NEXT_PUBLIC_BASE_PATH` empty.

```bash
npm run dev
```

## Running the show

1. Open `/admin` and sign in with Google as the owner or a trusted admin. The owner can add other organizers under **Admins**.
2. **Check-in:** set the opening and closing times, or press **Open now** when doors open. Put **Open check-in screen** on a projector or TV. The latest check-ins appear on the dashboard (press Refresh).
3. **Voting:** set an opening time, or press **Open in 2 min** when it's almost time (announce it on the mic). Use **Open now** only if few people are waiting. Show **Full-screen QR** or share the link. Open `/result` on the main projector; its corner QR also opens the ballot.
4. **Singing order:** before the show, paste the singers' @ucsb.edu emails into **4. Singing Order (Finals)** on `/admin` and press **Save singer list**, then send the singers the `/random-order` link.
5. **Lucky draw:** open the lottery screen and press **Draw** (or space) once per prize. Winners claim their prize right after the show.

A sign-in lasts 12 hours and is shared across tabs, so the check-in screen, lottery, and dashboard can run side by side. Admin access is checked on every request, so removing someone from the list locks them out right away.

## 4. GitHub Pages

The site is a project page, published under the repository name (for example `https://ucsb-cssa-dev.github.io/supernova`).

1. In the GitHub repo, Settings → Pages → Build and deployment → Source: **GitHub Actions**.
2. Settings → Secrets and variables → Actions → Variables: add `APPS_SCRIPT_URL` (the `/exec` URL) and `GOOGLE_CLIENT_ID`. Both are public, so they don't belong in secrets.
3. Push `main`. The workflow in `.github/workflows/pages.yml` builds the static export and publishes `out/`.

Do not put spreadsheet contents or any Google credential in the repository. Those stay in Apps Script properties.

## Load

Apps Script runs only about 30 requests at a time. Check-in and voting can safely be retried, and the site retries them automatically when Google is busy.

Phones waiting for voting check back about once a minute, spread out. Once voting is scheduled, they receive the ballot in advance, show a countdown, and open it by themselves at the scheduled time without asking Google. The script still rejects votes that arrive before the opening time. That's why **Open in 2 min** is safer than **Open now**: with Open now, waiting phones only notice on their next check, up to a minute later. The results screen asks for new counts once a second. Each round trip usually takes about a second, so expect updates every 1–2 seconds.
