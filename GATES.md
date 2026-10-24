# Gates: frontend bugfix pass

OWNS: client/src/**, client/public/**, client/scripts/**, docs/api-contract.md, GATES.md

Scope: four confirmed frontend bugs + TZ gaps (threshold T config, statement template) fixed; tsc, vite build, and eslint all pass.

- [x] G1: this ledger states outcomes that can fail
  CHECK: node C:/Users/Admin/AppData/Local/hermes/skills/team/unlazy/scripts/gate-lint.mjs GATES.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=7110ede1d88c1e6447ef2c79a9fceff8897f74547294451e4d420806f4e62903; exit=0; EXPECT=matched; output-sha256=48630b7361dd44ee870917b12c3d19b9d7bdea738aaca16bb04d4cab83b772d2; output-bytes=8; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\Admin\hacaton2026; path=ee3755371776/45 entries

- [x] G2: the 4 bug fixes are present in source (auth redirect state, calendar modal reset, dashboard refresh-error banner, payments error split)
  CHECK: node client/scripts/verify-bugfixes.mjs
  EXPECT: bugfix verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=23e9c43b24f41b8fcbbd5b084a4a3b0a7e47fecbb5bca5a402aeab8798e9af85; exit=0; EXPECT=matched; output-sha256=69df8089144b1a4ad4554939517f946a2c46216b46fe31c347d06f0fe4f005d5; output-bytes=316; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\Admin\hacaton2026; path=ee3755371776/45 entries

- [x] G3: the fixed project passes tsc, vite build, and eslint
  CHECK: node client/scripts/verify-build.mjs
  EXPECT: build verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=adcde182a77629b215f344cdde1be6d9567af47e3b862c5e472524159d784971; exit=0; EXPECT=matched; output-sha256=d0238d1ad77b79cc7d858c13f6e02b6e677ae2430ac144b456774e21616f4f00; output-bytes=92; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\Admin\hacaton2026; path=ee3755371776/45 entries

- [x] G4: TZ gaps closed: threshold T configurable (PATCH /user) + statement template on registration
  CHECK: node client/scripts/verify-tz-gaps.mjs
  EXPECT: tz gap fixes verified
  EVIDENCE: automatic-evidence=v1; definition-sha256=2e92a8cb4b0288572e223302117c9852133009ab30cc600e31fce956c5b2b2a5; exit=0; EXPECT=matched; output-sha256=6e58eaf77eb9ee16f9133e29a5b763c31bb87bf3f76f3619d141c17de3e1a2a2; output-bytes=409; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\Admin\hacaton2026; path=ee3755371776/45 entries

- [x] G5: remaining TZ mismatches fixed: nav 4 + menu on main, flame icons, loan rate on bank page, /history/:id
  CHECK: node client/scripts/verify-tz-p2.mjs
  EXPECT: tz p2 mismatches fixed
  EVIDENCE: automatic-evidence=v1; definition-sha256=1698e2b17b52454a08b8c58540d97f448e9adf6b17ab4c0212a8bda8305512da; exit=0; EXPECT=matched; output-sha256=cf459210b66e83244f9003924677086364af814cbd483b8b2ec15a926ceb7371; output-bytes=421; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\Admin\hacaton2026; path=ee3755371776/45 entries

- [x] G6: Figma design applied: dark/gray/green palette + Inter (via CSS) + wireframe structure restyled; tsc/build clean
  CHECK: node client/scripts/verify-design.mjs
  EXPECT: design pass verified
  EVIDENCE: manual-evidence=v1; check=node client/scripts/verify-design.mjs; exit=0; output="design pass verified (15/15 checks)"; visual=dev-server+stub-screenshots 390px (home/history/calendar dark verified, no light leftovers); tsc+build clean

- [x] G7: history donut readable + tooltip informative: slices distinguished (3 greens + 2 grays, separators), no empty-ring state in hidden tabs, tooltip shows category/amount/share%/total
  CHECK: node client/scripts/verify-history-pie.mjs
  EXPECT: history pie gate passed
  EVIDENCE: manual-evidence=v1; check=node client/scripts/verify-history-pie.mjs; exit=0; output="history pie gate passed (5/5 checks)"; visual=390px+1440px browser: 5 sectors rendered with distinct fills, per-slice tooltips verified (Доход 53%, Зарплата 21%, Платёж 12%, Прочее 1%, всего 858 000,00 ₽), no horizontal overflow at 390px; tsc+eslint clean

- [ ] G8: addendum (ТЗ-доп.): planned events + integrations + counterparty registries:
  Prisma PlannedEvent model; sync endpoints 1c/edo/tax-calendar/marketplace; tax calendar (ЕНП 30%/65k base, quarterly 6%/50% cap, demo floor 150k->180k);
  counterparty classification (12/99/66 high 0.75, 44/55/77 medium 0.45) + auto Risk; forecast de-dup tax + MC 21d delays; UI: IntegrationsPanel/PlannedEventsSection/PlannedEventModal/CounterpartyShield on Payments
  CHECK: node client/scripts/verify-addendum.mjs && npx vitest run (server/tests: plannedEvents + forecast)
  EXPECT: addendum checks 49/49 ok; backend tests all green
  EVIDENCE: verify-addendum.mjs 49/49 ok; server vitest 30/30 (plannedEvents.test.js 10 + forecast.test.js 13 + parser + anonymizer); live API: sync 1c/edo/tax-calendar/marketplace → 201 (2+2+4+1), planned-events summary {in 444500, out 2133081, taxes 1978081, highRiskIn 250000}, counterparty?inn=77******12 → high p=0.75, auto Risk 250000@0.75 created, contract 100k p=30% split into 30k prepay + 70k postpay, dashboard forecastSeries reasons type=planned present; UI headless 390px: IntegrationsPanel+section render, sync feedback "Синхронизировано", modal POST 201 + event shown; tsc/eslint/vite build clean; test events cleaned from dev.db
