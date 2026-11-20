"use client";
import { useQuery } from "@tanstack/react-query";
import { getAddress, parseAbi, parseAbiItem, type Address } from "viem";
import { metaPriceOracleAbi, metaTokenPaymasterAbi, PRICE_MODE_LABEL } from "@metachain/sdk";
import { config } from "@/lib/config";
import { usePublicClient } from "@/lib/useMetaAccount";
import { errMsg, eth, meta, short, ts, usd } from "@/lib/format";
import { Badge, Card, Notice, Row, Stat, TxLink } from "@/components/ui";

const feedAbi = parseAbi([
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
  "function decimals() view returns (uint8)",
  "function description() view returns (string)",
]);
const gasPaidEvent = parseAbiItem(
  "event MetaGasPaid(address indexed sender, bytes32 indexed userOpHash, uint256 metaCharged, uint256 gasCostWei, uint256 usdCharged, uint256 metaUsd, uint256 ethUsd, uint8 mode)",
);

export default function DashboardPage() {
  const client = usePublicClient();
  const a = config.addresses;
  const metaFeed = config.deployment?.metaUsdFeed as Address | undefined;

  const data = useQuery({
    queryKey: ["dashboard"],
    enabled: !!a,
    refetchInterval: 15_000,
    queryFn: async () => {
      const pm = a!.paymaster;
      const [stats, cache, deposit, paused, twap] = await Promise.all([
        client.readContract({ address: pm, abi: metaTokenPaymasterAbi, functionName: "stats" }),
        client.readContract({ address: pm, abi: metaTokenPaymasterAbi, functionName: "priceCache" }),
        client.readContract({ address: pm, abi: metaTokenPaymasterAbi, functionName: "getDeposit" }),
        client.readContract({ address: pm, abi: metaTokenPaymasterAbi, functionName: "paused" }),
        client.readContract({ address: a!.oracle, abi: metaPriceOracleAbi, functionName: "twapMetaUsd" }),
      ]);
      let live: { metaUsd: bigint; ethUsd: bigint; mode: number; validUntil: number } | null = null;
      let liveError: string | null = null;
      try {
        const p = await client.readContract({ address: a!.oracle, abi: metaPriceOracleAbi, functionName: "getPrices" });
        live = { metaUsd: p.metaUsd, ethUsd: p.ethUsd, mode: p.mode, validUntil: Number(p.validUntil) };
      } catch (e) {
        liveError = errMsg(e);
      }
      let chainlink: { answer: bigint; updatedAt: number; description: string } | null = null;
      if (metaFeed) {
        const [round, dec, description] = await Promise.all([
          client.readContract({ address: getAddress(metaFeed), abi: feedAbi, functionName: "latestRoundData" }),
          client.readContract({ address: getAddress(metaFeed), abi: feedAbi, functionName: "decimals" }),
          client.readContract({ address: getAddress(metaFeed), abi: feedAbi, functionName: "description" }),
        ]);
        chainlink = { answer: round[1] * 10n ** BigInt(18 - dec), updatedAt: Number(round[3]), description };
      }
      const logs = await client.getLogs({
        address: pm,
        event: gasPaidEvent,
        fromBlock: BigInt(config.deployment?.deployBlock ?? 0),
        toBlock: "latest",
      });
      return { stats, cache, deposit, paused, twap, live, liveError, chainlink, recent: logs.slice(-10).reverse() };
    },
  });

  const d = data.data;
  const cacheValid = d ? Number(d.cache[2]) * 1000 > Date.now() : false;
  const deviationBps =
    d?.chainlink && d.twap[0] && d.chainlink.answer > 0n
      ? Number(((d.twap[1] > d.chainlink.answer ? d.twap[1] - d.chainlink.answer : d.chainlink.answer - d.twap[1]) * 10000n) / d.chainlink.answer)
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Dashboard publik</h1>
        <p className="mt-1 text-sm text-slate-400">Statistik paymaster dan harga oracle langsung dari kontrak (tanpa wallet).</p>
      </div>
      {data.error && <Notice tone="bad">Gagal membaca kontrak: {errMsg(data.error)}</Notice>}

      {d && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Total transaksi" value={d.stats[0].toString()} />
            <Stat label="META terkumpul" value={meta(d.stats[1], 6)} />
            <Stat label="Nilai USD ditagih" value={usd(d.stats[3], 4)} />
            <Stat label="Deposit ETH di EntryPoint" value={eth(d.deposit, 5)} hint={d.paused ? "Paymaster DI-PAUSE" : "aktif"} />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card
              title="Harga yang dipakai paymaster (cache)"
              right={<Badge tone={cacheValid ? "good" : "bad"}>{cacheValid ? "berlaku" : "kedaluwarsa"}</Badge>}
            >
              <Row label="META/USD">{usd(d.cache[0], 4)}</Row>
              <Row label="ETH/USD">{usd(d.cache[1], 2)}</Row>
              <Row label="Sumber / mode">{PRICE_MODE_LABEL[d.cache[4]]}</Row>
              <Row label="Diperbarui">{ts(d.cache[3])}</Row>
              <Row label="Berlaku s/d">{ts(d.cache[2])}</Row>
            </Card>

            <Card title="Oracle hibrida (saat ini)">
              <Row label={d.chainlink?.description ?? "Chainlink META/USD"}>{d.chainlink ? usd(d.chainlink.answer, 4) : "—"}</Row>
              <Row label="Chainlink diperbarui">{d.chainlink ? ts(d.chainlink.updatedAt) : "—"}</Row>
              <Row label="TWAP Uniswap V3 (30 mnt)">{d.twap[0] ? usd(d.twap[1], 4) : "tidak tersedia"}</Row>
              <Row label="Deviasi Chainlink vs TWAP">{deviationBps === null ? "—" : `${(deviationBps / 100).toFixed(2)}%`}</Row>
              <Row label="Keputusan oracle">
                {d.live ? (
                  <span>
                    {PRICE_MODE_LABEL[d.live.mode]} · {usd(d.live.metaUsd, 4)}
                  </span>
                ) : (
                  <span className="text-bad">Circuit breaker / tidak ada harga aman</span>
                )}
              </Row>
              {d.liveError && <p className="mt-2 text-xs text-red-300 break-words">{d.liveError}</p>}
            </Card>
          </div>

          <Card title="Transaksi terbaru (gas dibayar META)">
            {d.recent.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-slate-400">
                    <tr>
                      <th className="py-2">Akun</th>
                      <th>META</th>
                      <th>USD</th>
                      <th>Mode</th>
                      <th>Tx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.recent.map((l) => (
                      <tr key={`${l.transactionHash}-${l.logIndex}`} className="border-t border-ink-line">
                        <td className="py-2 font-mono">{short(l.args.sender)}</td>
                        <td className="font-mono">{meta(l.args.metaCharged, 8)}</td>
                        <td className="font-mono">{usd(l.args.usdCharged, 5)}</td>
                        <td>{PRICE_MODE_LABEL[l.args.mode ?? 0]}</td>
                        <td>
                          <TxLink hash={l.transactionHash ?? undefined} explorer={config.explorer} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Belum ada transaksi.</p>
            )}
          </Card>

          <Card title="Kontrak">
            <Row label="MetaTokenPaymaster">{a!.paymaster}</Row>
            <Row label="MetaPriceOracle">{a!.oracle}</Row>
            <Row label="AgentPayments">{a!.agentPayments}</Row>
            <Row label="META token">{a!.meta}</Row>
            <Row label="EntryPoint v0.7">{a!.entryPoint}</Row>
          </Card>
        </>
      )}
    </div>
  );
}
