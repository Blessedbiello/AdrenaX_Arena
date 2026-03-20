'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { api } from '../lib/api';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function uint8ArrayToBase58(bytes: Uint8Array): string {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let result = '';
  for (const byte of bytes) {
    if (byte !== 0) break;
    result += '1';
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    result += BASE58_ALPHABET[digits[i]];
  }
  return result;
}

export function useWalletAuth() {
  const { publicKey, signMessage, connected, disconnect } = useWallet();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const authenticatedWallet = useRef<string | null>(null);

  const authenticate = useCallback(async () => {
    if (!publicKey || !signMessage) return false;

    const wallet = publicKey.toBase58();

    // Already authenticated for this wallet
    if (authenticatedWallet.current === wallet) {
      return true;
    }

    setAuthenticating(true);
    try {
      // Get nonce from server
      const { nonce, message } = await api.getNonce(wallet);

      // Sign the authentication message
      const messageBytes = new TextEncoder().encode(message);
      const signature = await signMessage(messageBytes);

      // Convert signature to base58
      const signatureBase58 = uint8ArrayToBase58(signature);

      // Set auth headers for all future API calls
      api.setAuth(wallet, signatureBase58, nonce);

      authenticatedWallet.current = wallet;
      setIsAuthenticated(true);
      return true;
    } catch (err) {
      console.error('Authentication failed:', err);
      api.clearAuth();
      authenticatedWallet.current = null;
      setIsAuthenticated(false);
      return false;
    } finally {
      setAuthenticating(false);
    }
  }, [publicKey, signMessage]);

  // Re-authenticate when wallet changes
  useEffect(() => {
    if (!connected || !publicKey) {
      api.clearAuth();
      authenticatedWallet.current = null;
      setIsAuthenticated(false);
    }
  }, [connected, publicKey]);

  const walletAddress = publicKey?.toBase58() ?? null;

  const handleDisconnect = useCallback(() => {
    api.clearAuth();
    authenticatedWallet.current = null;
    setIsAuthenticated(false);
    disconnect();
  }, [disconnect]);

  return {
    walletAddress,
    connected,
    isAuthenticated,
    authenticating,
    authenticate,
    disconnect: handleDisconnect,
  };
}
