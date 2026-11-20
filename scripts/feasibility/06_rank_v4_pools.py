import sys,time,json; sys.path.insert(0,'.')
from rpc import *
def c2(m,p):
    for i in range(8):
        time.sleep(0.7)
        try: return call(m,p)
        except Exception as e: time.sleep(8)
SV='0xf3334192d15450cdd385c8b70e03f9a6bd9e673b'
META='0xc0d6457c16cc70d6790dd43521c899c87ce02f35'; USDG='0x5fc5360d0400a0fd4f2af552add042d716f1d168'; WETH='0x0bd7d308f8e1639fab988df18a8011f41eacad73'
p=json.load(open('pools.json'))
sel_=[x for x in p if (x['c0'] in (USDG,'0x'+'0'*40,WETH) or x['c1'] in (USDG,WETH))]
for x in sel_:
    r=c2('eth_call',[{"to":SV,"data":sel('getLiquidity(bytes32)')+x['id'][2:]},"latest"])
    x['liq']=int(r,16) if isinstance(r,str) else -1
sel_.sort(key=lambda x:-x['liq'])
for x in sel_[:15]:
    r=c2('eth_call',[{"to":SV,"data":sel('getSlot0(bytes32)')+x['id'][2:]},"latest"])[2:]
    sp=int(r[:64],16); x['sqrtP']=sp
    raw=(sp/2**96)**2  # price of c1 in c0 raw units
    dec0=6 if x['c0']==USDG else 18
    # META per c0 -> price META in c0 = 1/raw adjusted
    if x['c1']==META and raw>0: x['META_price_in_c0']=(1/raw)*10**(18-dec0)
json.dump(sel_,open('pools_ranked.json','w'),indent=1)
for x in sel_[:15]: print(x['id'],x['c0'][:8],'fee',x['fee'],'ts',x['tickSpacing'],'hooks',x['hooks'][:10],'L',x['liq'],'px',round(x.get('META_price_in_c0',0),4))
print('nonzero',sum(1 for x in sel_ if x['liq']>0))
