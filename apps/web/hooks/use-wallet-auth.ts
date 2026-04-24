"use client";

import { useCallback, useEffect } from "react";
import { Networks } from "@creit.tech/stellar-wallets-kit";
import {
  connectWallet,
  getConnectedWalletAddress,
  getWalletsKit,
} from "@/lib/stellar";
import { useAuthStore, jwtMemory } from "@/lib/store/use-auth-store";
import { api } from "@/lib/api";

const EXPECTED_NETWORK =
  (process.env.NEXT_PUBLIC_STELLAR_NETWORK as Networks) ?? Networks.TESTNET;

const JWT_SESSION_KEY = "lance_jwt";

export function useWalletAuth() {
  const {
    walletAddress,
    jwt,
    networkMismatch,
    isLoggedIn,
    setWalletAddress,
    setJwt,
    setNetworkMismatch,
    setHydrated,
    logout,
  } = useAuthStore();

  // Rehydrate JWT from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(JWT_SESSION_KEY);
    if (stored) {
      jwtMemory.set(stored);
      setJwt(stored);
    }
    setHydrated(true);
  }, [setJwt, setHydrated]);

  // Check network matches expected on mount
  useEffect(() => {
    void checkNetwork();
  }, []);

  const checkNetwork = useCallback(async () => {
    try {
      const kit = getWalletsKit();
      const info = await kit.getNetwork();
      const mismatch = info.network !== EXPECTED_NETWORK;
      setNetworkMismatch(mismatch);
    } catch {
      // Wallet not connected yet, no mismatch to report
      setNetworkMismatch(false);
    }
  }, [setNetworkMismatch]);

  const connect = useCallback(async () => {
    try {
      const address = await connectWallet();
      setWalletAddress(address);

      // Check network immediately after connect
      await checkNetwork();

      // Exchange wallet address for JWT via SIWS
      const { token } = await api.auth.getChallenge(address);
      sessionStorage.setItem(JWT_SESSION_KEY, token);
      jwtMemory.set(token);
      setJwt(token);

      return address;
    } catch (err) {
      console.error("Wallet connect failed:", err);
      throw err;
    }
  }, [setWalletAddress, setJwt, checkNetwork]);

  const disconnect = useCallback(() => {
    sessionStorage.removeItem(JWT_SESSION_KEY);
    jwtMemory.clear();
    logout();
  }, [logout]);

  // Listen for account switches from the wallet extension
  useEffect(() => {
    const kit = getWalletsKit();
    if (!kit || typeof kit.on !== "function") return;

    const handler = async () => {
      const address = await getConnectedWalletAddress();
      if (address && address !== walletAddress) {
        setWalletAddress(address);
        await checkNetwork();
      }
    };

    kit.on("accountChanged", handler);
    return () => {
      kit.off?.("accountChanged", handler);
    };
  }, [walletAddress, setWalletAddress, checkNetwork]);

  return {
    walletAddress,
    jwt,
    isLoggedIn,
    networkMismatch,
    connect,
    disconnect,
  };
}