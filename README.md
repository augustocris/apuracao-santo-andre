# Apuração Eleitoral Paralela — Santo André

PWA for parallel ballot-box counting (~140 fiscales scan BU QR codes; admin TV dashboard shows live results). Built with Next.js App Router, TypeScript, Tailwind CSS, Supabase, and a mock fallback for local demos without credentials.

## Quick start

```bash
npm install
cp .env.example .env.local   # optional — without Supabase keys the app uses mock data
npm run dev                  # http://127.0.0.1:43127 (webpack + allowedDevOrigins)
```

> Dev note: `next.config.ts` sets `allowedDevOrigins` for `127.0.0.1` / `localhost` so the client bundle hydrates when you open those hosts.

- Fiscal (mobile): [http://127.0.0.1:43127/fiscal](http://127.0.0.1:43127/fiscal)
- Admin telão: [http://127.0.0.1:43127/admin](http://127.0.0.1:43127/admin)
- `/dashboard` redirects to `/admin`

## Environment

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | for production | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | for production | Supabase anon/public key |

If either variable is missing, the app runs in **mock mode**: in-memory locais, candidatos, and boletins so `/fiscal` and `/admin` remain fully demoable.

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Open the SQL editor and run [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql).
   - Creates `locais_votacao`, `candidatos`, `boletins_urna`
   - Enables Realtime on `boletins_urna`
   - Adds demo-friendly RLS (anon select/insert)
   - Seeds sample schools + Prefeito/Vereador candidates for Santo André
3. Copy Project URL + anon key into `.env.local`.
4. Confirm Realtime is enabled for `boletins_urna` (Database → Replication).

### Import helpers

```bash
# JSON array
curl -X POST http://127.0.0.1:43127/api/import-locais \
  -H 'Content-Type: application/json' \
  -d '[{"zona":"006","secao":"0050","nome_escola":"EMEF Exemplo","bairro":"Centro"}]'

# CSV text
curl -X POST http://127.0.0.1:43127/api/import-locais \
  -H 'Content-Type: text/csv' \
  --data-binary $'zona,secao,nome_escola,bairro\n006,0051,EMEF Exemplo 2,Centro'

curl -X POST http://127.0.0.1:43127/api/import-candidatos \
  -H 'Content-Type: application/json' \
  -d '[{"numero":"55","nome":"Exemplo","cargo":"Prefeito"}]'
```

## Fiscal flow

1. Open `/fiscal` on a phone (installable PWA).
2. Tap **Escanear Boletim de Urna (BU)** or use **Colar Texto do BU**.
3. Parser extracts `ZONA`, `SECA/SECAO`, and `CAND… QTVO…` / `CANDIDATO… VOTOS…`.
4. Confirmation modal shows school + votes → **Confirmar e Transmitir Votos**.
5. Duplicate urnas return: *Urna já cadastrada anteriormente*.

Sample paste text is available via **Usar exemplo** on the paste tab.

## Admin telão

Dark high-contrast layout for TV:

- Progress: urnas apuradas / total seções (`count` of `locais_votacao`)
- Rankings + Recharts bar chart (Prefeito)
- Live feed of latest BUs (pulse on new inserts)
- Supabase Realtime when configured; otherwise polling every ~4s (also as fallback)

## Deploy (Vercel + Supabase)

1. Push this repo and import it in Vercel.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Run the SQL migration on Supabase.
4. Deploy. Point fiscales to `/fiscal` and the telão to `/admin`.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- `html5-qrcode`, `recharts`, `lucide-react`, `@supabase/supabase-js`
- PWA: `public/manifest.webmanifest` + `public/sw.js`

## Project layout

```
src/app/fiscal          Mobile fiscal UI
src/app/admin           TV dashboard
src/app/api/import-*    Upsert locais / candidatos
src/lib/parser/bu-qr.ts BU QR parser
src/lib/data.ts         Supabase + mock data layer
supabase/migrations/    SQL schema + seed
```
