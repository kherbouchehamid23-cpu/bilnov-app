#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bilnov - UX editeur 360 : bouton "valider la modification" manquant.

Symptome : sur une visite 360 DEJA PUBLIEE, en mode modification, il n'y a
aucun bouton pour valider/enregistrer les modifications.

Cause : dans l'editeur (page.tsx), le bouton d'action n'est rendu que si la
visite n'est PAS publiee -> `{!published && (<button>Publier</button>)}`.
Une fois publiee, il ne reste que le badge "● Publié", plus aucun bouton.
(Note : les hotspots et images 360 sont deja enregistres automatiquement au
moment de l'action ; ce bouton donne surtout la confirmation attendue et
rafraichit publishedAt.)

Correctif (frontend seul, aucune migration) :
- le bouton d'action est TOUJOURS affiche ;
- libelle "Publier" si brouillon, "✓ Enregistrer les modifications" si publie ;
- petit indicateur "✓ Enregistré" apres le clic.

ADDITIF / idempotent. Rejouable. Aucun git push.
Usage : python 22_apply_tour_edit_save_button.py --root <chemin-repo> [--no-build]
"""
import os, sys, subprocess

TARGET = "src/app/projects/[id]/tours/[tourId]/page.tsx"

EDITS = [
    # (nom, sentinelle_deja_applique, old, new)
    (
        "state savedFlash",
        "const [savedFlash",
        "  const [published, setPublished] = useState(false);\n",
        "  const [published, setPublished] = useState(false);\n"
        "  const [savedFlash, setSavedFlash] = useState(false);\n",
    ),
    (
        "handlePublish flash",
        "setSavedFlash(true)",
        "      setPublished(true);\n"
        "      setTour(prev => prev ? { ...prev, status: 'PUBLISHED' } : null);\n"
        "    } catch { alert('Erreur publication'); }\n",
        "      setPublished(true);\n"
        "      setTour(prev => prev ? { ...prev, status: 'PUBLISHED' } : null);\n"
        "      setSavedFlash(true);\n"
        "      setTimeout(() => setSavedFlash(false), 2500);\n"
        "    } catch { alert('Erreur, reessayez.'); }\n",
    ),
    (
        "bouton toujours visible",
        "Enregistrer les modifications",
        "          {!published && (\n"
        "            <button onClick={() => { void handlePublish(); }}\n"
        "              className=\"px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors\">\n"
        "              Publier\n"
        "            </button>\n"
        "          )}\n",
        "          <button onClick={() => { void handlePublish(); }}\n"
        "            className=\"px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors\">\n"
        "            {published ? '✓ Enregistrer les modifications' : 'Publier'}\n"
        "          </button>\n"
        "          {savedFlash && (\n"
        "            <span className=\"text-xs px-2 py-0.5 rounded-full\" style={{ background: '#052e16', color: '#4ade80' }}>✓ Enregistré</span>\n"
        "          )}\n",
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
    print("== Bilnov - bouton 'valider modification' editeur 360 ==")
    p = os.path.join(root, TARGET)
    if not os.path.exists(p):
        print("!! introuvable:", TARGET); sys.exit(1)
    src = open(p, encoding="utf-8").read()

    for name, sentinel, old, new in EDITS:
        if sentinel in src:
            print("  =  deja applique :", name)
            continue
        if old not in src:
            print("!! ANCRE KO:", name, "-> le fichier a change, verifier a la main")
            sys.exit(2)
        src = src.replace(old, new, 1)
        print("  ~  patche :", name)

    open(p, "w", encoding="utf-8").write(src)
    run(["npm", "run", "build"], root) if build else print("(build saute)")
    print("\nOK. Bouton d'enregistrement disponible sur les visites publiees. git commit + push pour deployer.")


if __name__ == "__main__":
    main()
