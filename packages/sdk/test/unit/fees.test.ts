import { describe, expect, it } from "vitest";
import {
  BPS,
  computeActualCharge,
  maxCostWei,
  metaToUsd,
  usdToMetaWithMarkup,
  weiToUsd,
  WAD,
} from "../../src/fees.js";

const META_PRICE = 583_500000000000000000n; // $583.50
const ETH_PRICE = 1748_270000000000000000n; // $1748.27

function ceilDiv(a: bigint, b: bigint) {
  return a % b === 0n ? a / b : a / b + 1n;
}

describe("fee math mirrors MetaTokenPaymaster", () => {
  it("weiToUsd rounds up", () => {
    expect(weiToUsd(1n, ETH_PRICE)).toBe(1749n);
    expect(weiToUsd(WAD, ETH_PRICE)).toBe(ETH_PRICE);
  });

  it("usdToMetaWithMarkup = ceil(usd*(1+markup)/price)", () => {
    const usd = 1_000_000_000_000_000n; // $0.001
    // 0.001 * 1.05 / 583.5 = 1.7994858611825...e-6 META -> ceil in wei units
    expect(usdToMetaWithMarkup(usd, META_PRICE, 500n)).toBe(1799485861183n);
    expect(usdToMetaWithMarkup(usd, META_PRICE, 0n)).toBe(ceilDiv(usd * WAD, META_PRICE));
  });

  it("markup is monotonic and never rounds to zero for non-zero usd", () => {
    for (const usd of [1n, 10n ** 9n, 10n ** 15n, 10n ** 18n]) {
      const a = usdToMetaWithMarkup(usd, META_PRICE, 500n);
      const b = usdToMetaWithMarkup(usd, META_PRICE, 1000n);
      expect(a).toBeGreaterThan(0n);
      expect(b).toBeGreaterThanOrEqual(a);
    }
  });

  it("metaToUsd inverts conversion within rounding", () => {
    const usd = 123_456_789_000_000_000n;
    const meta = usdToMetaWithMarkup(usd, META_PRICE, 0n);
    const back = metaToUsd(meta, META_PRICE);
    expect(back).toBeGreaterThanOrEqual(usd);
    expect(back - usd).toBeLessThan(META_PRICE / WAD + 1n);
  });

  it("maxCostWei equals EntryPoint v0.7 requiredPrefund", () => {
    const gas = {
      callGasLimit: 100_000n,
      verificationGasLimit: 150_000n,
      preVerificationGas: 50_000n,
      paymasterVerificationGasLimit: 150_000n,
      paymasterPostOpGasLimit: 120_000n,
      maxFeePerGas: 20_000_000n,
    };
    expect(maxCostWei(gas)).toBe(570_000n * 20_000_000n);
  });

  it("computeActualCharge adds postOp overhead + 10% unused-gas bound and caps at pre-charge", () => {
    const args = {
      actualGasCost: 2_000_000_000_000n,
      actualUserOpFeePerGas: 11_000_000n,
      executionGasLimit: 220_000n,
      postOpOverheadGas: 65_000n,
      metaUsd: META_PRICE,
      ethUsd: ETH_PRICE,
      markupBps: 500n,
      preCharge: 10n ** 18n,
    };
    const extraGas = 65_000n + ((220_000n - 65_000n) * 10n) / 100n;
    const gasCost = args.actualGasCost + extraGas * args.actualUserOpFeePerGas;
    const expected = usdToMetaWithMarkup(weiToUsd(gasCost, ETH_PRICE), META_PRICE, 500n);
    expect(computeActualCharge(args)).toBe(expected);
    expect(computeActualCharge({ ...args, preCharge: 5n })).toBe(5n);
  });

  it("realistic Robinhood op costs a few cents at most", () => {
    const wei = 300_000n * 20_000_000n; // 300k gas @ 0.02 gwei
    const usd = (weiToUsd(wei, ETH_PRICE) * (BPS + 500n)) / BPS;
    expect(usd).toBeLessThan(5n * 10n ** 16n); // < $0.05 (~$0.011 here)
  });
});
