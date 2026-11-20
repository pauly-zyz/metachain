import sys,time,datetime; sys.path.insert(0,'.')
from rpc import *
def c2(m,p):
    for i in range(5):
        time.sleep(1.2)
        try: return call(m,p)
        except Exception as e: print('retry',e); time.sleep(5)
def ec2(to,sig,args=''): return c2('eth_call',[{"to":to,"data":sel(sig)+args},"latest"])
def dstr(h):
    b=bytes.fromhex(h[2:]); n=int.from_bytes(b[32:64],'big'); return b[64:64+n].decode()
now=int(c2('eth_getBlockByNumber',['latest',False])['timestamp'],16)
UTC=datetime.timezone.utc
print('chain time',datetime.datetime.fromtimestamp(now,UTC).strftime('%a %Y-%m-%d %H:%M:%S'))
for n,a in [('ETH/USD','0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9'),('USDG/USD','0x61B7e5650328764B076A108EFF5fa7282a1B9aD2'),('META/USD secondary','0x5cBC53D382E56cBb223f118CF8Eefb6c9c2759f5')]:
    d=int(ec2(a,'decimals()'),16); desc=dstr(ec2(a,'description()'))
    r=ec2(a,'latestRoundData()')[2:]; w=[int(r[i:i+64],16) for i in range(0,320,64)]
    print(n,a,'desc=',desc,'dec=',d,'answer=',w[1]/10**d,'updatedAt=',datetime.datetime.fromtimestamp(w[3],UTC),'age_s=',now-w[3])
