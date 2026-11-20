import sys,time,datetime; sys.path.insert(0,'.')
import rpc
from rpc import *
_c=rpc.call
def call2(m,p):
    time.sleep(0.4); return _c(m,p)
rpc.call=call2
def ec2(to,sig,args='',frm=None):
    o={"to":to,"data":sel(sig)+args}
    if frm: o["from"]=frm
    return call2('eth_call',[o,"latest"])
META='0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35'
HOLDER='0x9f736f87e6293ac1bd9142e257dbfac8b7acf1ae'
EP7='0x0000000071727De22E5E9d8BAf0edAc6f37da032'; EP8='0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108'; EP6='0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'
SAFE4337='0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226'; SAFESETUP='0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47'
WETH='0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73'; USDG='0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168'
amt=hex(10**18)[2:].rjust(64,'0')
print('isBlocked(holder)',ec2(META,'isBlocked(address)',pad(HOLDER)))
for name,to in [('EntryPointV07',EP7),('Safe4337Module',SAFE4337),('fresh EOA 0x...dEaD01','0x000000000000000000000000000000000000dEaD'),('7702 acct 0x0068cb..','0x0068cb7f0514d9ae0a9a42510e25d2369b50f777')]:
    r=ec2(META,'transfer(address,uint256)',pad(to)+amt,frm=HOLDER)
    print('simulate transfer 1 META holder ->',name,':',r)
for n,a in [('EP v0.6',EP6),('EP v0.7',EP7),('EP v0.8',EP8),('Safe4337Module',SAFE4337),('SafeModuleSetup',SAFESETUP),('WETH',WETH),('USDG',USDG)]:
    c=call2('eth_getCode',[a,'latest']); print(n,a,'code bytes',(len(c)-2)//2)
def dstr(h):
    b=bytes.fromhex(h[2:]); n=int.from_bytes(b[32:64],'big'); return b[64:64+n].decode()
for n,a in [('USDG symbol',USDG),('WETH symbol',WETH)]: print(n,dstr(ec2(a,'symbol()')), int(ec2(a,'decimals()'),16))
now=int(call2('eth_getBlockByNumber',['latest',False])['timestamp'],16)
print('chain time',now,datetime.datetime.utcfromtimestamp(now))
for n,a in [('META/USD','0x7C38C00C30BEe9378381E7B6135d7283356D71b1'),('ETH/USD','0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9'),('USDG/USD','0x61B7e5650328764B076A108EFF5fa7282a1B9aD2')]:
    d=int(ec2(a,'decimals()'),16); desc=dstr(ec2(a,'description()'))
    r=ec2(a,'latestRoundData()')[2:]; w=[int(r[i:i+64],16) for i in range(0,320,64)]
    print(n,a,'desc=',desc,'dec=',d,'answer=',w[1]/10**d,'updatedAt=',datetime.datetime.utcfromtimestamp(w[3]),'age_s=',now-w[3])
