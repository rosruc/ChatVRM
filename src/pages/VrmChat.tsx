import { useCallback, useContext, useEffect, useRef, useState } from "react";
import VrmViewer from "@/components/vrmViewer";
import { ViewerContext } from "@/features/vrmViewer/viewerContext";
import {
  Message,
  textToScreenplay,
  Screenplay,
  splitSentence,
  splitSentenceWithTags,
} from "@/features/messages/messages";
import { speakCharacter } from "@/features/messages/speakCharacter";
import { CharacterRuntime } from "@/features/characterRuntime/characterRuntime";
import { MessageInputContainer } from "@/components/messageInputContainer";
import { SYSTEM_PROMPT } from "@/features/constants/systemPromptConstants";
import {
  KoeiroParam,
  DEFAULT_KOEIRO_PARAM,
} from "@/features/constants/koeiroParam";
// import { getChatResponseStream } from "@/features/chat/openAiChat";
// import { getChatResponseStream } from "@/features/chat/dzmmChat";
import { M_PLUS_2, Montserrat } from "next/font/google";
import { Introduction } from "@/components/introduction";
import { Menu } from "@/components/menu";
import { GitHubLink } from "@/components/githubLink";
import { Meta } from "@/components/meta";
import {
  ElevenLabsParam,
  DEFAULT_ELEVEN_LABS_PARAM,
} from "@/features/constants/elevenLabsParam";
import { buildUrl } from "@/utils/buildUrl";
import { websocketService } from "@/services/websocketService";
import { MessageMiddleOut } from "@/features/messages/messageMiddleOut";
import { MotionBVHList } from "@/components/MotionBVHList";
import { MotionVRMAList } from "@/components/MotionVRMAList";
import { ExpressionList } from "@/components/ExpressionList";
import { ShapeKeyList } from "@/components/ShapeKeyList";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { useToast } from "@/hooks/use-toast";
import * as anchor from "@coral-xyz/anchor";
import VrmControl from "@/components/VrmControl";

const m_plus_2 = M_PLUS_2({
  variable: "--font-m-plus-2",
  display: "swap",
  preload: false,
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  display: "swap",
  subsets: ["latin"],
});

type LLMCallbackResult = {
  processed: boolean;
  error?: string;
};

export default function VrmChat() {
  const { viewer } = useContext(ViewerContext);

  const runtimeRef = useRef<CharacterRuntime | null>(null);
  if (!runtimeRef.current) {
    runtimeRef.current = new CharacterRuntime();
  }

  useEffect(() => {
    runtimeRef.current?.setViewer(viewer);
  }, [viewer]);

  // --- solana
  // const programRef = useRef<anchor.Program | null>(null);
  // const connectionRef = useRef<Connection | null>(null);
  // const playerPdaRef = useRef<PublicKey | null>(null);
  // const playerKeypairRef = useRef<Keypair | null>(null);
  // const subscriptionIdRef = useRef<number | null>(null);
  const rollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  const [systemPrompt, setSystemPrompt] = useState(SYSTEM_PROMPT);
  const [openAiKey, setOpenAiKey] = useState("");
  const [elevenLabsKey, setElevenLabsKey] = useState("");
  const [elevenLabsParam, setElevenLabsParam] = useState<ElevenLabsParam>(
    DEFAULT_ELEVEN_LABS_PARAM
  );
  console.log("elevenLabsParam", elevenLabsParam);
  const [koeiroParam, setKoeiroParam] =
    useState<KoeiroParam>(DEFAULT_KOEIRO_PARAM);
  const [chatProcessing, setChatProcessing] = useState(false);
  const [chatLog, setChatLog] = useState<Message[]>([]);
  const [assistantMessage, setAssistantMessage] = useState("");
  const [backgroundImage, setBackgroundImage] = useState<string>("");
  const [restreamTokens, setRestreamTokens] = useState<any>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  // needed because AI speaking could involve multiple audios being played in sequence
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [openRouterKey, setOpenRouterKey] = useState<string>(() => {
    // Try to load from localStorage on initial render
    if (typeof window !== "undefined") {
      return localStorage.getItem("openRouterKey") || "";
    }
    return "";
  });
  const [mockInputText, setMockInputText] = useState("");

  useEffect(() => {
    if (window.localStorage.getItem("chatVRMParams")) {
      const params = JSON.parse(
        window.localStorage.getItem("chatVRMParams") as string
      );
      setSystemPrompt(params.systemPrompt);
      // setElevenLabsParam(params.elevenLabsParam);
      setChatLog(params.chatLog);
    }
    if (window.localStorage.getItem("elevenLabsKey")) {
      const key = window.localStorage.getItem("elevenLabsKey") as string;
      setElevenLabsKey(key);
    }
    // load openrouter key from localStorage
    const savedOpenRouterKey = localStorage.getItem("openRouterKey");
    if (savedOpenRouterKey) {
      setOpenRouterKey(savedOpenRouterKey);
    }
    const savedBackground = localStorage.getItem("backgroundImage");
    if (savedBackground) {
      setBackgroundImage(savedBackground);
    }
  }, []);

  useEffect(() => {
    process.nextTick(() => {
      window.localStorage.setItem(
        "chatVRMParams",
        JSON.stringify({ systemPrompt, elevenLabsParam, chatLog })
      );

      // store separately to be backward compatible with local storage data
      window.localStorage.setItem("elevenLabsKey", elevenLabsKey);
    });
  }, [systemPrompt, elevenLabsParam, chatLog, elevenLabsKey]);

  useEffect(() => {
    if (backgroundImage) {
      document.body.style.backgroundImage = `url(${backgroundImage})`;
      // document.body.style.backgroundSize = 'cover';
      // document.body.style.backgroundPosition = 'center';
    } else {
      document.body.style.backgroundImage = `url(${buildUrl("/bg-c.png")})`;
    }
  }, [backgroundImage]);

  const handleChangeChatLog = useCallback(
    (targetIndex: number, text: string) => {
      const newChatLog = chatLog.map((v: Message, i) => {
        return i === targetIndex ? { role: v.role, content: text } : v;
      });

      setChatLog(newChatLog);
    },
    [chatLog]
  );

  /**
   * 文ごとに音声を直接でリクエストしながら再生する
   */
  const handleSpeakAi = useCallback(
    async (
      screenplay: Screenplay,
      elevenLabsKey: string,
      elevenLabsParam: ElevenLabsParam,
      onStart?: () => void,
      onEnd?: () => void
    ) => {
      setIsAISpeaking(true); // Set speaking state before starting
      // TODO: should set ai speaking when audio playback starts, and reset when it completes; otherwise, tts api latency (if too large) would cause stuck expression
      try {
        await speakCharacter(
          screenplay,
          elevenLabsKey,
          elevenLabsParam,
          viewer,
          () => {
            setIsPlayingAudio(true);
            console.log(`audio playback started at ${Date.now()}`);
            onStart?.();
          },
          () => {
            setIsPlayingAudio(false);
            console.log(`audio playback completed at ${Date.now()}`);
            onEnd?.();
          }
        );
      } catch (error) {
        console.error("Error during AI speech:", error);
      } finally {
        setIsAISpeaking(false); // Ensure speaking state is reset even if there's an error
      }
    },
    [viewer]
  );

  /**
   * Interact with the assistant
   */
  const handleSendChat = useCallback(
    async (text: string) => {
      const newMessage = text;
      if (newMessage == null) return;

      setChatProcessing(true);

      // Enter waiting state immediately (covers LLM latency + slow network).
      runtimeRef.current?.enterWaiting({ timeoutMs: 15000 });

      // Add user's message to chat log
      const messageLog: Message[] = [
        ...chatLog,
        { role: "user", content: newMessage },
      ];
      setChatLog(messageLog);

      // Process messages through MessageMiddleOut
      const messageProcessor = new MessageMiddleOut();
      const processedMessages = messageProcessor.process([
        {
          role: "system",
          content: systemPrompt,
        },
        ...messageLog.slice(-5),
      ]);

      // let localOpenRouterKey = openRouterKey;
      // if (!localOpenRouterKey) {
      //   // fallback to free key for users to try things out
      //   localOpenRouterKey = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY!;
      // }

      // Call the non-streaming API endpoint to get chat message
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages: processedMessages }),
      }).catch((e) => {
        console.error(e);
        return null;
      });

      if (!response || !response.ok) {
        setChatProcessing(false);
        runtimeRef.current?.exitWaiting();
        return;
      }

      // split chate message into sentences and process each sentence for tts & motion, lipsync, expression
      try {
        const data = await response.json();
        const fullMessage = data.content || ("" as string);
        console.log("fullMessage", fullMessage);

        // Filter out <think></think> tags and their content
        const cleanedMessage = fullMessage.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        console.log("cleanedMessage", cleanedMessage);

        // Update the assistant message display
        setAssistantMessage(cleanedMessage.trimStart());

        // Split the complete message into sentences
        const sentences = splitSentenceWithTags(cleanedMessage.trimStart());
        // "[neutral]你来了，把今天的报表给我看看" +
        //   "[story]柳如烟接过报表，坐在真皮办公椅上翻开查看，修长的双腿交叠在一起，黑色丝袜包裹的小腿轻轻晃动";
        console.log("sentences", sentences);

        // Process each sentence into screenplays and speak
        for (let i = 0; i < sentences.length; i++) {
          const sentence = sentences[i];
          const trimmedSentence = sentence.trim();

          // Skip empty sentences or sentences with only punctuation/brackets
          if (
            !trimmedSentence ||
            /^[\s\[\(\{「［（【『〈《〔｛«‹〘〚<>〛〙›»〕》〉』】）］」\}\)\]]+$/.test(
              trimmedSentence
            )
          ) {
            continue;
          }

          const aiTalks = textToScreenplay(trimmedSentence, koeiroParam);
          console.log("aiTalks", aiTalks);
          for (const aiTalk of aiTalks) {
            const prepared = runtimeRef.current?.prepareForSpeech(aiTalk);
            if (prepared) {
              handleSpeakAi(
                prepared.screenplay,
                elevenLabsKey,
                elevenLabsParam,
                prepared.onStart,
                prepared.onEnd
              );
            } else {
              handleSpeakAi(aiTalk, elevenLabsKey, elevenLabsParam);
            }
          }
        }

        // アシスタントの返答をログに追加
        const finalMessage = cleanedMessage.trim();
        console.log("finalMessage", finalMessage);
        const messageLogAssistant: Message[] = [
          ...messageLog,
          { role: "assistant", content: finalMessage },
        ];

        setChatLog(messageLogAssistant);
        setChatProcessing(false);

        // Exit waiting once we have a response (speech may still be queued by speakCharacter).
        runtimeRef.current?.exitWaiting();
      } catch (e) {
        setChatProcessing(false);
        console.error(e);

        runtimeRef.current?.exitWaiting();
      }
    },
    [
      systemPrompt,
      chatLog,
      handleSpeakAi,
      elevenLabsKey,
      elevenLabsParam,
      koeiroParam,
    ]
  );

  const handleTokensUpdate = useCallback((tokens: any) => {
    setRestreamTokens(tokens);
  }, []);

  // Set up global websocket handler
  useEffect(() => {
    websocketService.setLLMCallback(
      async (message: string): Promise<LLMCallbackResult> => {
        try {
          if (isAISpeaking || isPlayingAudio || chatProcessing) {
            console.log("Skipping message processing - system busy");
            return {
              processed: false,
              error: "System is busy processing previous message",
            };
          }

          await handleSendChat(message);
          return {
            processed: true,
          };
        } catch (error) {
          console.error("Error processing message:", error);
          return {
            processed: false,
            error:
              error instanceof Error ? error.message : "Unknown error occurred",
          };
        }
      }
    );
  }, [handleSendChat, chatProcessing, isPlayingAudio, isAISpeaking]);

  const handleOpenRouterKeyChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const newKey = event.target.value;
    setOpenRouterKey(newKey);
    localStorage.setItem("openRouterKey", newKey);
  };

  // const handleMockInputSubmit = useCallback(
  //   (e: React.FormEvent) => {
  //     e.preventDefault();
  //     if (mockInputText.trim() && !chatProcessing) {
  //       const aiTalks = textToScreenplay(mockInputText.trim(), koeiroParam);

  //       // 文ごとに音声を生成 & 再生、返答を表示
  //       handleSpeakAi(aiTalks[0], elevenLabsKey, elevenLabsParam, () => {
  //         setAssistantMessage(mockInputText);
  //       });
  //       setMockInputText("");
  //     }
  //   },
  //   [mockInputText, chatProcessing, handleSendChat]
  // );

  return (
    <div className={`${m_plus_2.variable} ${montserrat.variable}`}>
      {/* <Meta /> */}
      {/* <Introduction
        openAiKey={openAiKey}
        onChangeAiKey={setOpenAiKey}
        elevenLabsKey={elevenLabsKey}
        onChangeElevenLabsKey={setElevenLabsKey}
      /> */}
      <MotionBVHList />
      <MotionVRMAList />
      <VrmViewer />
      <ExpressionList />
      <ShapeKeyList />
      <VrmControl />
      {/* Mock Speak Input for Testing */}
      {/* <div className="fixed top-4 right-4 z-30 bg-base border-2 border-yellow-400 rounded-8 p-12 shadow-lg">
        <div className="text-xs text-yellow-600 font-bold mb-4">
          Mock Speak Input (Testing)
        </div>
        <form onSubmit={handleMockInputSubmit} className="flex gap-2">
          <input
            type="text"
            placeholder="Enter mock message..."
            value={mockInputText}
            onChange={(e) => setMockInputText(e.target.value)}
            disabled={chatProcessing}
            className="bg-surface1 hover:bg-surface1-hover focus:bg-surface1 disabled:bg-surface1-disabled disabled:text-primary-disabled rounded-8 px-8 py-4 text-text-primary typography-14 font-M_PLUS_2 w-48"
          />
          <button
            type="submit"
            disabled={chatProcessing || !mockInputText.trim()}
            className="bg-secondary hover:bg-secondary-hover active:bg-secondary-press disabled:bg-secondary-disabled rounded-8 px-12 py-4 text-text-primary typography-14 font-M_PLUS_2 font-bold disabled:cursor-not-allowed"
          >
            Send
          </button>
        </form>
      </div> */}
      <MessageInputContainer
        isChatProcessing={chatProcessing}
        onChatProcessStart={handleSendChat}
      />
      <Menu
        openAiKey={openAiKey}
        elevenLabsKey={elevenLabsKey}
        openRouterKey={openRouterKey}
        systemPrompt={systemPrompt}
        chatLog={chatLog}
        elevenLabsParam={elevenLabsParam}
        koeiroParam={koeiroParam}
        assistantMessage={assistantMessage}
        onChangeAiKey={setOpenAiKey}
        onChangeElevenLabsKey={setElevenLabsKey}
        onChangeSystemPrompt={setSystemPrompt}
        onChangeChatLog={handleChangeChatLog}
        onChangeElevenLabsParam={setElevenLabsParam}
        onChangeKoeiromapParam={setKoeiroParam}
        handleClickResetChatLog={() => setChatLog([])}
        handleClickResetSystemPrompt={() => setSystemPrompt(SYSTEM_PROMPT)}
        backgroundImage={backgroundImage}
        onChangeBackgroundImage={setBackgroundImage}
        onTokensUpdate={handleTokensUpdate}
        onChatMessage={handleSendChat}
        onChangeOpenRouterKey={handleOpenRouterKeyChange}
      />
    </div>
  );
}

export function ChatMessages() {
  return (
    <div>
      <div>Chat Messages</div>
    </div>
  );
}
