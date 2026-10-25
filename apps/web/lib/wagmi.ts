import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { injectedWallet } from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";

import { anvilWallets } from "./anvil-wallet";
import { chain, isLocalChain, rpcUrl } from "./env";

const connectors = connectorsForWallets(
  [
    // Browser extensions such as MetaMask or Rabby; installed ones are also listed by name.
    { groupName: "Wallets", wallets: [injectedWallet] },
    ...(isLocalChain ? [{ groupName: "Anvil (development)", wallets: anvilWallets() }] : []),
  ],
  // Only WalletConnect wallets use a project ID, and none is listed.
  { appName: "DVote", projectId: "unused" },
);

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors,
  transports: { [chain.id]: http(rpcUrl) },
  // Anvil mines each transaction at once, so receipts can be polled often.
  pollingInterval: isLocalChain ? 250 : 4_000,
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
