# unique-seb — SEED-IT Rebuilt Platform

Clean, ground-up rebuild of the **SEED-IT Admin Hub** and **SEED-SEB Assessment Client** adhering strictly to the **SEED-IT Master Canonical Field Contract**.

---

## 📦 Projects in this Repository

### 1. `seed-admin` (SEED-IT Admin Hub)
- **Framework**: TanStack Start / React 19 / Vite / TailwindCSS
- **Purpose**: Unified multi-tenant administration, course & series hierarchy management, assessment authoring, live proctor monitoring, cohort module assignments, and PDF/Excel/CSV institutional analytics reporting.
- **Port**: `http://localhost:3000`

### 2. `seed-seb` (SEED-SEB Assessment Client)
- **Framework**: TanStack Start / React / Vite / Cloudflare Nitro
- **Purpose**: High-integrity student assessment sandbox, multi-section exams (MCQ, Coding, Spoken English), AI proctoring (visual + acoustic), desktop safe exam browser lockdown integration, real-time code evaluation, and student progress tracking.
- **Port**: `http://localhost:3000` (frontend: `seed-seb/frontend`)

---

## 🛡️ SEED-IT Master Canonical Field Contract

Both applications strictly adhere to the single canonical schema with zero alias mappings, zero normalizer layers, and zero fallback chains (`||` / `??`):

- **User Identity**: `users/{uid}` (all fields camelCase: `email`, `name`, `rollNumber`, `tenantId`, `college`, `cohortId`, `year`, `department`, `role`, `isPremium`, `seedCredits`, `photoURL`).
- **Results**: `assessmentResults/{tenantId}/{assessmentId}/{uid}` with authoritative scores (`totalScore`, `maxScore`, `percentage`, `passed`).
- **Attempts**: Deterministic format `${assessmentId}_${uid}_${startEpochMs}`.
- **Coding Content**: Strict schema with `questionId`, `title`, `slug`, `content.sampleTestCases[].output`, `testCases.hidden[].expectedOutput`, and `boilerPlates`.

---

## 🛠️ Build & Run Instructions

### Admin Hub (`seed-admin`)
```bash
cd seed-admin
npm install
npm run dev     # Development server
npm run build   # Production Cloudflare / Nitro build
```

### SEB Assessment Client (`seed-seb/frontend`)
```bash
cd seed-seb/frontend
npm install
npm run dev     # Development server
npm run build   # Production Cloudflare / Nitro build
```
