import sys; sys.path.insert(0,'.')
from rpc import *
def s(x):
    if isinstance(x,tuple): return x
    return x
def dec_str(h):
    if not isinstance(h,str) or len(h)<130: return h
    b=bytes.fromhex(h[2:]); n=int.from_bytes(b[32:64],'big'); return b[64:64+n].decode(errors='replace')
def u(h): return int(h,16) if isinstance(h,str) and h.startswith('0x') and len(h)>2 else h
META='0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35'
print('block',int(call('eth_blockNumber',[]),16))
code=call('eth_getCode',[META,'latest']); print('META code len',(len(code)-2)//2, code[:80])
slots={'impl':'0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc','admin':'0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103','beacon':'0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50'}
for n,sl in slots.items(): print(n,call('eth_getStorageAt',[META,sl,'latest']))
for sig in ['name()','symbol()']: print(sig,dec_str(ec(META,sig)))
for sig in ['decimals()','totalSupply()','uiMultiplier()','newUIMultiplier()','effectiveAt()','oraclePaused()','paused()','owner()','uid()']:
    r=ec(META,sig); print(sig, r if isinstance(r,tuple) else (u(r), r[-40:] if r and len(r)>=42 else r))
