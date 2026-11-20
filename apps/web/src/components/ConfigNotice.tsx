"use client";
import { config } from "@/lib/config";
import { Notice } from "./ui";

export function ConfigNotice() {
  if (config.addresses) return null;
  return (
    <Notice tone="warn">
      Alamat kontrak META Chain belum dikonfigurasi. Isi <code>NEXT_PUBLIC_DEPLOYMENT_JSON</code> dengan isi{" "}
      <code>contracts/deployments/&lt;nama&gt;.json</code> (lihat <code>apps/web/.env.example</code>). Untuk demo lokal,
      jalankan <code>scripts/e2e-local.sh up</code> yang menulis <code>apps/web/.env.local</code> secara otomatis.
    </Notice>
  );
}
