import { Horizon } from "@stellar/stellar-sdk";
import { 
  StellarWalletsKit, 
  WalletNetwork, 
  allowAllModules 
} from "@creit.tech/stellar-wallets-kit";

export type StellarNetwork = "public" | "testnet";

export const APP_STELLAR_NETWORK: StellarNetwork =
  (process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet").toLowerCase() === "public"
    ? "public"
    : "testnet";

const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL ||
  (APP_STELLAR_NETWORK === "public" 
    ? "https://horizon.stellar.org" 
    : "https://horizon-testnet.stellar.org");

export const horizonServer = new Horizon.Server(HORIZON_URL);

let kitInstance: StellarWalletsKit | null = null;

export function getWalletsKit(): StellarWalletsKit {
  if (typeof window === "undefined") {
    return {} as StellarWalletsKit;
  }
  
  if (!kitInstance) {
    kitInstance = new StellarWalletsKit({
      network: APP_STELLAR_NETWORK === "public" ? WalletNetwork.PUBLIC : WalletNetwork.TESTNET,
      selectedWalletId: "freighter",
      modules: allowAllModules(),
    });
  }
  return kitInstance;
}

export function isValidStellarAddress(address: string): boolean {
  return /^[G][A-Z2-7]{55}$/.test(address);
}

export function getWalletNetwork(): StellarNetwork {
  return APP_STELLAR_NETWORK;
}

export async function getXlmBalance(address: string): Promise<number> {
  try {
    const account = await horizonServer.loadAccount(address);
    const native = account.balances.find((b) => b.asset_type === "native");
    return native ? parseFloat(native.balance) : 0;
  } catch (err) {
    console.error("Error fetching XLM balance:", err);
    return 0;
  }
}