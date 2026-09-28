"""Recherche de faisabilité : palette dérivée d'Infoclimat (17 rangs) avec
   - teinte OKLCH de chaque rang dans ±HUE_TOL° de la teinte Infoclimat,
   - clarté CIELAB non croissante (tolérance TOL_L),
   - maximisation du min ΔE00 entre rangs voisins.
Usage : python3 palette_search.py [HUE_TOL] [TOL_L] [FID] [START]
   START = premier rang (1-indexé, transition START-1→START) soumis à la monotonie ; 1 = toute la rampe."""
import math, sys, itertools
sys.path.insert(0, '../references')
src = open('../references/delta-e.py').read().split('L=[lab')[0]
exec(src.split('P=[')[0]); exec('def lab(r,g,b):'+src.split('def lab(r,g,b):')[1].split('def de00')[0]); exec('def de00'+src.split('def de00')[1])
INFO=[(183,218,226),(0,23,254),(0,131,209),(83,195,215),(34,240,150),(110,245,40),(163,255,17),(216,228,134),(244,240,149),(255,255,0),(253,229,116),(248,168,136),(251,163,64),(255,117,10),(255,0,0),(192,0,0),(142,17,31)]
HUE_TOL=float(sys.argv[1]) if len(sys.argv)>1 else 20
TOL_L=float(sys.argv[2]) if len(sys.argv)>2 else 0
FID=float(sys.argv[3]) if len(sys.argv)>3 else 999  # ΔE00 max vs couleur Infoclimat du rang
START=int(sys.argv[4]) if len(sys.argv)>4 else 1
# Rangs (1-indexés) libérés de la contrainte de fidélité, p. ex. "2,3"
FREE={int(x) for x in sys.argv[5].split(',')} if len(sys.argv)>5 and sys.argv[5] else set()   # rang à partir duquel la clarté doit être monotone
def srgb2lin(c):
    c/=255; return c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
def lin2srgb(c):
    return 12.92*c if c<=0.0031308 else 1.055*c**(1/2.4)-0.055
def rgb2oklch(r,g,b):
    r,g,b=srgb2lin(r),srgb2lin(g),srgb2lin(b)
    l=0.4122214708*r+0.5363325363*g+0.0514459929*b; m=0.2119034982*r+0.6806995451*g+0.1073969566*b; s=0.0883024619*r+0.2817188376*g+0.6299787005*b
    l,m,s=l**(1/3),m**(1/3),s**(1/3)
    L=0.2104542553*l+0.7936177850*m-0.0040720468*s; a=1.9779984951*l-2.4285922050*m+0.4505937099*s; bb=0.0259040371*l+0.7827717662*m-0.8086757660*s
    return L,math.hypot(a,bb),math.degrees(math.atan2(bb,a))%360
def oklch2rgb(L,C,h):
    a=C*math.cos(math.radians(h)); b=C*math.sin(math.radians(h))
    l=(L+0.3963377774*a+0.2158037573*b)**3; m=(L-0.1055613458*a-0.0638541728*b)**3; s=(L-0.0894841775*a-1.2914855480*b)**3
    r=4.0767416621*l-3.3077115913*m+0.2309699292*s; g=-1.2684380046*l+2.6097574011*m-0.3413193965*s; bl=-0.0041960863*l-0.7034186147*m+1.7076147010*s
    out=[lin2srgb(x) for x in (r,g,bl)]
    if any(x<-1e-4 or x>1+1e-4 for x in out): return None
    return tuple(round(min(1,max(0,x))*255) for x in out)
def cands(rgb, fid):
    L0,C0,h0=rgb2oklch(*rgb); res=[(rgb,lab(*rgb))]; ref=lab(*rgb)
    for dh in (-HUE_TOL,-HUE_TOL/2,0,HUE_TOL/2,HUE_TOL):
        for L in [x/100 for x in range(30,99,2)]:
            # chroma max en gamut
            lo,hi=0,0.4
            for _ in range(18):
                mid=(lo+hi)/2
                if oklch2rgb(L,mid,h0+dh): lo=mid
                else: hi=mid
            if lo < 0.02 and C0>0.05: continue
            for f in (1,0.8,0.6):
                C=lo*f
                if C0<0.05: C=min(C,C0*1.5+0.01)
                p=oklch2rgb(L,C,h0+dh)
                if p and de00(ref,lab(*p))<=fid: res.append((p,lab(*p)))
    return res
C=[cands(c, 999 if k+1 in FREE else FID) for k,c in enumerate(INFO)]
def feasible(t):
    reach=[{i:None for i in range(len(C[0]))}]
    for k in range(1,17):
        nxt={}
        for j,(pj,lj) in enumerate(C[k]):
            for i in reach[-1]:
                li=C[k-1][i][1]
                mono = (k < START) or lj[0] <= li[0]+TOL_L
                if mono and de00(li,lj)>=t:
                    nxt[j]=i; break
        if not nxt: return None
        reach.append(nxt)
    j=next(iter(reach[-1])); path=[j]
    for k in range(16,0,-1):
        j=reach[k][j]; path.append(j)
    return [C[k][i][0] for k,i in enumerate(reversed(path))]
lo,hi,best=0,40,None
for _ in range(10):
    mid=(lo+hi)/2; p=feasible(mid)
    if p: lo,best=mid,p
    else: hi=mid
print(f"HUE_TOL={HUE_TOL} TOL_L={TOL_L} FID={FID} START={START} FREE={sorted(FREE)} -> min dE00 atteignable ≈ {lo:.1f}")
if best:
    Ls=[lab(*c) for c in best]
    for k,c in enumerate(best):
        print(k+1, INFO[k], '->', c, f"L*={Ls[k][0]:.1f}", f"fid={de00(lab(*INFO[k]),Ls[k]):.1f}", f"dE={de00(Ls[k-1],Ls[k]):.1f}" if k else "")

# --- Mode « plus proche d'Infoclimat » : minimise Σ fid² sous ΔE00 voisins ≥ T et monotonie.
import os
T=float(os.environ.get('CLOSEST_T','0'))
if T>0:
    INF=float('inf')
    cost=[{i:(de00(lab(*INFO[0]),C[0][i][1])**2, None) for i in range(len(C[0]))}]
    for k in range(1,17):
        ref=lab(*INFO[k]); nxt={}
        for j,(pj,lj) in enumerate(C[k]):
            fj=de00(ref,lj)**2; best=(INF,None)
            for i,(ci,_) in cost[-1].items():
                li=C[k-1][i][1]
                mono=(k+1<START) or lj[0]<=li[0]+TOL_L
                if mono and ci+fj<best[0] and de00(li,lj)>=T: best=(ci+fj,i)
            if best[1] is not None: nxt[j]=best
        if not nxt: print('infaisable au rang',k+1); sys.exit()
        cost.append(nxt)
    j=min(cost[-1],key=lambda x:cost[-1][x][0]); path=[j]
    for k in range(16,0,-1):
        j=cost[k][j][1]; path.append(j)
    pal=[C[k][i][0] for k,i in enumerate(reversed(path))]
    Ls=[lab(*c) for c in pal]
    print(f"\n# Palette la plus proche (T={T}) — RMS fid = {math.sqrt(cost[-1][path[0]][0]/17):.1f}")
    for k,c in enumerate(pal):
        print(k+1, INFO[k], '->', c, f"L*={Ls[k][0]:.1f}", f"fid={de00(lab(*INFO[k]),Ls[k]):.1f}", f"dE={de00(Ls[k-1],Ls[k]):.1f}" if k else "")

# --- Mode « critère reformulé » (CLOSEST2_T) : DP sur paires d'états (rang k-1, rang k)
#   * ΔE00 ≥ T entre voisins ET entre rangs à distance 2,
#   * L* ≥ LMIN_LOW pour les rangs 1..4 (pas d'inversion aux faibles valeurs),
#   * clarté non croissante à partir de la transition START-1→START,
#   * minimise Σ fid².
T2=float(os.environ.get('CLOSEST2_T','0'))
LMIN_LOW=float(os.environ.get('LMIN_LOW','60'))
if T2>0:
    CC=[]
    for k,lst in enumerate(C):
        # sous-échantillonnage pour tenir le DP à paires
        ref=lab(*INFO[k])
        l=[c for c in lst if not (k<4 and c[1][0]<LMIN_LOW)]
        l=sorted(l,key=lambda c:de00(ref,c[1]))[:int(os.environ.get('NCAND','60'))]
        CC.append(l)
    fid=[[de00(lab(*INFO[k]),c[1])**2 for c in CC[k]] for k in range(17)]
    ok=lambda k,a,b,dist: de00(CC[k-dist][a][1],CC[k][b][1])>=T2
    # état : (i au rang k-1, j au rang k)
    st={}
    for i in range(len(CC[0])):
        for j in range(len(CC[1])):
            if ok(1,i,j,1): st[(i,j)]=(fid[0][i]+fid[1][j],None)
    hist=[st]
    for k in range(2,17):
        nxt={}
        for (i,j),(c,_) in st.items():
            lj=CC[k-1][j][1]
            for m in range(len(CC[k])):
                lm=CC[k][m][1]
                if k+1>=START and lm[0]>lj[0]+TOL_L: continue
                if de00(lj,lm)<T2 or de00(CC[k-2][i][1],lm)<T2: continue
                v=c+fid[k][m]
                if (j,m) not in nxt or v<nxt[(j,m)][0]: nxt[(j,m)]=(v,(i,j))
        if not nxt: print('infaisable au rang',k+1); sys.exit()
        st=nxt; hist.append(st)
    key=min(st,key=lambda x:st[x][0]); tot=st[key][0]
    idx=[key[1],key[0]]
    for h in range(len(hist)-1,0,-1):
        prev=hist[h][key][1]; idx.append(prev[0]); key=prev
    idx=idx[::-1]
    pal=[CC[k][i][0] for k,i in enumerate(idx)]
    Ls=[lab(*c) for c in pal]
    print(f"\n# Critère reformulé (T={T2}, LMIN_LOW={LMIN_LOW}, START={START}) — RMS fid = {math.sqrt(tot/17):.1f}")
    for k,c in enumerate(pal):
        d2=f" d2={de00(Ls[k-2],Ls[k]):.1f}" if k>1 else ""
        print(k+1, INFO[k], '->', c, f"L*={Ls[k][0]:.1f}", f"fid={de00(lab(*INFO[k]),Ls[k]):.1f}", (f"dE={de00(Ls[k-1],Ls[k]):.1f}" if k else "")+d2)
    import itertools
    print('min ΔE00 toutes paires =', round(min(de00(a,b) for a,b in itertools.combinations(Ls,2)),1))
