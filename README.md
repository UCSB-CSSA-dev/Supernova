# Supernova voting

Audience members vote once from a personal email link. A projector on `/results` ranks the performances live.

GitHub Pages serves only the static site. Google Apps Script is the backend: it reads and writes the three spreadsheets and sends mail through the Gmail API as the Google account that owns the script.

## 1. Apps Script

1. Open [script.google.com](https://script.google.com) while signed in as the dedicated Supernova Google account and create a project.
2. Replace the default `Code.gs` with `apps-script/Code.gs`.
3. Open Project Settings, check **Show "appsscript.json" manifest file**, and replace that file with `apps-script/appsscript.json`.
4. In the script editor, open the Google Cloud project link. If the default Apps Script project cannot enable APIs, switch to a standard Cloud project. Enable the **Google Sheets API** and the **Gmail API**.
5. In Project Settings → Script properties, add:

   | Property | Value |
   | --- | --- |
   | `AUDIENCE_SPREADSHEET_ID` | Audience spreadsheet id |
   | `SINGERS_SPREADSHEET_ID` | Singers spreadsheet id |
   | `RESULTS_SPREADSHEET_ID` | Results spreadsheet id |
   | `ADMIN_PASSWORD` | Password for `/admin` |
   | `APP_URL` | `https://james-guo-03.github.io/polling-app` |

   `APP_URL` has no trailing slash. Vote links are `{APP_URL}/vote?code=…`. Set this to the public Pages URL before generating codes or sending mail. While testing locally, you can temporarily set it to `http://localhost:3000`.

6. Deploy → New deployment → Web app.
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Authorize Sheets and Gmail when Google prompts. Copy the web app URL that ends in `/exec`.

The dedicated account must be able to edit Audience and Results. Singers can be view-only if that same account can read it. A consumer Gmail account can send about 500 messages per day. Send a small test before the full list of 300–400. The script sends through the Gmail API (`gmail.send`), not `MailApp`, so it is not limited to the 100-recipient Apps Script mail quota.

## Spreadsheets

Create three files on the same Google account:

- **Audience** with columns `Name` and `Email`. The script adds `verification_code` and `email_sent_at`.
- **Singers** with columns `singer_name` and `song_name`.
- **Results** can start empty. The script writes `voted_at`, `name`, `email`, `verification_code`, `singer_name`, `song_name`.

## 2. Local frontend

```bash
npm install
```

Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_APPS_SCRIPT_URL` to the `/exec` URL. Leave `NEXT_PUBLIC_BASE_PATH` empty.

```bash
npm run dev
```

Open `/admin`, generate codes, preview the message, send a test to the script account, then send the audience. `[Name]` and `[link]` are replaced per person.

## 3. GitHub Pages

The site is a project page, so the public path is `/polling-app`.

1. In the GitHub repo, Settings → Pages → Build and deployment → Source: **GitHub Actions**.
2. Settings → Secrets and variables → Actions → Variables: add `APPS_SCRIPT_URL` with the same `/exec` URL. The URL is public; it does not belong in a secret.
3. Push `main`. The workflow in `.github/workflows/pages.yml` builds the static export and publishes `out/`.

Do not put the admin password, spreadsheet contents, or any Google credential in the repository. Those stay in Apps Script properties.

The results screen polls every 5 seconds. Apps Script caches that response for 4 seconds and drops the cache when a vote is saved. Leaving `/results` open all day can use up the consumer Apps Script runtime quota (about 90 minutes per day), so open it for the show.
