import sys,time,json,math; sys.path.insert(0,'.')
from rpc import *
def c2(m,p):
    for i in range(8):
        time.sleep(0.7)
        try: return call(m,p)
        except Exception as e: time.sleep(8)
def ec2(to,sig,args=''): return c2('eth_call',[{"to":to,"data":sel(sig)+args},"latest"])
META='0xc0d6457c16cc70d6790dd43521c899c87ce02f35'; USDG='0x5fc5360d0400a0fd4f2af552add042d716f1d168'; WETH='0x0bd7d308f8e1639fab988df18a8011f41eacad73'
METAUSD=583.5; ETHUSD=1748.27
# V4 depth for +-2% using L
p=json.load(open('pools_ranked.json'))
print('V4 depth (META moved for ~2% price move, in-range L only):')
for x in p[:15]:
    sp=x.get('sqrtP');
    if not sp: continue
    sqrt_raw=sp/2**96
    # c1 is META in all these? check
    if x['c1']==META:
        d_meta = x['liq']*(1/sqrt_raw)*0.00995/1e18 if False else None
        # amount1 (META raw) = L * d(sqrtP) ; sqrtP is sqrt(c1/c0) raw
        d_meta = x['liq']*sqrt_raw*0.00995/1e18
    print(' ',x['id'][:12],'pair',('USDG' if x['c0']==USDG else 'ETH'),'fee',x['fee']/1e4,'%','hooks',x['hooks'][:10],'2%depth META',round(d_meta,3),'~$',round(d_meta*METAUSD))
# V3
F='0x1f7d7550b1b028f7571e69a784071f0205fd2efa'
print('V3 factory code bytes',(len(c2('eth_getCode',[F,'latest']))-2)//2)
for other,name in ((USDG,'USDG'),(WETH,'WETH')):
    for fee in (100,500,3000,10000):
        a,b=sorted([META,other])
        r=ec2(F,'getPool(address,address,uint24)',pad(a)+pad(b)+hex(fee)[2:].rjust(64,'0'))
        pool='0x'+r[-40:]
        if int(pool,16)==0: print('  V3',name,fee,'none'); continue
        liq=int(ec2(pool,'liquidity()'),16)
        s0=ec2(pool,'slot0()')[2:]; w=[s0[i:i+64] for i in range(0,len(s0),64)]
        card=int(w[3],16); cardNext=int(w[4],16)
        bm=int(ec2(META,'balanceOf(address)',pad(pool)),16)/1e18
        print('  V3',name,fee,pool,'L',liq,'obsCardinality',card,'next',cardNext,'META bal',round(bm,3))
