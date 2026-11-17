// A development wallet: one of the accounts a local Anvil node unlocks, which the node signs for.
// It lets you try every role from one browser without a wallet extension. Only for Anvil.
import type { Wallet } from "@rainbow-me/rainbowkit";
import { getAddress, numberToHex, type Address } from "viem";
import { createConnector } from "wagmi";

import { rpcUrl } from "./env";

/** Anvil's default accounts. These are public test accounts, not anyone's funds. */
const ANVIL_ACCOUNTS: readonly Address[] = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
  "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
  "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
  "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955",
  "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8F",
  "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720",
];

const ICON =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#27272a"/><path d="M9 22 16 9l7 13z" fill="#fafafa"/></svg>',
  );

function anvilConnector(account: Address) {
  const storageKey = `dvote.anvil.${account}`;
  return createConnector((config) => {
    const chain = config.chains[0];

    async function request({ method, params }: { method: string; params?: unknown }) {
      if (method === "eth_accounts" || method === "eth_requestAccounts") return [account];
      if (method === "eth_chainId") return numberToHex(chain.id);
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const body = (await response.json()) as { result?: unknown; error?: { message: string } };
      if (body.error) throw new Error(body.error.message);
      return body.result;
    }

    return {
      id: `anvil-${account}`,
      name: "Anvil account",
      type: "anvil",
      connect() {
        localStorage.setItem(storageKey, "1");
        return Promise.resolve({ accounts: [account] as never, chainId: chain.id });
      },
      disconnect() {
        localStorage.removeItem(storageKey);
        return Promise.resolve();
      },
      getAccounts: () => Promise.resolve([account]),
      getChainId: () => Promise.resolve(chain.id),
      getProvider: () => Promise.resolve({ request }),
      isAuthorized: () => Promise.resolve(localStorage.getItem(storageKey) === "1"),
      switchChain: () => Promise.resolve(chain),
      onAccountsChanged(accounts: string[]) {
        config.emitter.emit("change", { accounts: accounts.map((value) => getAddress(value)) });
      },
      onChainChanged() {
        // The connector is fixed to the local chain.
      },
      onDisconnect() {
        config.emitter.emit("disconnect");
      },
    };
  });
}

/** RainbowKit wallets for Anvil's accounts, numbered as Anvil prints them. */
export function anvilWallets(): (() => Wallet)[] {
  return ANVIL_ACCOUNTS.map((account, index) => () => ({
    id: `anvil-${index}`,
    name: `Anvil account ${index} (${account.slice(0, 6)}…${account.slice(-4)})`,
    iconUrl: ICON,
    iconBackground: "#27272a",
    installed: true,
    createConnector: (details) =>
      createConnector((config) => ({ ...anvilConnector(account)(config), ...details })),
  }));
}
