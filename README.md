# NOVA — Career Skill Tree (v0.2)

This version is designed to be **upload-friendly** for ChatGPT review:
- **Only 8–9 core files**
- All app logic is inside `src/App.tsx`

## Run (Codespaces / local)
```bash
npm install
npm run dev
```

Then open forwarded port **5173**.

## What’s included
- Radial tree from a central node outward
- Locked nodes shaded until qualified
- Search + category filtering + node detail panel
- Custom node builder (localStorage) + import/export JSON
- Resume builder (auto pulls selected skills/credentials) + copy/download
- Resources page (links)

## If you need to upload files to ChatGPT (limit 10)
Upload:
1) `src/App.tsx`
2) `src/theme.css`
3) `package.json`
4) `vite.config.ts`
5) `src/main.tsx`
6) `index.html`
7) `tsconfig.json`
8) `tsconfig.node.json`
9) `README.md` (optional)


## Deploy (GitHub Pages)
1) Push to `main`.
2) In GitHub: Settings → Pages → **Build and deployment** → Source: **GitHub Actions**.
3) The included workflow will build and publish `dist` automatically.
