"use client";
import { config } from "@/lib/config";
import { Notice } from "./ui";

export function ConfigNotice() {
  if (config.addresses) return null;
  if (config.deploymentChainMismatch) {
    return (
      <Notice tone="bad">
        <code>NEXT_PUBLIC_DEPLOYMENT_JSON</code> berisi deployment untuk jaringan lain (bukan chain {config.chain.id}). Isi
        dengan file deployment {config.network === "mainnet" ? "mainnet" : "testnet"} yang benar.
      </Notice>
    );
  }
  if (config.network === "mainnet") {
    return (
      <Notice tone="warn">
        Kontrak paymaster META Chain <strong>belum di-deploy di Robinhood Chain mainnet</strong>. Pembayaran gas dengan META
        belum bisa dipakai; Dashboard menampilkan data harga mainnet secara live. Setelah deploy, isi{" "}
        <code>NEXT_PUBLIC_DEPLOYMENT_JSON</code> dengan <code>contracts/deployments/robinhood-mainnet.json</code>.
      </Notice>
    );
  }
  return (
    <Notice tone="warn">
      Alamat kontrak META Chain belum dikonfigurasi. Isi <code>NEXT_PUBLIC_DEPLOYMENT_JSON</code> dengan isi{" "}
      <code>contracts/deployments/&lt;nama&gt;.json</code> (lihat <code>apps/web/.env.example</code>). Untuk demo lokal,
      jalankan <code>scripts/e2e-local.sh up</code> yang menulis <code>apps/web/.env.local</code> secara otomatis.
    </Notice>
  );
}
