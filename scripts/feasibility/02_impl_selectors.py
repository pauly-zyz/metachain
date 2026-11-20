import sys,re; sys.path.insert(0,'.')
from rpc import *
IMPL='0xb35490d6f9163de4f80d88dc75c3516eb64c5ae2'
code=call('eth_getCode',[IMPL,'latest'])[2:]
print('impl code bytes',len(code)//2)
# extract PUSH4 operands (0x63)
b=bytes.fromhex(code); push4=set(); i=0
while i<len(b):
    op=b[i]
    if op==0x63: push4.add(b[i+1:i+5].hex())
    if 0x60<=op<=0x7f: i+=op-0x5f
    i+=1
cands='''transfer(address,uint256) transferFrom(address,address,uint256) approve(address,uint256) permit(address,address,uint256,uint256,uint8,bytes32,bytes32) nonces(address) DOMAIN_SEPARATOR()
pause() unpause() paused() pauseOracle() unpauseOracle() oraclePaused() updateMultiplier(uint256) updateMultiplier(uint256,uint256) uiMultiplier() balanceOfUI(address) totalSupplyUI()
mint(address,uint256) burn(address,uint256) burn(uint256) burnFrom(address,uint256) forceTransfer(address,address,uint256) seize(address,address,uint256) clawback(address,uint256)
freeze(address) unfreeze(address) isFrozen(address) frozen(address) freezeAccount(address) blacklist(address) unBlacklist(address) isBlacklisted(address) addToBlacklist(address) removeFromBlacklist(address) isBlocked(address) blockAccount(address) unblockAccount(address) blocked(address)
isAllowed(address) allowlist(address) addToAllowlist(address) whitelist(address) isWhitelisted(address) isAllowlisted(address) allowed(address) setAllowlist(address,bool) setTransferRestrictor(address) transferRestrictor() isSanctioned(address) sanctionsList() setSanctionsList(address)
setFee(uint256) fee() transferFee() feeRecipient()
owner() hasRole(bytes32,address) getRoleAdmin(bytes32) grantRole(bytes32,address) DEFAULT_ADMIN_ROLE() PAUSER_ROLE() MINTER_ROLE() BURNER_ROLE() FREEZER_ROLE() authority() setAuthority(address) canCall(address,address,bytes4) isConsumingScheduledOp()
uid() factory() rename(string,string) setName(string) setSymbol(string) upgradeTo(address) upgradeToAndCall(address,bytes) proxiableUUID() newUIMultiplier() effectiveAt() eip712Domain() multicall(bytes[])'''.split()
for c in cands:
    s=sel(c)[2:]
    if s in push4: print('  PRESENT',c,s)
known={sel(c)[2:] for c in cands}
print('unknown selectors:',sorted(push4-known)[:200])
