import { create } from 'zustand';
import {
  StellarWalletsKit,
  WalletNetwork,
  allowAllModules,
} from '@creit.tech/stellar-wallets-kit';
import { toast } from 'sonner';

export type SupportedNetwork = 'MAINNET' | 'TESTNET';

interface WalletState {
  address: string | null;
  network: SupportedNetwork;
  isConnecting: boolean;
  walletId: string | null;
  kit: StellarWalletsKit;
  connect: () => Promise<void>;
  disconnect: () => void;
  setNetwork: (network: SupportedNetwork) => void;
  signTransaction: (xdr: string) => Promise<string | null>;
  signAuthMessage: (message: string) => Promise<string | null>;
  checkNetworkMismatch: () => Promise<void>;
}

// Ensure it only runs in browser
const kit = typeof window !== 'undefined' 
  ? new StellarWalletsKit({
      network: WalletNetwork.TESTNET,
      selectedWalletId: 'freighter',
      modules: allowAllModules(),
    })
  : ({} as StellarWalletsKit); // Placeholder for SSR

export const useWallet = create<WalletState>((set, get) => ({
  address: null,
  network: 'TESTNET',
  isConnecting: false,
  walletId: null,
  kit,
  connect: async () => {
    set({ isConnecting: true });
    try {
      await get().kit.openModal({
        onWalletSelected: async (option: any) => {
          try {
            get().kit.setWallet(option.id);
            const { address } = await get().kit.getAddress();
            set({ address, walletId: option.id, isConnecting: false });
            toast.success('Wallet connected successfully!');
            await get().checkNetworkMismatch();
          } catch (error) {
            console.error('Failed to get address:', error);
            toast.error('Failed to get wallet address.');
            set({ isConnecting: false });
          }
        },
        onClosed: () => {
          set({ isConnecting: false });
        }
      });
    } catch (error) {
      console.error('Connection error:', error);
      toast.error('Connection failed. Please try again.');
      set({ isConnecting: false });
    }
  },
  disconnect: () => {
    set({ address: null, walletId: null });
    toast.info('Wallet disconnected.');
  },
  setNetwork: (network: SupportedNetwork) => {
    const stellarNetwork = network === 'MAINNET' ? WalletNetwork.PUBLIC : WalletNetwork.TESTNET;
    get().kit.setNetwork(stellarNetwork);
    set({ network });
    get().checkNetworkMismatch();
  },
  checkNetworkMismatch: async () => {
    const state = get();
    if (!state.address) return;
    try {
      const activeNetwork = await state.kit.getNetwork();
      const expectedNetwork = state.network === 'MAINNET' ? WalletNetwork.PUBLIC : WalletNetwork.TESTNET;
      if (activeNetwork !== expectedNetwork && (activeNetwork as any)?.network !== expectedNetwork) {
        toast.warning(`Network mismatch! App is on ${state.network}.`);
      }
    } catch (error) {
      console.error("Failed to check network", error);
    }
  },
  signTransaction: async (xdr: string) => {
    try {
      const result = await get().kit.signTransaction(xdr);
      return result.signedXDR || result;
    } catch (error) {
      console.error('Sign error:', error);
      toast.error('Transaction rejected by the wallet extension.');
      return null;
    }
  },
  signAuthMessage: async (message: string) => {
    try {
      // SIWS or arbitrary message signing
      const result = await get().kit.sign({ xdr: message } as any);
      return result.signedXDR || result;
    } catch(err) {
      toast.error('Failed to sign authentication message.');
      return null;
    }
  }
}));
