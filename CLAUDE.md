# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Budget Tracker is a hybrid personal finance app: a React + TypeScript frontend wrapped with Capacitor for Android, backed by an Express.js API, with Firebase Firestore for data and Firebase Auth for Google Sign-In.

## Commands

### Frontend / Full Stack
```bash
npm install          # Install all dependencies
npm run dev          # Vite dev server on port 3000
npm run dev:backend  # Express backend on port 3001
npm run dev:all      # Both frontend and backend concurrently
npm run build        # Production Vite build (outputs to dist/)
npm run lint         # TypeScript type check (tsc --noEmit)
```

### Android
```bash
npx cap sync android                              # Sync web build to Android project
cd android && ./gradlew assembleRelease --no-daemon  # Build release APK
```

The CI pipeline (`.github/workflows/build-apk.yml`) runs: `npm run build` → `npx cap sync android` → `./gradlew assembleRelease`.

## Environment Variables

**Frontend** (`.env`, see `.env.example`):
- `VITE_API_URL` — URL of the Express backend

**Backend** (`backend/.env`, see `backend/.env.example`):
- `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL` — Firebase Admin SDK credentials

**CI secrets**: `GOOGLE_SERVICES_JSON` (base64 google-services.json), `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`.

## Architecture

### Layers
1. **React frontend** (`src/`) — all UI lives in a single `App.tsx` (~700 lines). State is managed with React hooks and memoization; no external state library.
2. **Express backend** (`backend/`) — REST API (`/api/transactions`) that proxies Firestore operations using the Firebase Admin SDK.
3. **Capacitor Android wrapper** (`android/`) — packages the built web app into an APK; uses the `@capacitor-firebase/authentication` plugin for native Google Sign-In.

### Data Flow
- The frontend calls `src/services/api.ts`, which hits the Express backend.
- The backend (`backend/routes/transactions.js`) reads/writes Firestore under `users/{uid}/transactions` and `users/{uid}/schedules`.
- Firebase Auth state is managed on the client via `onAuthStateChanged` in `src/services/firebase.ts`.

### Firestore Collections
```
users/{uid}/transactions/{docId}  — { amount, category, type, date, note, createdAt, updatedAt }
users/{uid}/schedules/{docId}     — { category, amount, dayOfMonth, note, lastProcessedDate }
```

### Key Files
| File | Role |
|------|------|
| `src/App.tsx` | Entire UI — forms, modals, charts, dark mode, auth state |
| `src/services/api.ts` | HTTP client for backend; passes Firebase ID token as Bearer |
| `src/services/firebase.ts` | Firebase init, Google Auth provider, Capacitor Auth integration |
| `backend/server.js` | Express app, CORS config, route mounting |
| `backend/routes/transactions.js` | CRUD endpoints for transactions and schedules |
| `backend/firebase.js` | Firebase Admin SDK lazy initialization |
| `capacitor.config.ts` | Capacitor app ID, server URL override for dev |

### Android Config
- Min SDK: 24, Target/Compile SDK: 36, AGP: 8.13.0, Gradle: 8.14.3, JDK: 21
- Signing config is in `android/app/build.gradle` using keystore at `android/app/release.keystore`

## Notable Patterns

- **Auth**: The frontend gets a Firebase ID token and sends it as `Authorization: Bearer <token>` to the backend, which verifies it with the Admin SDK to identify the user.
- **Auto-deductions**: Monthly recurring expenses are stored as `schedules` and processed by the backend when a user loads the app.
- **Single-file UI**: All React components, hooks, and logic are co-located in `src/App.tsx` rather than split into separate component files.
