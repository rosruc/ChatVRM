import {
  Connection,
  Keypair,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import idl from "./idl/chat_vrf.json";
import { PublicKey } from "@solana/web3.js";
import { pollEvents, subscribeToEvents, GameEvent } from "./event";
import { BASE_ENDPOINT, PLAYER_STORAGE_KEY, SOURCE } from "./config";
import { ensureFunds } from "./solana-utils";
import { NetworkComponents } from "@/mud/setupNetwork";
import { Entity, getComponentValue, setComponent } from "@latticexyz/recs";

export type PlayerAccount = {
  lastResult: number;
  accumResult: number;
  rollCount: number;
  maxRollCount: number;
  sessionActive: boolean;
};

export const initializeProgram = async (components: NetworkComponents) => {
  const { ChatMessage, PlayerAccount } = components;
  try {
    // Get or create keypair
    let storedKeypair = localStorage.getItem(PLAYER_STORAGE_KEY);
    let keypair: Keypair;

    const connection = new Connection(
      BASE_ENDPOINT,
      // "https://api.devnet.solana.com",
      "confirmed"
    );

    if (storedKeypair) {
      const secretKey = Uint8Array.from(JSON.parse(storedKeypair));
      keypair = Keypair.fromSecretKey(secretKey);
    } else {
      keypair = Keypair.generate();
      localStorage.setItem(
        PLAYER_STORAGE_KEY,
        JSON.stringify(Array.from(keypair.secretKey))
      );
    }

    await ensureFunds(connection, keypair);

    // Create the provider
    const provider = new anchor.AnchorProvider(
      connection,
      {
        publicKey: keypair.publicKey,
        signTransaction: async <T extends Transaction | VersionedTransaction>(
          transaction: T
        ): Promise<T> => {
          // @ts-ignore
          transaction.sign(keypair);
          return transaction;
        },
        signAllTransactions: async <
          T extends Transaction | VersionedTransaction
        >(
          transactions: T[]
        ): Promise<T[]> => {
          for (const tx of transactions) {
            // @ts-ignore
            tx.sign(keypair);
          }
          return transactions;
        },
      },
      anchor.AnchorProvider.defaultOptions()
    );

    // User
    console.log("User: ", keypair.publicKey.toBase58());

    // Create the program instance
    const program = new anchor.Program(idl as anchor.Idl, provider);

    console.log(
      "Program instance created successfully: ",
      program.programId.toBase58()
    );

    // Initialize the program
    const playerPda = PublicKey.findProgramAddressSync(
      [Buffer.from("playerd"), provider.publicKey.toBytes()],
      program.programId
    )[0];
    let account = await connection.getAccountInfo(playerPda);
    // @ts-ignore
    if (!account || !account.data || account.data.length === 0) {
      console.log("Player account not found, creating new one...");
      const tx = await program.methods.initialize().rpc();
      console.log("User initialized with tx:", tx);
    } else {
      const player = program.coder.accounts.decode("player", account.data);
      console.log("Player account:", player);
      setComponent(components.PlayerAccount, SOURCE, {
        playerPda: playerPda.toBase58(),
        lastResult: player.lastResult,
        accumResult: player.accumResult,
        rollCount: player.rollCount,
        maxRollCount: player.maxRollCount,
        sessionActive: player.sessionActive,
      });
    }

    // // Subscribe to account changes
    // if (subscriptionIdRef.current !== null) {
    //   await connection.removeAccountChangeListener(subscriptionIdRef.current);
    // }
    const subscriptionAccountChange = connection.onAccountChange(
      playerPda,
      // @ts-ignore
      (accountInfo) => {
        const player = program.coder.accounts.decode(
          "player",
          accountInfo.data
        );
        console.log("Subscription Player account changed:", player);
        setComponent(components.PlayerAccount, SOURCE, {
          playerPda: playerPda.toBase58(),
          lastResult: player.lastResult,
          accumResult: player.accumResult,
          rollCount: player.rollCount,
          maxRollCount: player.maxRollCount,
          sessionActive: player.sessionActive,
        });
      },
      { commitment: "confirmed" }
    );

    // Poll events
    pollEvents(connection, playerPda).then((events: GameEvent[]) => {
      events.forEach((event) => gameEventToChatMessage(components, event));
    });

    // Subscribe to events
    // TODO: might add player account change update to make sure
    const subscriptionEvents = await subscribeToEvents(
      connection,
      playerPda,
      (event: GameEvent) => gameEventToChatMessage(components, event)
    );

    return {
      program,
      connection,
      playerPda,
      keypair,
      subscriptionAccountChange,
      subscriptionEvents,
    };
  } catch (error) {
    console.error("Failed to initialize program:", error);
    // setIsInitialized(false);
    // toast({
    //   title: "Error",
    //   description: "Failed to initialize dice program",
    //   variant: "destructive",
    // });
  }
};

// convert game event to chat message
export const gameEventToChatMessage = (
  components: NetworkComponents,
  gameEvent: GameEvent
) => {
  const { ChatMessage } = components;
  const { type, data } = gameEvent;
  const { timestamp, player } = data;
  const entityId = `${player.toBase58()}-${timestamp}-${type}` as Entity;
  const prevMessage = getComponentValue(ChatMessage, entityId);
  if (prevMessage) return;
  if (type === "diceRollRequested") {
    setComponent(ChatMessage, entityId, {
      role: "user",
      content: data.clientMessage,
      accumulatedTotal: data.accumulatedTotal,
      media: null,
      timestamp: data.timestamp,
    });
  } else if (type === "diceRollResult") {
    setComponent(ChatMessage, entityId, {
      role: "assistant",
      content: `Value increased by ${data.diceResult} to ${data.accumulatedTotal}`,
      accumulatedTotal: data.accumulatedTotal,
      media: null,
      timestamp: data.timestamp,
    });
  } else if (type === "agentTalked") {
    setComponent(ChatMessage, entityId, {
      role: "assistant",
      content: data.agentMessage,
      accumulatedTotal: data.accumulatedTotal,
      media: null,
      timestamp: data.timestamp,
    });
  }
};
