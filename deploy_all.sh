#!/usr/bin/env bash
set -euo pipefail
SCRIPTS="01_apply_cad_measure_tests 02_apply_cad_cursor_edit 03_apply_share_measure 04_apply_m1_comments 05_apply_m1_front"
echo "==> Preflight: verification des 5 scripts"
for s in $SCRIPTS; do
  test -f "$s.py" || { echo "MANQUANT: $s.py (glisser-deposer a la racine du repo)"; exit 1; }
  python3 -c "import ast; ast.parse(open('$s.py',encoding='utf-8').read())" 2>/dev/null \
    || { echo "CORROMPU: $s.py -> re-uploader par GLISSER-DEPOSER du fichier (pas copier-coller)"; exit 1; }
done
echo "OK preflight."
echo "==> 1/4 Application (sans build)"
for s in $SCRIPTS; do python3 "$s.py" --no-build; done
echo "==> 2/4 Migration base (additive, non destructive)"
npx prisma generate
npx prisma db push
echo "==> 3/4 Gate qualite BLOQUANT (tests + build)"
npm install
npm run test
npm run build
echo "==> 4/4 Publication (declenche Vercel)"
git add -A
git commit -m "feat(bilnov): L2 viewers + M1 commentaires unifies + vitest 53 tests"
git push
echo "OK. Deploiement declenche sur main."
