import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { CHAT_VRF_PROGRAM_ID } from "./config";
import idl from "./idl/chat_vrf.json";

// Helper to create a minimal provider for IDL fetching and event parsing
function createProvider(connection: Connection): anchor.AnchorProvider {
  const dummyKeypair = Keypair.generate();
  return new anchor.AnchorProvider(
    connection,
    {
      publicKey: dummyKeypair.publicKey,
      signTransaction: async (tx) => tx,
      signAllTransactions: async (txs) => txs,
    },
    anchor.AnchorProvider.defaultOptions()
  );
}

// Event types based on the IDL
export type DiceRollRequested = {
  player: PublicKey;
  payer: PublicKey;
  rollNumber: number;
  maxRolls: number;
  accumulatedTotal: number;
  clientMessage: string;
  timestamp: number;
};

export type DiceRollResult = {
  player: PublicKey;
  rollNumber: number;
  diceResult: number;
  accumulatedTotal: number;
  maxRolls: number;
  timestamp: number;
};

export type AgentTalked = {
  player: PublicKey;
  payer: PublicKey;
  rollNumber: number;
  accumulatedTotal: number;
  agentMessage: string;
  timestamp: number;
};

export type SessionEnded = {
  player: PublicKey;
  payer: PublicKey;
  won: boolean;
  accumulatedTotal: number;
  rollsMade: number;
  timestamp: number;
};

export type GameEvent =
  | { type: "diceRollRequested"; data: DiceRollRequested }
  | { type: "diceRollResult"; data: DiceRollResult }
  | { type: "agentTalked"; data: AgentTalked }
  | { type: "sessionEnded"; data: SessionEnded };

/**
 * Maps a parsed Anchor event to a GameEvent type
 * @param eventName - The name of the event from Anchor
 * @param eventDataObj - The event data object from Anchor
 * @returns A GameEvent or null if the event type is not recognized
 */
function mapEventToGameEvent(
  eventName: string,
  eventDataObj: any
): GameEvent | null {
  if (eventName === "diceRollRequested") {
    return {
      type: "diceRollRequested",
      data: {
        player: new PublicKey(eventDataObj.player),
        payer: new PublicKey(eventDataObj.payer),
        rollNumber: eventDataObj.rollNumber,
        maxRolls: eventDataObj.maxRolls,
        accumulatedTotal: eventDataObj.accumulatedTotal,
        clientMessage: eventDataObj.clientMessage,
        timestamp: Number(eventDataObj.timestamp),
      },
    };
  } else if (eventName === "diceRollResult") {
    return {
      type: "diceRollResult",
      data: {
        player: new PublicKey(eventDataObj.player),
        rollNumber: eventDataObj.rollNumber,
        diceResult: eventDataObj.diceResult,
        accumulatedTotal: eventDataObj.accumulatedTotal,
        maxRolls: eventDataObj.maxRolls,
        timestamp: Number(eventDataObj.timestamp),
      },
    };
  } else if (eventName === "agentTalked") {
    return {
      type: "agentTalked",
      data: {
        player: new PublicKey(eventDataObj.player),
        payer: new PublicKey(eventDataObj.payer),
        rollNumber: eventDataObj.rollNumber,
        accumulatedTotal: eventDataObj.accumulatedTotal,
        agentMessage: eventDataObj.agentMessage,
        timestamp: Number(eventDataObj.timestamp),
      },
    };
  } else if (eventName === "sessionEnded") {
    return {
      type: "sessionEnded",
      data: {
        player: new PublicKey(eventDataObj.player),
        payer: new PublicKey(eventDataObj.payer),
        won: eventDataObj.won,
        accumulatedTotal: eventDataObj.accumulatedTotal,
        rollsMade: eventDataObj.rollsMade,
        timestamp: Number(eventDataObj.timestamp),
      },
    };
  }

  return null;
}

/**
 * Polls events from the ephemeral network for a specific PDA
 * @param connection - The ephemeral network connection
 * @param playerPda - The player PDA to filter events for
 * @param options - Optional configuration
 * @param options.limit - Maximum number of events to return (default: 20)
 * @param options.signatureLimit - Maximum number of signatures to fetch (default: 30, higher = more RPC load)
 * @param options.batchSize - Number of transactions to fetch per batch (default: 5)
 * @returns Array of parsed events
 */
export async function pollEvents(
  connection: Connection,
  playerPda: PublicKey,
  options: { limit?: number; signatureLimit?: number; batchSize?: number } = {}
): Promise<GameEvent[]> {
  const { limit = 10, signatureLimit = 30, batchSize = 10 } = options;

  console.log(
    "pollEvents(connection, playerPda, options)",
    connection,
    playerPda,
    options
  );

  try {
    // Get cached or fetch IDL
    const provider = createProvider(connection);
    const program = new anchor.Program(idl, provider);

    // Get recent signatures for the player PDA
    // Note: This is lightweight (1 RPC call)
    // Note: getSignaturesForAddress requires at least 'confirmed' commitment
    const signatures = await connection.getSignaturesForAddress(
      playerPda,
      {
        limit: signatureLimit,
      },
      "confirmed"
    );

    if (signatures.length === 0) {
      return [];
    }

    // Get parsed transactions in batches to avoid rate limits
    // Note: This is the heaviest RPC call - fetches full transaction data
    // Batching helps avoid 429 errors while still getting all signatures
    const signatureStrings = signatures.map((sig) => sig.signature);
    const transactions: any[] = [];

    for (let i = 0; i < signatureStrings.length; i += batchSize) {
      const batch = signatureStrings.slice(i, i + batchSize);

      try {
        const batchTransactions = await connection.getParsedTransactions(
          batch,
          {
            maxSupportedTransactionVersion: 0,
            commitment: "confirmed",
          }
        );
        transactions.push(...batchTransactions.filter((tx) => tx !== null));
      } catch (error: any) {
        // If rate limited, log and continue with next batch
        if (error?.message?.includes("429") || error?.status === 429) {
          console.warn(
            `Rate limited on batch ${
              Math.floor(i / batchSize) + 1
            }. Skipping batch.`
          );
        } else {
          // Re-throw non-rate-limit errors
          throw error;
        }
      }

      // Delay between batches to avoid rate limits
      // Only delay if there are more batches to process
      // if (i + batchSize < signatureStrings.length) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      // }
    }
    const events: GameEvent[] = [];

    // Parse events from transaction logs
    for (const tx of transactions) {
      if (!tx || !tx.meta || tx.meta.err) continue;

      const logs = tx.meta.logMessages || [];

      // Find event logs (Anchor events start with "Program data:")
      for (let i = 0; i < logs.length; i++) {
        const log = logs[i];

        if (log && log.includes("Program data:")) {
          const gameEvent = parsePlayerPdaEventLog(program, playerPda, log);
          if (!gameEvent) {
            console.error("Could not parse event for player", log);
            continue;
          }
          events.push(gameEvent);
        }
      }
    }

    // Sort by timestamp (newest first) and return up to limit
    return events.sort((a, b) => {
      const timestampA = a.data.timestamp;
      const timestampB = b.data.timestamp;
      return timestampB - timestampA;
    });
    // .slice(0, limit);
  } catch (error) {
    console.error("Error polling events:", error);
    throw error;
  }
}

/**
 * Subscribes to ongoing events from a specific PDA on the ephemeral network
 *
 * Note: This subscribes to ALL program logs and filters client-side.
 * If there are many players, you'll receive all their events and filter locally.
 * This is efficient for subscriptions (push-based) but processes all program events.
 *
 * @param connection - The ephemeral network connection
 * @param playerPda - The player PDA to filter events for
 * @param callback - Callback function called when a new event is received
 * @returns Promise that resolves to the subscription ID that can be used to unsubscribe
 */
export async function subscribeToEvents(
  connection: Connection,
  playerPda: PublicKey,
  callback: (event: GameEvent) => void
): Promise<number> {
  // Get cached or fetch IDL
  const provider = createProvider(connection);
  const program = new anchor.Program(idl, provider);

  // Subscribe to logs for the program
  // Note: This receives ALL events from the program, then filters client-side
  // For high-traffic programs, consider server-side filtering or account subscriptions
  const subscriptionId = connection.onLogs(
    CHAT_VRF_PROGRAM_ID,
    (logs, context) => {
      try {
        for (const log of logs.logs) {
          if (log && log.includes("Program data:")) {
            const gameEvent = parsePlayerPdaEventLog(program, playerPda, log);
            if (!gameEvent)
              return console.error("Could not parse event for player", log);
            callback(gameEvent);
          }
        }
      } catch (error) {
        console.error("Error processing log subscription:", error);
      }
    },
    "confirmed"
  );

  return subscriptionId;
}

const parsePlayerPdaEventLog = (
  program: anchor.Program,
  playerPda: PublicKey,
  log: string
) => {
  // Extract base64 data from log
  const base64Data = log.split("Program data: ")[1]?.trim();
  if (!base64Data) return null;
  // Parse event using Anchor's event parser (decode expects base64 string)
  const event = program.coder.events.decode(base64Data);
  if (!event) return null;
  const eventDataObj = event.data as any;
  // Filter events for this specific player PDA
  if (eventDataObj.player && eventDataObj.player.equals(playerPda)) {
    const gameEvent = mapEventToGameEvent(event.name, eventDataObj);
    return gameEvent;
  }
  return null;
};

/**
 * Unsubscribes from event logs
 * @param connection - The connection to unsubscribe from
 * @param subscriptionId - The subscription ID returned from subscribeToEvents
 */
export async function unsubscribeFromEvents(
  connection: Connection,
  subscriptionId: number
): Promise<void> {
  try {
    await connection.removeOnLogsListener(subscriptionId);
  } catch (error) {
    console.error("Error unsubscribing from events:", error);
    throw error;
  }
}
