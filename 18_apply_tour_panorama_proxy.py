#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bilnov - Fix visites 360 : sert le panorama en SAME-ORIGIN (proxy) au lieu de l'URL signee R2, pour lever le blocage CORS de Pannellum (texture WebGL) qui empechait l'affichage de l'image ET le placement des hotspots. ADDITIF. A tester en runtime."""
import base64, json, os, sys, subprocess
FILES={"src/app/api/projects/[id]/tours/[tourId]/scenes/[sceneId]/raw/route.ts": "aW1wb3J0IHsgTmV4dFJlcXVlc3QgfSBmcm9tICduZXh0L3NlcnZlcic7CmltcG9ydCB7IHByaXNtYSB9IGZyb20gJ0AvbGliL3ByaXNtYSc7CmltcG9ydCB7IHZlcmlmeVRva2VuLCBhcGlFcnJvciB9IGZyb20gJ0AvbGliL2F1dGgnOwppbXBvcnQgeyBnZXRTaWduZWRGaWxlVXJsIH0gZnJvbSAnQC9saWIvc3RvcmFnZSc7CmltcG9ydCB7IGdldFByb2plY3RBY2Nlc3MgfSBmcm9tICdAL2xpYi9hY2Nlc3MnOwoKLy8gUHJveHkgc2FtZS1vcmlnaW4gZGUgbCdpbWFnZSAzNjAgZCd1bmUgc2PDqG5lIDogZXZpdGUgbGUgYmxvY2FnZSBDT1JTIGRlIFBhbm5lbGx1bQovLyAodGV4dHVyZSBXZWJHTCkuIEF1dGggdmlhIGhlYWRlciBBdXRob3JpemF0aW9uIG91ID90b2tlbj0gKGxlcyA8aW1nPi90ZXh0dXJlcyBuZQovLyBwZXV2ZW50IHBhcyBlbnZveWVyIGQnZW4tdGV0ZSBBdXRob3JpemF0aW9uKS4KZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIEdFVChyZXE6IE5leHRSZXF1ZXN0LCB7IHBhcmFtcyB9OiB7IHBhcmFtczogeyBpZDogc3RyaW5nOyB0b3VySWQ6IHN0cmluZzsgc2NlbmVJZDogc3RyaW5nIH0gfSkgewogIHRyeSB7CiAgICBjb25zdCBhdXRoSGVhZGVyID0gcmVxLmhlYWRlcnMuZ2V0KCdhdXRob3JpemF0aW9uJyk7CiAgICBjb25zdCBxdWVyeVRva2VuID0gcmVxLm5leHRVcmwuc2VhcmNoUGFyYW1zLmdldCgndG9rZW4nKTsKICAgIGNvbnN0IHRva2VuID0gYXV0aEhlYWRlcj8ucmVwbGFjZSgnQmVhcmVyICcsICcnKSA/PyBxdWVyeVRva2VuID8/ICcnOwogICAgY29uc3QgdXNlciA9IHZlcmlmeVRva2VuKHRva2VuKTsKICAgIGlmICghdXNlcikgcmV0dXJuIGFwaUVycm9yKCdOb24gYXV0aGVudGlmacOpJywgJ1VOQVVUSE9SSVpFRCcsIDQwMSk7CgogICAgY29uc3Qgc2NlbmUgPSBhd2FpdCBwcmlzbWEudG91clNjZW5lLmZpbmRGaXJzdCh7CiAgICAgIHdoZXJlOiB7IGlkOiBwYXJhbXMuc2NlbmVJZCwgdG91cklkOiBwYXJhbXMudG91cklkLCB0b3VyOiB7IHByb2plY3RJZDogcGFyYW1zLmlkIH0gfSwKICAgICAgc2VsZWN0OiB7IGltYWdlVXJsOiB0cnVlIH0sCiAgICB9KTsKICAgIGlmICghc2NlbmUpIHJldHVybiBhcGlFcnJvcignU2PDqG5lIGludHJvdXZhYmxlJywgJ05PVF9GT1VORCcsIDQwNCk7CgogICAgY29uc3QgYWNjZXNzID0gYXdhaXQgZ2V0UHJvamVjdEFjY2Vzcyh1c2VyLCBwYXJhbXMuaWQpOwogICAgaWYgKCFhY2Nlc3MgfHwgIWFjY2Vzcy5jYW5WaWV3KSByZXR1cm4gYXBpRXJyb3IoJ0FjY8OocyByZWZ1c8OpJywgJ0ZPUkJJRERFTicsIDQwMyk7CgogICAgY29uc3QgeyB1cmwgfSA9IGF3YWl0IGdldFNpZ25lZEZpbGVVcmwoc2NlbmUuaW1hZ2VVcmwsICd2aWV3Jyk7CiAgICBjb25zdCByMiA9IGF3YWl0IGZldGNoKHVybCk7CiAgICBpZiAoIXIyLm9rKSByZXR1cm4gYXBpRXJyb3IoJ0VycmV1ciBzdG9ja2FnZScsICdTVE9SQUdFX0VSUk9SJywgNTAyKTsKICAgIGNvbnN0IGJvZHkgPSBhd2FpdCByMi5hcnJheUJ1ZmZlcigpOwogICAgcmV0dXJuIG5ldyBSZXNwb25zZShib2R5LCB7CiAgICAgIHN0YXR1czogMjAwLAogICAgICBoZWFkZXJzOiB7CiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6IHIyLmhlYWRlcnMuZ2V0KCdjb250ZW50LXR5cGUnKSA/PyAnaW1hZ2UvanBlZycsCiAgICAgICAgJ0NhY2hlLUNvbnRyb2wnOiAncHJpdmF0ZSwgbWF4LWFnZT0zNjAwJywKICAgICAgfSwKICAgIH0pOwogIH0gY2F0Y2ggKGUpIHsKICAgIHJldHVybiBhcGlFcnJvcihlIGluc3RhbmNlb2YgRXJyb3IgPyBlLm1lc3NhZ2UgOiAnRXJyZXVyJywgJ0lOVEVSTkFMX0VSUk9SJywgNTAwKTsKICB9Cn0K"}
EDITS=[["src/app/projects/[id]/tours/[tourId]/page.tsx", "scene-proxy-field", "cGFub3JhbWFQcm94eT86IHN0cmluZzs=", "aW50ZXJmYWNlIFNjZW5lIHsgaWQ6IHN0cmluZzsgbmFtZTogc3RyaW5nOyBpbWFnZVVybDogc3RyaW5nOyBpc0luaXRpYWw6IGJvb2xlYW47IHBvc2l0aW9uOiBudW1iZXI7IH0=", "aW50ZXJmYWNlIFNjZW5lIHsgaWQ6IHN0cmluZzsgbmFtZTogc3RyaW5nOyBpbWFnZVVybDogc3RyaW5nOyBpc0luaXRpYWw6IGJvb2xlYW47IHBvc2l0aW9uOiBudW1iZXI7IHBhbm9yYW1hUHJveHk/OiBzdHJpbmc7IH0="], ["src/app/projects/[id]/tours/[tourId]/page.tsx", "panorama-proxy", "Y3VycmVudFNjZW5lLnBhbm9yYW1hUHJveHkgPw==", "cGFub3JhbWE6IGN1cnJlbnRTY2VuZS5pbWFnZVVybCw=", "cGFub3JhbWE6IGN1cnJlbnRTY2VuZS5wYW5vcmFtYVByb3h5ID8gYCR7Y3VycmVudFNjZW5lLnBhbm9yYW1hUHJveHl9P3Rva2VuPSR7Z2V0VG9rZW4oKX1gIDogY3VycmVudFNjZW5lLmltYWdlVXJsLA=="], ["src/app/api/projects/[id]/tours/[tourId]/scenes/route.ts", "scenes-get-proxy", "aW1hZ2VVcmw6IHVybCwgcGFub3JhbWFQcm94eTo=", "ICAgICAgICAgIHJldHVybiB7IC4uLnNjZW5lLCBpbWFnZVVybDogdXJsIH07", "ICAgICAgICAgIHJldHVybiB7IC4uLnNjZW5lLCBpbWFnZVVybDogdXJsLCBwYW5vcmFtYVByb3h5OiBgL2FwaS9wcm9qZWN0cy8ke3BhcmFtcy5pZH0vdG91cnMvJHtwYXJhbXMudG91cklkfS9zY2VuZXMvJHtzY2VuZS5pZH0vcmF3YCB9Ow=="], ["src/app/api/projects/[id]/tours/[tourId]/scenes/route.ts", "scenes-get-catch-proxy", "Li4uc2NlbmUsIHBhbm9yYW1hUHJveHk6", "ICAgICAgICAgIHJldHVybiBzY2VuZTs=", "ICAgICAgICAgIHJldHVybiB7IC4uLnNjZW5lLCBwYW5vcmFtYVByb3h5OiBgL2FwaS9wcm9qZWN0cy8ke3BhcmFtcy5pZH0vdG91cnMvJHtwYXJhbXMudG91cklkfS9zY2VuZXMvJHtzY2VuZS5pZH0vcmF3YCB9Ow=="], ["src/app/api/projects/[id]/tours/[tourId]/scenes/route.ts", "scenes-post-proxy", "aW1hZ2VVcmw6IHVybCwgcGFub3JhbWFQcm94eTo=", "ICAgIHJldHVybiBhcGlTdWNjZXNzKHsgLi4uc2NlbmUsIGltYWdlVXJsOiB1cmwgfSwgMjAxKTs=", "ICAgIHJldHVybiBhcGlTdWNjZXNzKHsgLi4uc2NlbmUsIGltYWdlVXJsOiB1cmwsIHBhbm9yYW1hUHJveHk6IGAvYXBpL3Byb2plY3RzLyR7cGFyYW1zLmlkfS90b3Vycy8ke3BhcmFtcy50b3VySWR9L3NjZW5lcy8ke3NjZW5lLmlkfS9yYXdgIH0sIDIwMSk7"]]
def d(s): return base64.b64decode(s).decode('utf-8')
def parse(a):
    root,build='.',True; i=0
    while i<len(a):
        if a[i]=='--root': root=a[i+1]; i+=2; continue
        if a[i]=='--no-build': build=False
        i+=1
    return root,build
def run(cmd,root):
    print("\n$"," ".join(cmd)); r=subprocess.run(cmd,cwd=root)
    if r.returncode: print("!! echec (rc=%d)."%r.returncode); sys.exit(r.returncode)
def main():
    root,build=parse(sys.argv[1:]); print("== Bilnov - fix panorama 360 (CORS -> proxy same-origin) ==")
    for rel,enc in FILES.items():
        p=os.path.join(root,rel); os.makedirs(os.path.dirname(p),exist_ok=True); c=d(enc)
        if os.path.exists(p) and open(p,encoding='utf-8').read()==c: print("  = ",rel)
        else: open(p,'w',encoding='utf-8').write(c); print("  + ",rel)
    cache={}
    for f,name,dm,o,nw in EDITS:
        p=os.path.join(root,f)
        if not os.path.exists(p): print("!! introuvable:",f); sys.exit(1)
        src=cache.get(p) or open(p,encoding='utf-8').read(); marker,old,new=d(dm),d(o),d(nw)
        if marker in src and old not in src: print("  = deja",name); cache[p]=src; continue
        if old not in src: print("!! ANCRE KO:",name); sys.exit(2)
        src=src.replace(old,new,1); cache[p]=src; print("  ~ patche",name)
    for p,src in cache.items(): open(p,'w',encoding='utf-8').write(src)
    run(["npm","run","build"],root) if build else print("(build saute)")
    print("\nOK. Fix panorama applique. Aucun git push.")
if __name__=='__main__': main()
