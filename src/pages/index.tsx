import { setup } from "@/mud";
import { MUDProvider } from "@/mud/MUDContext";
import { useEffect, useState, useRef } from "react";
import VrmChat from "./VrmChat";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";
import SolanaAddress from "@/components/solana-address";
import RollDice from "./RollDice";

export default function Story() {
  const { toast } = useToast();
  const [result, setResult] = useState<any>(null);
  const hasSetup = useRef(false);

  useEffect(() => {
    if (hasSetup.current) return;
    hasSetup.current = true;

    setup().then((result) => {
      console.log("setup result", result);
      setResult(result);
      toast({
        title: "Setup complete",
        description: "Setup complete",
      });
    });
  }, []);

  if (!result) {
    return <h1>Loading...</h1>;
  }

  return (
    <MUDProvider value={result}>
      <div className="absolute top-4 right-4 z-10">
        <SolanaAddress
          onBalanceChange={() => {
            // handleBalanceChange;
          }}
        />
      </div>
      <RollDice />
      <VrmChat />
      <Toaster />
    </MUDProvider>
  );
}
