#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bilnov - Style des hotspots 360 (Pannellum). VERSION 2 (moderne/discret).

Symptome initial : hotspots invisibles (cssClass custom sans style -> div 0x0).
Feedback Hamid : l'ancien style etait trop rudimentaire / bleu peu contraste.

VERSION 2 : pastilles en verre depoli translucide (blanc neutre), lisibles
sur photo claire comme sombre ; direction = chevron explicite "avance vers ce
point" facon Street View + leger anneau de pulsation ; info = petit "i"
discret. Effet de survol (opacite + scale).

Le CSS est ajoute dans globals.css (importe par le layout -> editeur ET
visiteur). Le script REMPLACE tout bloc Bilnov hotspots existant (v1 ou v2),
donc rejouable meme si l'ancienne version a deja ete deployee.

ADDITIF / idempotent. Aucun git push.
Usage : python 21_apply_tour_hotspot_styles.py --root <chemin-repo> [--no-build]
"""
import os, re, sys, glob, subprocess

# Bloc CSS complet (delimite par les marqueurs de debut/fin).
CSS = """

/* === Bilnov hotspots 360 (Pannellum) v2 === */
/* Style moderne/discret : verre depoli, blanc neutre (bon contraste clair+sombre).
   Direction = chevron explicite du sens de deplacement + anneau de pulsation.
   Info = petit "i" discret. */
.pnlm-hotspot-base.bilnov-dir,
.pnlm-hotspot-base.bilnov-info {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  color: #fff;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.14);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  border: 1.5px solid rgba(255, 255, 255, 0.7);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.35);
  transition: transform 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease;
  z-index: 10;
}
.pnlm-hotspot-base.bilnov-dir { width: 38px; height: 38px; margin: -19px 0 0 -19px; }
.pnlm-hotspot-base.bilnov-dir::after {
  content: '';
  width: 11px;
  height: 11px;
  border-top: 2.5px solid #fff;
  border-right: 2.5px solid #fff;
  transform: translateY(2px) rotate(-45deg);
}
.pnlm-hotspot-base.bilnov-dir::before {
  content: '';
  position: absolute;
  inset: -5px;
  border-radius: 9999px;
  border: 1.5px solid rgba(255, 255, 255, 0.45);
  animation: bilnovPulse 2.4s ease-out infinite;
  pointer-events: none;
}
@keyframes bilnovPulse {
  0%   { transform: scale(0.85); opacity: 0.6; }
  70%  { opacity: 0; }
  100% { transform: scale(1.6); opacity: 0; }
}
.pnlm-hotspot-base.bilnov-info {
  width: 26px;
  height: 26px;
  margin: -13px 0 0 -13px;
  background: rgba(255, 255, 255, 0.12);
  font: italic 700 14px/1 Georgia, 'Times New Roman', serif;
}
.pnlm-hotspot-base.bilnov-info::after { content: 'i'; }
.pnlm-hotspot-base.bilnov-dir:hover,
.pnlm-hotspot-base.bilnov-info:hover {
  background: rgba(255, 255, 255, 0.30);
  transform: scale(1.12);
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.5);
}
/* === fin Bilnov hotspots 360 === */
"""

VERSION_SENTINEL = "Bilnov hotspots 360 (Pannellum) v2"
# retire tout bloc Bilnov existant (v1 sans "v2", ou v2), debut -> fin inclus
OLD_BLOCK = re.compile(
    r"\n*/\* === Bilnov hotspots 360 \(Pannellum\).*?/\* === fin Bilnov hotspots 360 === \*/\n?",
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
    print("== Bilnov - styles hotspots 360 (v2 moderne) ==")
    css = find_globals(root)
    if not css:
        print("!! globals.css introuvable sous", root); sys.exit(1)
    rel = os.path.relpath(css, root)
    src = open(css, encoding="utf-8").read()

    had_block = bool(OLD_BLOCK.search(src))
    src = OLD_BLOCK.sub("\n", src).rstrip() + CSS
    open(css, "w", encoding="utf-8").write(src)
    if had_block:
        print("  ~  ancien bloc hotspots remplace par la v2 :", rel)
    else:
        print("  +  CSS hotspots v2 ajoute :", rel)

    # garde-fou
    check = open(css, encoding="utf-8").read()
    if check.count(VERSION_SENTINEL) != 1:
        print("!! bloc v2 non unique apres ecriture -> verifier a la main"); sys.exit(3)

    run(["npm", "run", "build"], root) if build else print("(build saute)")
    print("\nOK. Hotspots v2 appliques. Pense a git commit + push.")


if __name__ == "__main__":
    main()
