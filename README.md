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

R2 uses the same bucket (`dsa-mastery-media`). Objects are stored under `study/{userId}/`. The bucket is public-read, same as DSAMantra photos: links are unlisted, not private. If `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` are empty, the ledger still works and uploads explain that storage is not configured.

## Deploy

```bash
npx vercel
```

Set these environment variables on the Vercel project (the R2 account, bucket, and public URL are already in `vercel.json`):

- `AUTH_SECRET` — a long random string, different from DSAMantra
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

`npm test` stays offline. `scripts/test-api.mjs` registers a throwaway account on Atlas, checks a save and a conflict, then deletes that account. It refuses to write if the connected database is not `study-tracker`.
