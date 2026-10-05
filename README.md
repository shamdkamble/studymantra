# StudyMantra

HSC Maharashtra ledger for Class 11 and 12. Same shape as DSAMantra: a vanilla JS app, an Express API, MongoDB Atlas, and the existing Cloudflare R2 bucket.

The syllabus follows the 2026–27 Balbharati lists: Mathematics Part 1 and Part 2, Physics, Chemistry, Computer Science 1 and 2, and English. PCM is 95 chapters. English keeps unseen passages and grammar beside the textbook units.

## Run locally

```bash
npm install
cp .env.example .env
npm start
```

Open http://localhost:8090

Use the same Atlas cluster as DSAMantra and set `MONGODB_DB=study-tracker`. Collections are `study_users` and `study_states`, so this app will not write into DSAMantra even if the database name is wrong.

## Accounts

A student submits a name, email, and password. That request does not open a ledger. On the desk, approve it and hand over the code (it looks like `ABCD-2345` and lasts 14 days). The student enters the code once. After that they sign in with the password they chose.

The desk is a separate screen: the waiting list, outstanding codes, each student's progress, and recent study logs and tests. Chapter notes stay on the student ledger. Declining a request lets them ask again. Disabling an open account keeps the ledger and blocks sign-in until you enable it.

Set `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` to create the desk account when the database has none. An account that is already the admin is left as it is, including its password.

R2 uses the same bucket (`dsa-mastery-media`). Objects are stored under `study/{userId}/`. The bucket is public-read, same as DSAMantra photos: links are unlisted, not private. If `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` are empty, the ledger still works and uploads explain that storage is not configured.

## Deploy

```bash
npx vercel
```

Set these environment variables on the Vercel project (the R2 account, bucket, and public URL are already in `vercel.json`):

- `AUTH_SECRET` — a long random string, different from DSAMantra
- `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` — only needed to create the desk account on an empty database
- `MONGODB_USER`
- `MONGODB_PASSWORD`
- `MONGODB_HOST`
- `MONGODB_DB` = `study-tracker`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

`api/index.js` is the serverless entry. Vercel serves the rest of the files as static assets.

## Checks

```bash
npm test
node scripts/test-api.mjs
```

`npm test` stays offline. `scripts/test-api.mjs` requests a throwaway account on Atlas, approves it from the desk, redeems the code, checks a save and a conflict, then deletes that account. It refuses to write if the connected database is not `study-tracker`.
