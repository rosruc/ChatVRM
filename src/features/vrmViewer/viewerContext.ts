import { createContext } from "react";
import { Viewer } from "./viewer";
import { textToScreenplay, splitSentence } from "../messages/messages";
import { DEFAULT_KOEIRO_PARAM } from "../constants/koeiroParam";
import { DEFAULT_ELEVEN_LABS_PARAM } from "../constants/elevenLabsParam";

const viewer = new Viewer();

// // Expose viewer to window for console testing (development only)
// if (typeof window !== "undefined") {
//   (window as any).vrmViewer = viewer;

//   (window as any).testAnimation = (animationName: string) => {
//     if (viewer.model) {
//       return viewer.model.playAnimation(animationName, {
//         loop: false,
//         fadeIn: 0.3,
//         fadeOut: 0.3,
//       });
//     } else {
//       console.warn("VRM model not loaded yet. Wait for model to load.");
//     }
//   };

//   /**
//    * Test with mock LLM message containing expression and motion tags
//    * Simulates the full flow from text parsing to animation playback
//    *
//    * @param mockMessage - LLM message with tags like "[happy] Hello! [wave] Nice to meet you!"
//    * @param withAudio - Whether to include audio (requires ElevenLabs key, defaults to false)
//    *
//    * Example:
//    *   testMockLLMMessage("[happy] Hello! [wave] Nice to meet you! [nod] I understand.")
//    */
//   (window as any).testMockLLMMessage = async (
//     mockMessage: string,
//     withAudio: boolean = false
//   ) => {
//     if (!viewer.model) {
//       console.warn("VRM model not loaded yet. Wait for model to load.");
//       return;
//     }

//     console.log("Testing mock LLM message:", mockMessage);

//     // Use default koeiro params
//     const koeiroParam = DEFAULT_KOEIRO_PARAM;

//     // Split message by emotion/action tags to handle sequences like "[happy] text [sad] text"
//     // This regex matches tags like [happy], [sad], [wave], etc.
//     const tagPattern = /\[([^\]]+)\]/g;
//     const parts: string[] = [];

//     // Find all tags and their positions
//     const tagMatches: Array<{ tag: string; fullTag: string; index: number }> =
//       [];
//     let match;
//     while ((match = tagPattern.exec(mockMessage)) !== null) {
//       tagMatches.push({
//         tag: match[1], // Content inside brackets
//         fullTag: match[0], // Full tag including brackets
//         index: match.index,
//       });
//     }

//     // If we have tags, split by them; otherwise use sentence splitting
//     if (tagMatches.length > 0) {
//       // Split message into segments: each segment starts with a tag and includes text until next tag
//       for (let i = 0; i < tagMatches.length; i++) {
//         const currentTag = tagMatches[i];
//         const nextTag = tagMatches[i + 1];
//         const startIndex = currentTag.index;
//         const endIndex = nextTag ? nextTag.index : mockMessage.length;
//         const segment = mockMessage.substring(startIndex, endIndex).trim();
//         if (segment) {
//           parts.push(segment);
//         }
//       }
//     } else {
//       // Fallback to sentence splitting if no tags found
//       parts.push(...splitSentence(mockMessage));
//     }

//     console.log("Parsed segments:", parts);

//     // Process each segment
//     for (let i = 0; i < parts.length; i++) {
//       const segment = parts[i];
//       console.log(`\nProcessing segment ${i + 1}:`, segment);

//       // Convert to screenplay (extracts tags and creates Screenplay object)
//       const screenplays = textsToScreenplay([segment], koeiroParam);

//       if (screenplays.length === 0) {
//         console.warn("No screenplay generated for:", segment);
//         continue;
//       }

//       const screenplay = screenplays[0];
//       console.log("Screenplay:", {
//         expression: screenplay.expression,
//         motion: screenplay.motion,
//         message: screenplay.talk.message,
//       });

//       // Call speak without audio (just animations and expressions)
//       // This will trigger:
//       // 1. Facial expression change
//       // 2. Body animation (from motion tag or expression)
//       await viewer.model.speak(null, screenplay);

//       // Add a small delay between segments to see sequential animations
//       if (i < parts.length - 1) {
//         await new Promise((resolve) => setTimeout(resolve, 300));
//       }
//     }

//     console.log("\n✅ Mock LLM message test complete!");
//   };

//   /**
//    * Test with real TTS audio to see lip sync in action
//    * This simulates the full flow: LLM message → TTS audio → lip sync + expressions
//    *
//    * @param mockMessage - LLM message with tags like "[happy] Hello! [sad] I'm sorry."
//    * @param elevenLabsKey - Your ElevenLabs API key (optional, will prompt if not provided)
//    *
//    * Example:
//    *   testMockLLMMessageWithAudio("[happy] Hello! [wave] Nice to meet you!", "your-api-key")
//    */
//   (window as any).testMockLLMMessageWithAudio = async (
//     mockMessage: string,
//     elevenLabsKey?: string
//   ) => {
//     if (!viewer.model) {
//       console.warn("VRM model not loaded yet. Wait for model to load.");
//       return;
//     }

//     // Get API key from parameter or prompt
//     let apiKey = elevenLabsKey;
//     if (!apiKey) {
//       apiKey = prompt("Enter your ElevenLabs API key:") || "";
//       if (!apiKey) {
//         console.warn("ElevenLabs API key required for audio testing");
//         return;
//       }
//     }

//     console.log("Testing mock LLM message with TTS audio:", mockMessage);
//     console.log(
//       "Note: Expression is determined by LLM tags, NOT by audio content!"
//     );

//     // Use default params
//     const koeiroParam = DEFAULT_KOEIRO_PARAM;
//     const elevenLabsParam = DEFAULT_ELEVEN_LABS_PARAM;

//     // Split message by emotion/action tags
//     const tagPattern = /\[([^\]]+)\]/g;
//     const parts: string[] = [];
//     const tagMatches: Array<{ tag: string; fullTag: string; index: number }> =
//       [];
//     let match;
//     while ((match = tagPattern.exec(mockMessage)) !== null) {
//       tagMatches.push({
//         tag: match[1],
//         fullTag: match[0],
//         index: match.index,
//       });
//     }

//     if (tagMatches.length > 0) {
//       for (let i = 0; i < tagMatches.length; i++) {
//         const currentTag = tagMatches[i];
//         const nextTag = tagMatches[i + 1];
//         const startIndex = currentTag.index;
//         const endIndex = nextTag ? nextTag.index : mockMessage.length;
//         const segment = mockMessage.substring(startIndex, endIndex).trim();
//         if (segment) {
//           parts.push(segment);
//         }
//       }
//     } else {
//       parts.push(...splitSentence(mockMessage));
//     }

//     console.log("Parsed segments:", parts);

//     // Process each segment with TTS audio
//     for (let i = 0; i < parts.length; i++) {
//       const segment = parts[i];
//       console.log(`\nProcessing segment ${i + 1}:`, segment);

//       // Convert to screenplay
//       const screenplays = textsToScreenplay([segment], koeiroParam);

//       if (screenplays.length === 0) {
//         console.warn("No screenplay generated for:", segment);
//         continue;
//       }

//       const screenplay = screenplays[0];
//       console.log("Screenplay:", {
//         expression: screenplay.expression,
//         motion: screenplay.motion,
//         message: screenplay.talk.message,
//       });

//       // Fetch TTS audio via Next.js API
//       console.log("Fetching TTS audio...");
//       let audioBuffer: ArrayBuffer | null = null;
//       try {
//         const response = await fetch("/api/tts", {
//           method: "POST",
//           headers: {
//             "Content-Type": "application/json",
//           },
//           body: JSON.stringify({
//             talk: screenplay.talk,
//             apiKey,
//             elevenLabsParam,
//           }),
//         });

//         if (!response.ok) {
//           throw new Error(`TTS API error: ${response.statusText}`);
//         }

//         audioBuffer = await response.arrayBuffer();
//         console.log("✅ Audio fetched successfully");
//       } catch (error) {
//         console.error("Failed to fetch audio:", error);
//         console.log("Continuing without audio...");
//       }

//       // Call speak with audio (this will trigger lip sync)
//       // Expression is set from screenplay.expression (from LLM tags)
//       // Lip sync is driven by audio volume analysis
//       await viewer.model.speak(audioBuffer, screenplay);

//       // Add a small delay between segments
//       if (i < parts.length - 1) {
//         await new Promise((resolve) => setTimeout(resolve, 500));
//       }
//     }

//     console.log("\n✅ Mock LLM message with audio test complete!");
//     console.log("\n📝 Key Points:");
//     console.log(
//       "  - Expression (happy/sad) is determined by LLM tags [happy], [sad], etc."
//     );
//     console.log(
//       "  - Audio does NOT determine expression - it only drives lip sync (mouth movement)"
//     );
//     console.log(
//       "  - Lip sync analyzes audio volume in real-time to open/close mouth"
//     );
//   };
// }

export const ViewerContext = createContext({ viewer });
