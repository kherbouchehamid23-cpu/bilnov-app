#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bilnov - Correctif build : conflit de types Window.pannellum (TS2717).

Le build Vercel echoue avec :
  Type error: Subsequent property declarations must have the same type.
  Property 'pannellum' must be of type
    '{ viewer: (container: string | HTMLElement, config: object) => PannellumViewer; }',
  but here has type
    '{ viewer: (c: string | HTMLElement, cfg: object) => { destroy: () => void }; }'.

Cause : la page EDITEUR (tours/[tourId]/page.tsx) et la page VISITEUR
(tours/[tourId]/view/page.tsx) declarent toutes les deux `declare global {
interface Window { pannellum: ... } }` avec un type de retour de `viewer`
different. Next.js type-verifie tout le programme d'un bloc -> collision.

Correctif : on SUPPRIME la declaration en double dans la page VISITEUR.
La page VISITEUR herite alors de l'augmentation globale de la page EDITEUR
(retour PannellumViewer, qui possede `destroy` -> compatible avec l'usage
`instRef` typé `{ destroy: () => void }`). Aucune modif de la page editeur.

ADDITIF / idempotent. Rejouable sans risque. Aucun git push.
Usage : python 20_fix_pannellum_types.py --root <chemin-repo> [--no-build]
"""
import os, re, sys, subprocess

TARGET = "src/app/projects/[id]/tours/[tourId]/view/page.tsx"

# Bloc exact emis par 19_apply_tour_viewer_mode.py
OLD = (
    "\n\ndeclare global {\n"
    "  interface Window { pannellum: { viewer: (c: string | HTMLElement, cfg: object) => { destroy: () => void }; }; }\n"
    "}\n"
)
# Repli robuste si l'indentation/espacement a bouge : tout bloc
# `declare global { interface Window { pannellum: ... } }` de la page visiteur.
FALLBACK = re.compile(
    r"\n*declare global \{\s*interface Window \{ pannellum:[^\n]*\n\}\n",
    re.DOTALL,
)


def parse(a):
    root, build = ".", True
    i = 0
    while i < len(a):
        if a[i] == "--root":
            root = a[i + 1]; i += 2; continue
        if a[i] == "--no-build":
            build = False
        i += 1
    return root, build


def run(cmd, root):
    print("\n$", " ".join(cmd))
    r = subprocess.run(cmd, cwd=root)
    if r.returncode:
        print("!! echec (rc=%d)." % r.returncode); sys.exit(r.returncode)


def main():
    root, build = parse(sys.argv[1:])
    print("== Bilnov - correctif types Window.pannellum (TS2717) ==")
    p = os.path.join(root, TARGET)
    if not os.path.exists(p):
        print("!! introuvable:", TARGET); sys.exit(1)
    src = open(p, encoding="utf-8").read()

    if "declare global" not in src:
        print("  =  deja corrige (aucune declaration globale dans la page visiteur)")
    elif OLD in src:
        src = src.replace(OLD, "\n", 1)
        open(p, "w", encoding="utf-8").write(src)
        print("  ~  declaration en double supprimee (ancre exacte) :", TARGET)
    elif FALLBACK.search(src):
        src = FALLBACK.sub("\n", src, count=1)
        open(p, "w", encoding="utf-8").write(src)
        print("  ~  declaration en double supprimee (repli regex) :", TARGET)
    else:
        print("!! bloc `declare global` present mais non reconnu -> verifier a la main")
        sys.exit(2)

    # Garde-fou : plus aucune declaration Window.pannellum dans la page visiteur
    check = open(p, encoding="utf-8").read()
    if "declare global" in check:
        print("!! une declaration globale subsiste dans la page visiteur"); sys.exit(3)

    run(["npm", "run", "build"], root) if build else print("(build saute)")
    print("\nOK. Conflit resolu. Pense a git commit + push pour relancer Vercel.")


if __name__ == "__main__":
    main()
