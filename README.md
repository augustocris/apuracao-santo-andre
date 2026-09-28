# Apuração Eleitoral Paralela — Santo André

PWA for parallel ballot-box counting (fiscais scan BU QR codes; admin TV dashboard shows live results). Built with Next.js App Router, TypeScript, Tailwind CSS, Supabase, and a mock fallback for local demos without credentials.

## Quick start

```bash
npm install
cp .env.example .env.local   # optional — without Supabase keys the app uses mock data
npm run dev                  # http://127.0.0.1:43127 (webpack + allowedDevOrigins)
```

> Dev note: `next.config.ts` sets `allowedDevOrigins` for `127.0.0.1` / `localhost` so the client bundle hydrates when you open those hosts.

- Fiscal (mobile): [http://127.0.0.1:43127/fiscal](http://127.0.0.1:43127/fiscal)
- Admin telão + cadastro: [http://127.0.0.1:43127/admin](http://127.0.0.1:43127/admin)
- `/dashboard` redirects to `/admin`

## Environment

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | for production | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | for production | Supabase anon/public key |

If either variable is missing, the app runs in **mock mode**: in-memory locais, candidatos, config, and boletins so `/fiscal` and `/admin` remain fully demoable.

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Open the SQL editor and run, **in order**:
   - [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql) — tables, Realtime, seed Prefeito/Vereador
   - [`supabase/migrations/002_admin_config.sql`](supabase/migrations/002_admin_config.sql) — `apuracao_config`, cargos estaduais, realtime idempotente
3. Copy Project URL + anon key into `.env.local` (and Vercel env).
4. Confirm Realtime is enabled for `boletins_urna` (Database → Replication).

### Migration 002 (obrigatória após o deploy deste release)

Se o app já está no ar com só a `001`, rode a `002` manualmente no SQL Editor do Supabase. Sem ela, o cadastro admin cai em fallback e o progresso/relatório podem não sincronizar entre TVs.

### Segurança (demo)

As policies RLS seguem o estilo aberto da `001` (anon select/insert/update em config e candidatos). Adequado para demo interna; em produção restrinja writes (service role / auth admin).

## Cadastro admin (`/admin` → aba **Cadastro**)

1. **Candidatos** — cargos e dígitos:
   - Deputado Estadual → 5 dígitos (1)
   - Deputado Federal → 4 dígitos (1)
   - Senador → 3 dígitos (2)
   - Governador → 2 dígitos (1)
2. **Zonas / Seções** — total esperado e/ou “Zona X tem N seções” (gera `locais_votacao`). Progresso do telão = enviadas / esperadas.
3. **Relatório telão** — quais cargos aparecem no ranking/gráfico (`apuracao_config.relatorio_cargos` + localStorage).

## Fiscal flow

1. Open `/fiscal` on a phone (installable PWA).
2. Tap **Escanear** or **Colar Texto do BU**.
3. Parser extracts `ZONA`, `SECA/SECAO`, and votes; **only registered candidate numbers** are kept.
4. Confirmation shows zona, seção, número + nome + votos → **Enviar**.
5. Duplicate urnas return: *Urna já cadastrada anteriormente*.

Sample paste text is available via **Usar exemplo** on the paste tab.

## Admin telão

Dark high-contrast layout for TV:

- Progress: **enviadas / faltam** (vs `secoes_esperadas` do cadastro)
- Rankings + Recharts por cargo selecionado no relatório
- Live feed of latest BUs
- Supabase Realtime when configured; otherwise polling every ~4s

## Deploy (Vercel + Supabase)

1. Push to `main` — Vercel auto-deploys if the project is connected.
2. Ensure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set.
3. Run SQL migrations `001` then `002` on Supabase (002 is manual if already live).
4. Point fiscales to `/fiscal` and the telão to `/admin`.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- `html5-qrcode`, `recharts`, `lucide-react`, `@supabase/supabase-js`
- PWA: `public/manifest.webmanifest` + `public/sw.js`

## Project layout

```
src/app/fiscal                 Mobile fiscal UI
src/app/admin                  TV dashboard + Cadastro
src/components/admin/          Telão, cadastro, rankings
src/lib/cargos.ts              Digit rules per cargo
src/lib/parser/bu-qr.ts        BU QR parser
src/lib/data.ts                Supabase + mock data layer
supabase/migrations/           001 init · 002 admin config
```
