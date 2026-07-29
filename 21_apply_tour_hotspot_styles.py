#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bilnov - Correctif visuel : hotspots 360 invisibles.

Symptome : la photo panoramique s'affiche, mais les hotspots poses ne sont
jamais visibles et la navigation ne marche pas.

Cause : les hotspots sont crees avec une cssClass personnalisee
(`bilnov-dir` / `bilnov-info`). Quand on fournit une cssClass a Pannellum,
il N'APPLIQUE PLUS son sprite par defaut -> le <div> du hotspot n'a ni
taille ni fond -> 0x0, invisible (et donc non cliquable, d'ou l'absence de
navigation). Il faut fournir nous-memes le style de ces classes.

Correctif : on ajoute le CSS des pastilles dans le globals.css (importe par
le layout -> s'applique a l'editeur ET au visiteur). Additif, idempotent.

ADDITIF. Rejouable. Aucun git push.
Usage : python 21_apply_tour_hotspot_styles.py --root <chemin-repo> [--no-build]
"""
import os, sys, glob, subprocess

MARKER = "/* === Bilnov hotspots 360 (Pannellum) === */"

CSS = """

/* === Bilnov hotspots 360 (Pannellum) === */
/* Les hotspots utilisent une cssClass custom (bilnov-dir / bilnov-info) :
   Pannellum n'applique alors PAS son sprite par defaut, on style nous-memes. */
.pnlm-hotspot-base.bilnov-dir,
.pnlm-hotspot-base.bilnov-info {
  width: 32px;
  height: 32px;
  margin: -16px 0 0 -16px;
  border-radius: 9999px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  line-height: 1;
  font-weight: 700;
  color: #fff;
  border: 2px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
  transition: transform 0.15s ease;
  z-index: 10;
}
.pnlm-hotspot-base.bilnov-dir { background: rgba(124, 58, 237, 0.92); }
.pnlm-hotspot-base.bilnov-info { background: rgba(245, 158, 11, 0.92); }
.pnlm-hotspot-base.bilnov-dir::after { content: "\\2794"; }
.pnlm-hotspot-base.bilnov-info::after { content: "\\2139"; }
.pnlm-hotspot-base.bilnov-dir:hover,
.pnlm-hotspot-base.bilnov-info:hover { transform: scale(1.14); }
/* === fin Bilnov hotspots 360 === */
"""


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


def find_globals(root):
    prefer = os.path.join(root, "src", "app", "globals.css")
    if os.path.exists(prefer):
        return prefer
    hits = glob.glob(os.path.join(root, "src", "**", "globals.css"), recursive=True)
    hits += glob.glob(os.path.join(root, "**", "globals.css"), recursive=True)
    hits = [h for h in hits if "node_modules" not in h]
    return hits[0] if hits else None


def run(cmd, root):
    print("\n$", " ".join(cmd))
    r = subprocess.run(cmd, cwd=root)
    if r.returncode:
        print("!! echec (rc=%d)." % r.returncode); sys.exit(r.returncode)


def main():
    root, build = parse(sys.argv[1:])
    print("== Bilnov - styles hotspots 360 ==")
    css = find_globals(root)
    if not css:
        print("!! globals.css introuvable sous", root); sys.exit(1)
    rel = os.path.relpath(css, root)
    src = open(css, encoding="utf-8").read()
    if MARKER in src:
        print("  =  deja applique :", rel)
    else:
        open(css, "a", encoding="utf-8").write(CSS)
        print("  +  CSS hotspots ajoute :", rel)
    run(["npm", "run", "build"], root) if build else print("(build saute)")
    print("\nOK. Pastilles hotspots visibles. Pense a git commit + push.")


if __name__ == "__main__":
    main()
