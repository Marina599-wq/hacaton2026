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
