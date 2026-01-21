/*
 * The MUD client code is built on top of viem
 * (https://viem.sh/docs/getting-started.html).
 * This line imports the functions we need from it.
 */
import { Type } from "@latticexyz/recs";
import { defineComponent } from "@latticexyz/recs";
import { world } from "./world";
import { initializeProgram } from "@/network/account";

export type NetworkComponents = ReturnType<typeof createNetworkComponents>;

const heroDataSchema = {
  heroId: Type.Number,
  coordId: Type.Number,
  readyTime: Type.Number,
  owner: Type.String,
  // stats
  health: Type.Number,
  attack: Type.Number,
  defense: Type.Number,
  gold: Type.Number,
  // traits
  combatTrait: Type.String,
  mapTrait: Type.String,
  socialTrait: Type.String,
} as const;

const eventDataSchema = {
  timestamp: Type.Number,
  eventType: Type.String,
  tx: Type.String,
} as const;

export function createNetworkComponents() {
  const components = {
    ChatMessage: defineComponent(world, {
      // role should be either "user" or "assistant"
      role: Type.String,
      content: Type.String,
      accumulatedTotal: Type.Number,
      media: Type.T,
      timestamp: Type.Number,
    }),
    PlayerAccount: defineComponent(world, {
      playerPda: Type.String,
      lastResult: Type.Number,
      accumResult: Type.Number,
      rollCount: Type.Number,
      maxRollCount: Type.Number,
      sessionActive: Type.Boolean,
    }),
  };
  return components;
}

export async function setupNetwork(gameAddress?: string) {
  const components = createNetworkComponents();

  // const solana = await initializeProgram(components);
  // if (!solana) {
  //   throw new Error("Failed to initialize program");
  // }

  return {
    components,
    world,
    // solana,
  };
}

/*
 * Import our MUD config, which includes strong types for
 * our tables and other config options. We use this to generate
 * things like RECS components and get back strong types for them.
 *
 * See https://mud.dev/templates/typescript/contracts#mudconfigts
 * for the source of this information.
 */

export type SetupNetworkResult = Awaited<ReturnType<typeof setupNetwork>>;
