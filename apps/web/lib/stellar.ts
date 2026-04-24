import { Horizon, Networks } from "@stellar/stellar-sdk";

export const APP_STELLAR_NETWORK = (process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet").toUpperCase() === "PUBLIC" 
  ? Networks.PUBLIC 
  : Networks.TESTNET;

const HORIZON_URL = process.env.NEXT_PUBLIC_HORIZON_URL || "https://horizon-testnet.stellar.org";
export const horizonServer = new Horizon.Server(HORIZON_URL);

/**
 * Validates if a string is a valid Stellar public key (G...)
 */
export function isValidStellarAddress(address: string): boolean {
  try {
    return /^[G][A-Z2-7]{55}$/.test(address);
  } catch {
    return false;
  }
}

/**
 * Gets the current network configuration for the wallet
 */
export function getWalletNetwork(): string {
  return APP_STELLAR_NETWORK === Networks.PUBLIC ? "public" : "testnet";
}

/**
 * Disconnects the wallet by clearing session data
 */
export function disconnectWallet(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem("wallet_address");
    localStorage.removeItem("wallet_type");
    // Dispatch custom event if your app listens for storage changes
    window.dispatchEvent(new Event("storage"));
  }
}