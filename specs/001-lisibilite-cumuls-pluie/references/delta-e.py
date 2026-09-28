import math
P=[(5.5,183,218,226),(7.5,0,23,254),(10,0,131,209),(15,83,195,215),(20,34,240,150),(25,110,245,40),(35,163,255,17),(45,216,228,134),(65,244,240,149),(85,255,255,0),(115,253,229,116),(155,248,168,136),(210,251,163,64),(285,255,117,10),(385,255,0,0),(520,192,0,0),(700,142,17,31)]
def lab(r,g,b):
    def l(c):
        c/=255; return c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
    R,G,B=l(r),l(g),l(b)
    X=(0.4124*R+0.3576*G+0.1805*B)/0.95047;Y=0.2126*R+0.7152*G+0.0722*B;Z=(0.0193*R+0.1192*G+0.9505*B)/1.08883
    f=lambda t:t**(1/3) if t>0.008856 else 7.787*t+16/116
    return 116*f(Y)-16,500*(f(X)-f(Y)),200*(f(Y)-f(Z))
def de00(a,b):
    L1,a1,b1=a;L2,a2,b2=b
    C1=math.hypot(a1,b1);C2=math.hypot(a2,b2);Cb=(C1+C2)/2
    G=0.5*(1-math.sqrt(Cb**7/(Cb**7+25**7)))
    a1p,a2p=(1+G)*a1,(1+G)*a2
    C1p,C2p=math.hypot(a1p,b1),math.hypot(a2p,b2)
    h=lambda x,y:math.degrees(math.atan2(y,x))%360
    h1,h2=h(a1p,b1),h(a2p,b2)
    dL=L2-L1;dC=C2p-C1p
    dh=h2-h1
    if C1p*C2p==0: dh=0
    elif dh>180: dh-=360
    elif dh<-180: dh+=360
    dH=2*math.sqrt(C1p*C2p)*math.sin(math.radians(dh/2))
    Lb=(L1+L2)/2;Cbp=(C1p+C2p)/2
    if C1p*C2p==0: hb=h1+h2
    elif abs(h1-h2)<=180: hb=(h1+h2)/2
    elif h1+h2<360: hb=(h1+h2+360)/2
    else: hb=(h1+h2-360)/2
    T=1-0.17*math.cos(math.radians(hb-30))+0.24*math.cos(math.radians(2*hb))+0.32*math.cos(math.radians(3*hb+6))-0.2*math.cos(math.radians(4*hb-63))
    SL=1+0.015*(Lb-50)**2/math.sqrt(20+(Lb-50)**2);SC=1+0.045*Cbp;SH=1+0.015*Cbp*T
    RT=-2*math.sqrt(Cbp**7/(Cbp**7+25**7))*math.sin(math.radians(60*math.exp(-((hb-275)/25)**2)))
    return math.sqrt((dL/SL)**2+(dC/SC)**2+(dH/SH)**2+RT*(dC/SC)*(dH/SH))
L=[lab(*p[1:]) for p in P]
for i,p in enumerate(P): print(f"{p[0]:>6} L*={L[i][0]:5.1f}" + (f"  dE00 vs prev={de00(L[i-1],L[i]):5.1f}" if i else ""))
