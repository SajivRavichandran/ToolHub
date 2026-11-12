import type { ToolMeta } from "@/tools/types";

export const meta: ToolMeta = {
  id: "csr-generator",
  name: "CSR Generator",
  description:
    "Generate a PKCS#10 CSR and private key (and optional self-signed cert) — entirely in your browser.",
  icon: "🔏",
  type: "local",
};
