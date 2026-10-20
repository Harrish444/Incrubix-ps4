# Reachline — Distribution Ops

Reachline is a simulation-first long-tail content distribution workspace built for the IncuBrix Assessment 4 brief.

## Current status
The repository started as an empty Vite React starter. The current build establishes the Reachline dashboard, the PostgreSQL/Supabase core schema, six connector manifests, and the beginning of the API contract. The assessment checklist is kept in `docs/IMPLEMENTATION_CHECKLIST.md`; unchecked items are not claimed as complete.

## Local setup
```bash
npm install
npm run build
npm run typecheck
npm run lint
```

The backend is configured for Node 20 and reads configuration from `.env`. Reachline uses `API_PORT=8787` so it does not collide with the hosted development service port. The combined development command starts the API and Vite together. Docker Compose, the complete connector runtime, worker, and test pack remain in progress and are tracked honestly in the checklist.

## Simulation safety
Simulation mode is the default. Simulated activity is visually labelled and must not be described as live certification. Tokens belong in environment variables or a secret store and must never be committed.
