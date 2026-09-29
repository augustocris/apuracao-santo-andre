# Apuração Antecipada — Santo André

PWA for parallel ballot-box counting (fiscais scan BU QR codes; admin TV dashboard shows live results). Built with Next.js App Router, TypeScript, Tailwind CSS, Supabase, and a mock fallback for local demos without credentials.

The `/admin` **Telão** view is built for a single TV viewport: compact header (**Apuração Antecipada - Santo André**), slim Enviadas/Faltam + % Progresso bars, and five cargo cards (Dep. Estadual, Dep. Federal, Senador 1, Senador 2, Governador). Dep. Estadual/Federal celebrate vote milestones (50 mil / 100.000 / 150.000 / +10 mil) with confetti.

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

If either variable is missing, the app runs in **mock mode** (in-memory only — nothing is written to Supabase). On Vercel/production the mock store starts **empty** (no ghost seed candidatos); local `next dev` still seeds demo data unless `NEXT_PUBLIC_ALLOW_MOCK_SEED=false`.

In `/admin` → Cadastro the badge **Fonte: Supabase** vs **Fonte: MOCK** shows the active source.

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
2. Tap **Escanear** (QR) or **Digitar** (formulário manual: zona, seção e votos).
3. QR parser aceita formato TSE oficial (`4545:11`), `CAND/QTVO`, `CANDIDATO/VOTOS` e linhas do BU impresso (`Nome  17  0103`); casa só com números cadastrados (zeros à esquerda ok). Sem match: mensagem lista os cadastrados. O formulário **Digitar** lista cadastrados por cargo.
4. Confirmation shows zona, seção, número + nome + votos → **Enviar**.
5. Duplicate urnas return: *Urna já cadastrada anteriormente* (pre-check + UNIQUE).

## Admin telão

Dark high-contrast layout for TV:

- Progress: **enviadas / faltam** (vs `secoes_esperadas` do cadastro)
- Rankings + Recharts por cargo selecionado no relatório
- Live feed of latest BUs
- Supabase Realtime when configured; otherwise polling every ~4s

## Deploy (Vercel + Supabase)

1. Push to `main` — Vercel auto-deploys if the project is connected.
2. Ensure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set for **Production**, then **Redeploy** (env changes need a new build for `NEXT_PUBLIC_*`).
3. Open `/admin` — header must show **modo supabase** (not mock). Cadastro badge: **Fonte: Supabase**.
4. Run SQL migrations `001` then `002` on Supabase (002 is manual if already live; includes `candidatos_delete_anon`).
5. Point fiscales to `/fiscal` and the telão to `/admin`.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- `html5-qrcode`, `recharts`, `lucide-react`, `@supabase/supabase-js`
- PWA: `public/manifest.webmanifest` + `public/sw.js`

## Project layout

```
src/app/fiscal                 Mobile fiscal UI
src/app/admin                  TV dashboard + Cadastro
src/components/admin/          Telão (5 slots + milestones), cadastro
src/lib/milestones.ts          Thresholds / PT-BR labels for confetti
src/lib/cargos.ts              Digit rules per cargo
src/lib/parser/bu-qr.ts        BU QR parser
src/lib/data.ts                Supabase + mock data layer
supabase/migrations/           001 init · 002 admin config
```
