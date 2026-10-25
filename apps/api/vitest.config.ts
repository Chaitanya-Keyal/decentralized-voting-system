import { defineConfig } from "vitest/config";

// The API tests run against their own Anvil node and their own database, created for each run, so
// they never touch a development setup.
export default defineConfig({
  test: {
    globalSetup: ["./test/global-setup.ts"],
    setupFiles: ["./test/setup.ts"],
    env: {
      RPC_URL: "http://127.0.0.1:8555",
      CHAIN_ID: "31337",
      // Anvil's second default account, which the node unlocks.
      REGISTRAR_ADDRESS: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      REGISTRAR_PRIVATE_KEY: "",
      // The registrar serves only elections created by Anvil's first default account.
      AUTHORITIES: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      EMAIL_DOMAIN: "hyderabad.bits-pilani.ac.in",
      SMTP_URL: "",
    },
    // The test files share one chain and one database.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
