#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bilnov - Fix tactile DWG : a UN doigt, le curseur de mesure ET le plan
se deplacent en meme temps (conflit).

CAUSE RACINE (verifiee dans dxf-viewer 1.0.47) :
- dxf-viewer configure OrbitControls avec `controls.touches.ONE = TOUCH.PAN`
  => UN doigt = PAN du plan.
- OrbitControls gere le tactile via des evenements *touch* (touchstart/
  touchmove sur le canvas) ; le cas `touch` de onPointerDown est `// TODO`.
- Or le garde-fou actuel de CadViewer n'intercepte que les evenements
  *pointer* (pointerdown/move/up). Il deplace donc le curseur, mais ne bloque
  PAS le pan tactile d'OrbitControls => les deux bougent ensemble.

CORRECTIF (minimal, sur) : ajouter un garde-fou *touch* en phase capture sur
le conteneur. En mode placement (measure/area/quick/annotate) :
- 1 doigt  -> stopPropagation + preventDefault => OrbitControls ne panne pas,
             seul le curseur (garde pointer existant) bouge ;
- >=2 doigts -> laisse passer => navigation native (pan + zoom) intacte.
On NE touche PAS au 2-doigts ni au mode 'pan' (1 doigt y panne normalement).

ADDITIF / idempotent (sentinelle `touchGuard`). Rejouable. Aucun git push.
Usage : python 17_apply_cad_touch_pan_fix.py --root <chemin-repo> [--no-build]
"""
import os, sys, subprocess

TARGET = "src/components/CadViewer.tsx"
SENTINEL = "touchGuard"

EDITS = [
    (
        "ajout garde-fou touch",
        "    cont.addEventListener('pointercancel', cancel, cap);\n",
        "    cont.addEventListener('pointercancel', cancel, cap);\n"
        "    // §mobile : OrbitControls (dxf-viewer) panne le plan via les evenements TOUCH,\n"
        "    // pas via pointer -> on bloque le tactile a 1 doigt en mode placement.\n"
        "    const capNP = { capture: true, passive: false } as AddEventListenerOptions;\n"
        "    const touchGuard = (e: TouchEvent) => {\n"
        "      if (!placement() || e.touches.length >= 2) return;   // >=2 doigts : navigation native\n"
        "      e.stopPropagation(); if (e.cancelable) e.preventDefault();\n"
        "    };\n"
        "    cont.addEventListener('touchstart', touchGuard, capNP);\n"
        "    cont.addEventListener('touchmove', touchGuard, capNP);\n",
    ),
    (
        "nettoyage garde-fou touch",
        "cont.removeEventListener('pointercancel', cancel, cap); };",
        "cont.removeEventListener('pointercancel', cancel, cap); "
        "cont.removeEventListener('touchstart', touchGuard, capNP); "
        "cont.removeEventListener('touchmove', touchGuard, capNP); };",
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
    print("== Bilnov - fix tactile DWG (conflit curseur/pan a 1 doigt) ==")
    p = os.path.join(root, TARGET)
    if not os.path.exists(p):
        print("!! introuvable:", TARGET); sys.exit(1)
    src = open(p, encoding="utf-8").read()

    if SENTINEL in src:
        print("  =  deja applique (garde-fou touch present)")
    else:
        for name, old, new in EDITS:
            if old not in src:
                print("!! ANCRE KO:", name, "-> le fichier a change, verifier a la main"); sys.exit(2)
            src = src.replace(old, new, 1)
            print("  ~  patche :", name)
        open(p, "w", encoding="utf-8").write(src)

    run(["npm", "run", "build"], root) if build else print("(build saute)")
    print("\nOK. A 1 doigt : seul le curseur bouge. A 2 doigts : pan/zoom natif. git commit + push.")


if __name__ == "__main__":
    main()
