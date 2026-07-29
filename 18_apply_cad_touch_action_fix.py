#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bilnov - Fix tactile DWG (suite) : conflit geste 2 doigts (zoom/pan).

Apres le script 17 (1 doigt = curseur, plan fixe), le curseur marche bien,
mais le geste a DEUX doigts pose probleme : plan qui disparait / sort de la
zone, zoom instable, points poses involontairement.

CAUSE RACINE (verifiee dans dxf-viewer 1.0.47) : AUCUN `touch-action` n'est
pose (ni OrbitControls, ni DxfViewer, ni le conteneur du viewer). Sur mobile,
le navigateur declenche donc son PROPRE pinch-zoom / pan en meme temps
qu'OrbitControls -> DOUBLE transformation -> le plan saute / disparait / le
zoom devient instable. C'est la section "Prevention des comportements du
navigateur" du cahier des charges.

NB : la machine a etats cote CURSEUR demandee par le cahier des charges
(1 doigt = curseur ; 2 doigts = navigation, curseur suspendu, aucun point
pose, mesure preservee, attente du relachement complet de tous les doigts)
est DEJA implementee par le script 17 (drapeau `multi`, garde `!multi` avant
tout commit, reset uniquement quand active.size===0). Le seul trou restant
etait la navigation geree en double par le navigateur.

CORRECTIF (minimal, sur) : poser `touch-action: none` sur le conteneur du
viewer ET sur le canvas dxf-viewer -> seul OrbitControls gere le geste,
plus de double transformation. Effet de bord positif : moins de
`pointercancel` parasites -> taps a 1 doigt plus fiables (moins de points
involontaires).

ADDITIF / idempotent. Aucun git push.
Usage : python 18_apply_cad_touch_action_fix.py --root <chemin-repo> [--no-build]
"""
import os, sys, subprocess

TARGET = "src/components/CadViewer.tsx"

EDITS = [
    (
        "touch-action conteneur",
        "'crosshair', touchAction: 'none'",   # sentinelle deja-applique
        "<div ref={containerRef} className=\"flex-1 bg-white\" style={{ cursor: tool === 'pan' ? 'default' : 'crosshair' }} />",
        "<div ref={containerRef} className=\"flex-1 bg-white\" style={{ cursor: tool === 'pan' ? 'default' : 'crosshair', touchAction: 'none' }} />",
    ),
    (
        "touch-action canvas dxf-viewer",
        "GetCanvas?.()",                       # sentinelle deja-applique
        "        viewerRef.current = viewer;\n"
        "        await viewer.Load({ url, fonts: ['/cad/DejaVuSans.ttf'] });\n",
        "        viewerRef.current = viewer;\n"
        "        // §mobile : le navigateur ne doit jamais gerer le pinch/pan en meme temps qu'OrbitControls\n"
        "        try { const cv = viewer.GetCanvas?.(); if (cv) cv.style.touchAction = 'none'; } catch { /* noop */ }\n"
        "        await viewer.Load({ url, fonts: ['/cad/DejaVuSans.ttf'] });\n",
    ),
]


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
    print("== Bilnov - fix tactile DWG : touch-action (geste 2 doigts) ==")
    p = os.path.join(root, TARGET)
    if not os.path.exists(p):
        print("!! introuvable:", TARGET); sys.exit(1)
    src = open(p, encoding="utf-8").read()

    for name, sentinel, old, new in EDITS:
        if sentinel in src:
            print("  =  deja applique :", name); continue
        if old not in src:
            print("!! ANCRE KO:", name, "-> le fichier a change, verifier a la main"); sys.exit(2)
        src = src.replace(old, new, 1)
        print("  ~  patche :", name)

    open(p, "w", encoding="utf-8").write(src)
    run(["npm", "run", "build"], root) if build else print("(build saute)")
    print("\nOK. Plus de double gestion du geste 2 doigts. git commit + push pour deployer.")


if __name__ == "__main__":
    main()
