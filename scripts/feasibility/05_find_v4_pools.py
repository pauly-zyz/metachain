import sys,time,json; sys.path.insert(0,'.')
from rpc import *
def c2(m,p):
    for i in range(6):
        time.sleep(1.0)
        try: return call(m,p)
        except Exception as e: print('retry',e); time.sleep(6)
PM='0x8366a39cc670b4001a1121b8f6a443a643e40951'
META='0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35'
T='0x'+k(b'Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)')
mt='0x'+pad(META)
res=[]
head=int(c2('eth_blockNumber',[]),16)
for topics in ([T,None,None,mt],[T,None,mt]):
    b=0
    while b<=head:
        e=min(b+9_999_999,head)
        r=c2('eth_getLogs',[{"address":PM,"topics":topics,"fromBlock":hex(b),"toBlock":hex(e)}])
        if isinstance(r,tuple): print('err',b,r)
        else: res+=r
        b=e+1
    print('done',len(topics),len(res))
out=[]
for l in res:
    d=l['data'][2:]; w=[d[i:i+64] for i in range(0,len(d),64)]
    fee=int(w[0],16); ts=int(w[1],16); ts=ts-2**256 if ts>2**255 else ts
    out.append(dict(id=l['topics'][1],c0='0x'+l['topics'][2][26:],c1='0x'+l['topics'][3][26:],fee=fee,tickSpacing=ts,hooks='0x'+w[2][24:],block=int(l['blockNumber'],16)))
json.dump(out,open('pools.json','w'),indent=1)
for o in out: print(o)
