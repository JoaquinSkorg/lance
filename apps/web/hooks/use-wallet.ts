"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { useWalletStore } from "@/lib/store/use-wallet-store";
import { getWalletsKit } from "@/lib/stellar";
import { toast } from "sonner";
import { WalletNetwork } from "@creit.tech/stellar-wallets-kit";

export function useWallet() {
  const { 
    address, 
    walletId, 
    status, 
    network,
    setConnection, 
    setStatus, 
    setError, 
    setNetwork: setStoreNetwork,
    disconnect: disconnectStore,
  } = useWalletStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const isInitialized = useRef(false);

  const connect = useCallback(async () => {
    setStatus("connecting");
    try {
      const kit = getWalletsKit();
      await kit.openModal({
        onWalletSelected: async (option: any) => {
          try {
            kit.setWallet(option.id);
            const { address: connectedAddress } = await kit.getAddress();
            setConnection(connectedAddress, option.id);
            toast.success("Wallet connected successfully");
            setIsModalOpen(false);
          } catch (err) {
            console.error(err);
            toast.error("Failed to get wallet address");
            setStatus("error");
          }
        },
        onClosed: () => {
          setStatus(address ? "connected" : "disconnected");
          setIsModalOpen(false);
        }
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to connect wallet";
      setError(message);
      toast.error(message);
    }
  }, [address, setConnection, setError, setStatus]);

  const handleDisconnect = useCallback(() => {
    disconnectStore();
    toast.info("Wallet disconnected");
  }, [disconnectStore]);

  const setNetwork = useCallback((newNetwork: 'MAINNET' | 'TESTNET') => {
    const stellarNetwork = newNetwork === 'MAINNET' ? WalletNetwork.PUBLIC : WalletNetwork.TESTNET;
    const kit = getWalletsKit();
    kit.setNetwork(stellarNetwork);
    setStoreNetwork(stellarNetwork as any);
  }, [setStoreNetwork]);

  const signTransaction = useCallback(async (xdr: string) => {
    try {
      const kit = getWalletsKit();
      const result = await kit.signTransaction(xdr);
      return result.signedXDR || result;
    } catch (error) {
      console.error('Sign error:', error);
      toast.error('Transaction rejected by the wallet extension.');
      return null;
    }
  }, []);

  const signAuthMessage = useCallback(async (message: string) => {
    try {
      const kit = getWalletsKit();
      const result = await kit.sign({ xdr: message } as any);
      return result.signedXDR || result;
    } catch(err) {
      toast.error('Failed to sign authentication message.');
      return null;
    }
  }, []);

  // Auto-connect
  useEffect(() => {
    if (isInitialized.current) return;

    const attemptAutoConnect = async () => {
      if (address && walletId) {
        try {
          const kit = getWalletsKit();
          const { address: currentAddress } = await kit.getAddress();

          if (currentAddress === address) {
            setStatus("connected");
          } else {
            setConnection(currentAddress, walletId);
          }
        } catch (err) {
          console.error("Auto-connect failed:", err);
          disconnectStore();
        }
      }
      isInitialized.current = true;
    };

    attemptAutoConnect();
  }, [address, walletId, setConnection, setStatus, disconnectStore]);

  return {
    address,
    walletId,
    status,
    network,
    connect,
    disconnect: handleDisconnect,
    setNetwork,
    signTransaction,
    signAuthMessage,
    isConnected: status === "connected",
    isConnecting: status === "connecting",
    isModalOpen,
    setIsModalOpen,
  };
}
