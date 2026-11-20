import json,urllib.request,os,sys,hashlib
RPC=os.environ.get('RPC','https://rpc.mainnet.chain.robinhood.com')
def call(method,params):
    req=urllib.request.Request(RPC,data=json.dumps({"jsonrpc":"2.0","id":1,"method":method,"params":params}).encode(),headers={'content-type':'application/json','user-agent':'curl/8.5.0'})
    r=json.load(urllib.request.urlopen(req,timeout=30))
    if 'error' in r: return ('ERR',r['error'])
    return r['result']
# keccak via pycryptodome or pysha3 fallback
try:
    from Crypto.Hash import keccak
    def k(b): h=keccak.new(digest_bits=256); h.update(b); return h.hexdigest()
except ImportError:
    from eth_hash.auto import keccak as _k
    def k(b): return _k(b).hex()
def sel(sig): return '0x'+k(sig.encode())[:8]
def ec(to,sig,args=''):
    return call('eth_call',[{"to":to,"data":sel(sig)+args},"latest"])
def pad(a): return a.lower().replace('0x','').rjust(64,'0')
