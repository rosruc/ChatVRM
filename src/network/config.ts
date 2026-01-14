import { Entity } from "@latticexyz/recs";
import { PublicKey } from "@solana/web3.js";

export const CHAT_VRF_PROGRAM_ID = new PublicKey(
  "EEyqAQLaZC9RyY7qLYKH2AyXLGRNiXTRvHcPzAwwc5Ej"
);
export const PLAYER_SEED = "playerd";
export const AGENT_SEED = "agent";
export const ORACLE_QUEUE = new PublicKey(
  "5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc"
);
export const BASE_ENDPOINT = "https://rpc.magicblock.app/devnet";
export const PLAYER_STORAGE_KEY = "solanaKeypair";
export const PAYER_STORAGE_KEY = "delegatePayerKeypair";
export const MIN_BALANCE_LAMPORTS = 0.05;
export const BLOCKHASH_CACHE_MAX_AGE_MS = 30000;
export const BLOCKHASH_REFRESH_INTERVAL_MS = 15000;
export const ROLL_TIMEOUT_MS = 2000;
export const ROLL_ANIMATION_INTERVAL_MS = 100;

export const SOURCE = "SOURCE" as Entity;
