# Apuração Antecipada — Santo André

PWA for parallel ballot-box counting (fiscais scan BU QR codes; admin TV dashboard shows live results). Built with Next.js App Router, TypeScript, Tailwind CSS, Supabase, and a mock fallback for local demos without credentials.

The **`/telao`** view is the public TV screen: compact header (**Apuração Antecipada - Santo André**), slim Enviadas/Faltam + % Progresso bars, and five cargo cards (Dep. Estadual, Dep. Federal, Senador 1, Senador 2, Governador). Photos sit on the right at card height with a 3:4 proportion (`object-contain`). Dep. Estadual/Federal celebrate vote milestones (50 mil / 100.000 / 150.000 / +10 mil) with confetti. No PIN.

**`/admin`** is the operator panel only (Cadastro, Digitar BU), behind PIN **Acesso admin**. Only Cristiano’s pin (`apuracao_config.chefe_pin`, fallback `andre2026`) unlocks it — other `chefes` PINs stay on `/chefe`. Session lives in `sessionStorage` until **Sair**. Link **Abrir telão** → `/telao`. **BUs pendentes** abre `/admin/pendentes` e **BUs recebidas** abre `/admin/bus-recebidas` (nova aba, mesmo PIN). As duas rotas pintam o cabeçalho na hora; o fetch tem timeout e não baixa o catálogo.

## Quick start

```bash
npm install
cp .env.example .env.local   # optional — without Supabase keys the app uses mock data
npm run dev                  # http://127.0.0.1:43127 (webpack + allowedDevOrigins)
```

> Dev note: `next.config.ts` sets `allowedDevOrigins` for `127.0.0.1` / `localhost` so the client bundle hydrates when you open those hosts.

- Fiscal (mobile, só QR): [http://127.0.0.1:43127/fiscal](http://127.0.0.1:43127/fiscal)
- Telão (TV, público): [http://127.0.0.1:43127/telao](http://127.0.0.1:43127/telao)
- Admin (cadastro, pendentes, Digitar BU, PIN `andre2026`): [http://127.0.0.1:43127/admin](http://127.0.0.1:43127/admin)
- BUs pendentes (mesmo PIN, nova aba): [http://127.0.0.1:43127/admin/pendentes](http://127.0.0.1:43127/admin/pendentes)
- BUs recebidas (mesmo PIN, nova aba): [http://127.0.0.1:43127/admin/bus-recebidas](http://127.0.0.1:43127/admin/bus-recebidas)
- `/dashboard` redirects to `/telao`

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
   - [`supabase/migrations/003_candidatos_storage.sql`](supabase/migrations/003_candidatos_storage.sql) — bucket Storage `candidatos` (fotos públicas) + policies
   - [`supabase/migrations/004_bu_completo.sql`](supabase/migrations/004_bu_completo.sql) — `candidatos.origem` (`cadastro`/`bu`) + função `ingest_bu_completo`
   - [`supabase/migrations/005_chefe_pin.sql`](supabase/migrations/005_chefe_pin.sql) — PIN `/chefe` + ingest sem default Governador
   - [`supabase/migrations/006_catalogo_origem.sql`](supabase/migrations/006_catalogo_origem.sql) — `origem=catalogo` na tabela `candidatos` (chapada; **sem tabela nova**)
   - [`supabase/migrations/007_favorito.sql`](supabase/migrations/007_favorito.sql) — `candidatos.favorito` (legado; o `/chefe` não usa mais)
   - [`supabase/migrations/008_sq_candidato.sql`](supabase/migrations/008_sq_candidato.sql) — `candidatos.sq_candidato` opcional (fotos de urna TSE)
   - [`supabase/migrations/009_fiscal_domingo.sql`](supabase/migrations/009_fiscal_domingo.sql) — `whatsapp_suporte`, fila `bus_pendentes`, realtime idempotente (sem 42710), `secoes_esperadas=1744` só se ainda for 0
   - [`supabase/migrations/010_zona_allowlist.sql`](supabase/migrations/010_zona_allowlist.sql) — allowlist das 6 zonas de Santo André no ingest
   - [`supabase/migrations/011_chefes_favoritos.sql`](supabase/migrations/011_chefes_favoritos.sql) — tabelas `chefes` + `chefe_favoritos`; seed Cristiano / `andre2026`
   - [`supabase/migrations/012_sq_candidato_fotos.sql`](supabase/migrations/012_sq_candidato_fotos.sql) — garante `candidatos.sq_candidato` (idempotente com a 008) para casar fotos de urna
3. Copy Project URL + anon key into `.env.local` (and Vercel env).
4. Confirm Realtime is enabled for `boletins_urna` (Database → Replication).

### Migration 002 (obrigatória após o deploy deste release)

Se o app já está no ar com só a `001`, rode a `002` manualmente no SQL Editor do Supabase. Sem ela, o cadastro admin cai em fallback e o progresso/relatório podem não sincronizar entre TVs.

### Migration 004 (ingestão completa do BU)

Necessária para gravar **todos** os candidatos que receberam votos na urna (não só os 5 oficiais). Sem ela, o scan ainda tenta o insert cliente-a-cliente; candidatos descobertos só entram se a coluna `origem` existir. Cole o SQL no Editor (a Vercel não roda migrations).

- `candidatos.origem`: `cadastro` (CRUD admin / telão) ou `bu` (descoberto no QR/foto)
- Unique `(zona, secao, candidato_id)` permanece — urna duplicada é bloqueada no fluxo featured **e** no ingest completo
- QR oficial do TSE em geral **não traz nomes** — o app grava `Candidato {numero}` até um edit/import posterior

### Migration 003 (fotos de candidatos)

Necessária para upload de foto no Cadastro → Candidatos. Sem o bucket, ainda dá para colar uma URL pública em `foto_url`. O SQL cria o bucket público `candidatos` (máx. 2 MB, JPEG/PNG/WebP/GIF) com policies de leitura/escrita anon (mesmo estilo demo das migrations anteriores).

### Segurança (demo)

As policies RLS seguem o estilo aberto da `001` (anon select/insert/update em config e candidatos). Adequado para demo interna; em produção restrinja writes (service role / auth admin).

## Cadastro admin (`/admin` → aba **Cadastro**)

1. **Ranking geral** — tabela de todos os candidatos com votos + **Candidatos no banco** (inclui catálogo com 0 votos). Não altera o telão de 5 cards.
2. **Candidatos** — 5 oficiais do telão + **Importar chapada** (CSV do TSE `consulta_cand` **ou** `numero,nome,cargo`) → `origem=catalogo`. Não sobrescreve nomes oficiais. Depois: **Enviar ZIP de fotos de urna** (arquivos tipo `FSP{SQ}_div.jpg` / `FBR{SQ}_div.jpg`, `{SQ}_div.jpg` ou `FSP{SQ}.jpg` / `FBR{SQ}.jpg`, processado no navegador → bucket `candidatos`).
   - TSE **SP** (`consulta_cand_2026_SP`): cargos estaduais; filtro `SG_UF` SP. **Não traz Presidente** (é nacional).
   - TSE **Brasil/Presidente**: importe também o CSV com `SG_UF=BR` e `DS_CARGO=PRESIDENTE`. Dois arquivos são aceitos (upsert). Presidente entra com UF BR ou vazia.
   - Colunas: `NR_CANDIDATO`, `NM_URNA_CANDIDATO` (fallback `NM_CANDIDATO`), `DS_CARGO`, `SQ_CANDIDATO` (número ou texto do Excel, ex. `250000252653` / `2.50000252653E+11`). Vice/suplente/prefeito/vereador ignorados.
   - Fotos no Storage: **Vincular** lista **todos** os objetos do bucket `candidatos` e mostra `Vistos N · vinculadas M`. Casa `FSP2500002530091_div.jpg` / `FBR…_div.jpg` (pasta opcional) com `sq_candidato` como string de dígitos. **ZIP no bucket não vale** — precisa dos JPGs. No Cadastro → Candidatos o campo visível **Enviar ZIP de fotos de urna** (`<input type="file" accept=".zip">`) fica acima da dobra: ao escolher o arquivo pinta **Lendo ZIP…** no mesmo `onChange` (antes do JSZip). Depois `Lidos N de ~26331` e `Enviada(s) M · falhas K`. Input vazio = **Nenhum arquivo**. Erro vai ao banner vermelho. Não use Vincular para o ZIP. Oficiais do telão com `foto_url` não são sobrescritos. SQ no CSV: header `SQ_CANDIDATO` ou coluna E.
   - Simplificado: `supabase/seed-chapada-exemplo.csv`. TSE SP de exemplo: `supabase/seed-consulta-cand-exemplo.csv`. TSE BR: `supabase/seed-consulta-cand-br-exemplo.csv`.
   - Deputado Estadual → 5 dígitos (1)
   - Deputado Federal → 4 dígitos (1)
   - Senador → 3 dígitos (2)
   - Governador → 2 dígitos (1)
   - **Foto** — upload para Storage `candidatos` ou URL pública → `candidatos.foto_url` (coluna direita no telão)
3. **Zonas / Seções** — total esperado e/ou “Zona X tem N seções” (gera `locais_votacao`). Progresso do telão = enviadas / esperadas.
4. **Relatório telão** — quais cargos aparecem no ranking/gráfico (`apuracao_config.relatorio_cargos` + localStorage).
5. **Acessos chefe** — lista, adiciona (nome + PIN) e exclui. Seed: Cristiano / `andre2026`. Não invente PINs extras no SQL.

### Migration 011 (favoritos por PIN)

Cole [`supabase/migrations/011_chefes_favoritos.sql`](supabase/migrations/011_chefes_favoritos.sql) no SQL Editor. Cria `chefes` + `chefe_favoritos`, seeds Cristiano/`andre2026` e sincroniza `apuracao_config.chefe_pin` se estiver vazio. Sem ela, o PIN legado ainda entra; as estrelas não gravam.

Para um segundo PIN: `/admin` → Cadastro → **Acessos chefe** → nome + PIN exclusivo → Adicionar.

## Chefe (`/chefe`)

PIN por pessoa (`andre2026` = Cristiano no seed). Cadastro → **Acessos chefe** lista / adiciona / exclui (nome + PIN). Header numa linha: **Chefe · Ranking geral · Bom dia/tarde/noite, {nome} · Sair** (Telão miúdo se couber). Barra com **exatamente quatro** pins — Governador **Tarcísio (nº 10)** e **Fernando Haddad (nº 13)**; Presidente **Lula** e **Flávio**. Desktop: chips compactos + 3 colunas (catálogo inteiro do cargo, busca sem acento, sort; favoritos do PIN no topo). Mobile: pins maiores (2×2), pinch-zoom liberado, filtro **Todos / Dep. Estadual / Dep. Federal / Senador** (o cargo escolhido sobe; os outros na ordem estadual→federal→senador). Sem busca, cada bloco lista **favoritos do PIN + 10 mais votados**. Com **Nome ou número**, a busca usa o **catálogo inteiro daquele cargo** (acento-insensível: Andr → ANDRÉ), até 50 resultados — não só o top 10. Cada campo fica no bloco do cargo. Fotos dos pins vêm de `foto_url`. Exige migration `011`. Não substitui o telão (`/telao`).

## Fiscal flow (domingo)

1. Abra `/fiscal` no celular (PWA). **Só QR** — sem digitação e sem colar texto. Sem telão/realtime em segundo plano. Câmera só depois de **Filmar o QR**; solta ao enviar, parar ou ir para segundo plano.
2. Tela inicial: título **Apuração Santo André**, a linha **Clique abaixo e Filme o QRCODE da BU.** e o botão verde **Filmar o QR**. Sem badge Fonte SUPABASE/MOCK.
3. BUs com **N QRs** (`1 de 2`, `01/04`…`04/04`, `---------- 02 / 04 ----------`, SEQL/ORQR) **não gravam** até o último. A câmera **continua aberta** depois do 1º. No decode aparece **QR lido 1/N**. Se o 2º entrar antes, fica guardado e pede o 1º. Liga por IDUE/NR_UE, não HASH. **BU errada** só quando o IDUE é de outra urna. O visor precisa ter tamanho real (não 0×0); se o html5-qrcode não amostrar o frame, um segundo passe lê o `<video>` pelos pixels intrínsecos.
4. Confirmação: **Confirme a zona = …, seção = …**, votos de **um** candidato oficial da campanha que apareceu neste BU (se nenhum dos 5, um candidato parseado). Botão **Enviar**. Opcional: **Filmar de novo**. Sem edição de votos.
5. Depois da confirmação do servidor: **Zona … seção … enviada com sucesso. Vá para a próxima.** A tela volta sozinha ao idle em ~4 s.
6. Duplicata `(zona, seção)` = **já enviada**. Zona fora de `zonas_config` = **Zona não é de Santo André** (não é erro de câmera; não grava). Parser recusou → texto bruto vai para `/admin/pendentes`.
7. Se a câmera não ler: **Foto do QR** tira foto e **decodifica** o QR. Se ainda falhar, **Foto no WhatsApp** manda o arquivo à central (`navigator.share` / Compartilhar / Baixar + `wa.me`).
8. Digitação fica em `/admin` → **Digitar BU**, atrás do PIN do admin (`andre2026`).

WhatsApp da central: campo `whatsapp_suporte` em `apuracao_config`, editável no Cadastro. Vazio = “peça o WhatsApp à central”. O badge **Fonte: Supabase** vs **Fonte: MOCK** continua só no Cadastro admin.

## Telão (`/telao`)

Paleta campanha (navy `#003B7E` / ciano `#00ADEF` / amarelo `#FFDE00`) para TV. **Público, sem PIN.**

- Progress: **enviadas / faltam** (vs `secoes_esperadas` do cadastro)
- Cards compactos: texto à esquerda, **foto proporcional à direita** (altura do card, 3:4, `object-contain`; sem foto → número). Nome em até 2 linhas. **Votos e % cabem inteiros** no miolo (não cortam no fundo do card).
- Marcos Dep. Estadual/Federal: confete só quando o voto **cruza** o limiar ao vivo; marcos já celebrados ficam em `sessionStorage` (não repetem ao reabrir o telão)
- Supabase Realtime when configured (one channel, reconnect with backoff). Polling 12–15s only if Realtime is down **and** the first fetch already succeeded; until then, retry every 4s. `/telao` and `/chefe` pintam na hora (cards/pins vazios) e o fetch tem timeout de 8s. `/fiscal` does not subscribe. Close extra `/telao` `/chefe` `/admin` tabs on Sunday.

## Deploy (Vercel + Supabase)

1. Push to `main` — Vercel auto-deploys if the project is connected.
2. Ensure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set for **Production**, then **Redeploy** (env changes need a new build for `NEXT_PUBLIC_*`).
3. Open `/admin` — header must show **modo supabase** (not mock). Cadastro badge: **Fonte: Supabase**.
4. Run SQL migrations `001` … `012` on Supabase. **010 é a allowlist das 6 zonas** (`ingest_bu_completo` recusa zona fora; seed só se `zonas_config` estiver vazio). **011** é acessos chefe + favoritos por PIN. **012** (ou **008**) é `sq_candidato` para fotos de urna. **009** é WhatsApp + fila de erro. A Vercel não executa SQL.
5. Point fiscales to `/fiscal`, telão to `/telao` (público), admin to `/admin` (PIN do Cristiano: `apuracao_config.chefe_pin` ou `andre2026`; outros PINs da tabela `chefes` não entram), chefe to `/chefe` (PIN por pessoa). Favoritos no ranking do chefe exigem a 011.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- `html5-qrcode`, `recharts`, `lucide-react`, `@supabase/supabase-js`
- PWA: `public/manifest.webmanifest` + `public/sw.js`

## Project layout

```
src/app/fiscal                 Mobile fiscal UI
src/app/telao                  TV pública (5 cards)
src/app/admin                  Painel: cadastro, Digitar BU
src/app/admin/pendentes        Fila de BUs que o parser recusou
src/app/admin/bus-recebidas    Relatório de urnas já recebidas (zona+seção)
src/components/admin/          Telão (5 slots + milestones), cadastro
src/lib/milestones.ts          Thresholds / PT-BR labels for confetti
src/lib/cargos.ts              Digit rules per cargo
src/lib/parser/bu-qr.ts        BU QR + BU impresso (OCR colado)
src/lib/parser/fixtures/       Dump TSE SIMULADO (ground-truth)
src/lib/data.ts                Supabase + mock data layer
supabase/migrations/           001–010 (010 = allowlist zonas Santo André)
supabase/seed-chapada-exemplo.csv
supabase/seed-consulta-cand-exemplo.csv
```
