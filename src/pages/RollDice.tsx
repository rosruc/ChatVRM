import { useMUD } from "@/mud/MUDContext";
import { useToast } from "@/hooks/use-toast";
import Dice from "@/components/dice";
import { useState } from "react";
import { useEntityQuery } from "@latticexyz/react";
import { Has } from "@latticexyz/recs";
import { PlayerAccount, setPlayerAccountComponent } from "@/network/account";

export default function RollDice() {
  const { components, network } = useMUD();
  const { connection, playerPda, program } = network.solana;
  const { toast } = useToast();

  const [diceValue, setDiceValue] = useState(1);
  const [isRolling, setIsRolling] = useState(false);

  // const { ChatMessage } = components;
  // const chatMessages = useEntityQuery([Has(ChatMessage)]);
  // console.log("chatMessages", chatMessages);

  const handleStartSession = async () => {
    try {
      const tx = await program.methods.startSession(40).rpc({
        commitment: "confirmed",
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      await connection.confirmTransaction(
        {
          signature: tx,
          blockhash,
          lastValidBlockHeight,
        },
        "finalized" // or "finalized" if you want to be extra sure
      );
      const account = await connection.getAccountInfo(playerPda);
      if (account && account.data) {
        const player = program.coder.accounts.decode(
          "player",
          account.data
        ) as PlayerAccount;
        console.log("Finalized Player account:", player);
        setPlayerAccountComponent(components, playerPda.toBase58(), player);
      }
      toast({
        title: "Session Started",
        description: `TX: ${tx.slice(0, 8)}...`,
      });
    } catch (error) {
      console.error("Error starting session:", error);
      toast({
        title: "Error",
        description: "Failed to start session",
        variant: "destructive",
      });
    }
  };

  const handleRollDice = async () => {
    try {
      const tx = await program.methods
        .rollDice(
          Math.floor(Math.random() * 6) + 1,
          `test message ${Math.random()}`
        )
        .rpc({
          commitment: "confirmed",
          skipPreflight: false,
          preflightCommitment: "confirmed",
        });
      console.log("Dice rolled on-chain with tx:", tx);

      // obtain account info
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      await connection.confirmTransaction(
        {
          signature: tx,
          blockhash,
          lastValidBlockHeight,
        },
        "finalized" // or "finalized" if you want to be extra sure
      );
      console.log("Finalized! Now reading account...");
      const account = await connection.getAccountInfo(playerPda);
      if (account && account.data) {
        const player = program.coder.accounts.decode(
          "player",
          account.data
        ) as PlayerAccount;
        console.log("Finalized Player account:", player);
        setPlayerAccountComponent(components, playerPda.toBase58(), player);
      }

      toast({
        title: "Dice Rolled",
        description: `Result: TX: ${tx.slice(0, 8)}...`,
      });

      // // Simulate rolling animation by changing values rapidly
      // rollIntervalRef.current = setInterval(() => {
      //   setDiceValue(Math.floor(Math.random() * 6) + 1);
      // }, 100);

      // // Add a timeout to stop rolling after 10 seconds if still rolling
      // setTimeout(() => {
      //   if (isRolling) {
      //     console.log("Rolling timeout reached (10s), stopping animation");
      //     setIsRolling(false);
      //     clearRollInterval();
      //     toast({
      //       title: "Notice",
      //       description:
      //         "Dice roll is taking longer than expected. Check transaction status in explorer.",
      //       variant: "destructive",
      //     });
      //   }
      // }, 10000);
    } catch (error) {
      console.error("Error rolling dice:", error);
      toast({
        title: "Error",
        description: "Failed to roll dice",
        variant: "destructive",
      });
      // setIsRolling(false);
      // clearRollInterval();
    }
  };
  return (
    <div className="flex flex-col bg-gray-100">
      <div className="flex flex-col items-center justify-center flex-grow">
        <h1 className="text-3xl font-bold mb-8">Dice Roller</h1>
        <div className="mb-8">
          <Dice
            value={diceValue}
            isRolling={isRolling}
            onClick={handleRollDice}
          />
        </div>
        <button
          onClick={handleRollDice}
          disabled={isRolling}
          className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium shadow-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isRolling ? "Rolling..." : "Roll Dice"}
        </button>
        <button
          onClick={handleStartSession}
          disabled={isRolling}
          className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium shadow-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isRolling ? "Starting Session..." : "Start Session"}
        </button>
      </div>
    </div>
  );
}
