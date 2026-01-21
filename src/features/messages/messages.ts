import { VRMExpression, VRMExpressionPresetName } from "@pixiv/three-vrm";
import { KoeiroParam } from "../constants/koeiroParam";

// ChatGPT API
export type Message = {
  role: "assistant" | "system" | "user";
  content: string;
};

const talkStyles = [
  "neutral",
  "happy",
  "sad",
  "angry",
  "fear",
  "surprised",
  "rapture",
] as const;
export type TalkStyle = (typeof talkStyles)[number];

export type Talk = {
  style: TalkStyle;
  speakerX: number;
  speakerY: number;
  message: string;
};

const emotions = [
  "neutral",
  "happy",
  "angry",
  "sad",
  "relaxed",
  "rapture", // it is customized emotion
] as const;
type EmotionType = (typeof emotions)[number] | VRMExpressionPresetName;

/**
 * 発話文と音声の感情と、モデルの感情表現がセットになった物
 */
export type Screenplay = {
  expression: EmotionType;
  motion?: string; // Animation name (e.g., "joy", "wave", "nod")
  talk: Talk;
};

export const splitSentence = (text: string): string[] => {
  const splitMessages = text.split(/(?<=[。．！？\n])/g);
  return splitMessages.filter((msg) => msg !== "");
};

export const splitSentenceWithTags = (text: string): string[] => {
  // Split on tag boundaries: split before each tag [xxx] (except the first one)
  // This handles cases like "[neutral]text[story]text" or "text[neutral]text[story]text"
  // Pattern: split before [ that is preceded by ] (end of previous tag) or start of string
  // Keep each tag block as one sentence, don't split on punctuation within the same tag
  const splitMessages = text.split(/(?<!^)(?=\[[^\]]+\])/g);

  return splitMessages.filter((msg) => msg !== "");
};

export const textToScreenplay = (
  text: string,
  koeiroParam: KoeiroParam
): Screenplay[] => {
  const screenplays: Screenplay[] = [];
  let prevExpression = "neutral";

  // Common action tags that can be extracted
  const actionTags = [
    "wave",
    "nod",
    "jump",
    "idle",
    "sit",
    "sitting",
    "kneel",
    "walk",
    "run",
    "jog",
    "crouch",
    "laydown",
    "lay",
    "standup",
    "pat",
    "pickingup",
    "crawling",
    "gaming",
    "greeting",
    "attention_seeking",
    "dance",
    "exercise",
  ];

  // Extract emotion tag: [happy], [sad], [angry], etc.
  const emotionMatch = text.match(
    /\[(happy|sad|angry|neutral|relaxed|joy|anger|sadness|excitement|surprise|fear|disgust|confusion|amusement|love|rapture)\]/i
  );
  const emotionTag = emotionMatch ? emotionMatch[1] : prevExpression;

  // Extract action tag: [wave], [nod], etc.
  const actionMatch = text.match(
    new RegExp(`\\[(${actionTags.join("|")})\\]`, "i")
  );
  const actionTag = actionMatch ? actionMatch[1] : undefined;

  // Remove all tags from message
  const message = text.replace(/\[(.*?)\]/g, "");

  let expression = prevExpression;
  if (emotions.includes(emotionTag as any)) {
    expression = emotionTag;
    prevExpression = emotionTag;
  }

  // if message is too long, split it into 2 sentences by a punctuation mark and add tag of first sentence to the second sentence; then ai talks both
  if (message.length > 35) {
    // Find punctuation marks that are not at the very end
    const punctuationIndices: number[] = [];
    for (let i = 0; i < message.length - 1; i++) {
      if (/[。．！？，,\n]/.test(message[i])) {
        // Make sure there's content after this punctuation
        if (i < message.length - 2 && !/[。．！？，,\n]/.test(message[i + 1])) {
          punctuationIndices.push(i);
        }
      }
    }

    if (punctuationIndices.length > 0) {
      // Find the punctuation mark closest to the middle of the message
      const targetMiddle = message.length / 2;
      let bestIndex = punctuationIndices[0];
      let minDistance = Math.abs(punctuationIndices[0] - targetMiddle);

      for (const idx of punctuationIndices) {
        const distance = Math.abs(idx - targetMiddle);
        if (distance < minDistance) {
          minDistance = distance;
          bestIndex = idx;
        }
      }

      const firstSentence = message.substring(0, bestIndex + 1).trim();
      const secondSentence = message.substring(bestIndex + 1).trim();

      // Only split if both sentences have meaningful content (at least 5 characters each)
      if (secondSentence.length >= 5 && firstSentence.length >= 5) {
        screenplays.push({
          expression: expression as EmotionType,
          motion: actionTag, // Add motion field for body animations
          talk: {
            style: emotionToTalkStyle(expression as EmotionType),
            speakerX: koeiroParam.speakerX,
            speakerY: koeiroParam.speakerY,
            message: firstSentence,
          },
        });
        screenplays.push({
          expression: expression as EmotionType,
          motion: actionTag, // Add motion field for body animations
          talk: {
            style: emotionToTalkStyle(expression as EmotionType),
            speakerX: koeiroParam.speakerX,
            speakerY: koeiroParam.speakerY,
            message: secondSentence,
          },
        });
        return screenplays;
      }
    }
  }

  screenplays.push({
    expression: expression as EmotionType,
    motion: actionTag, // Add motion field for body animations
    talk: {
      style: emotionToTalkStyle(expression as EmotionType),
      speakerX: koeiroParam.speakerX,
      speakerY: koeiroParam.speakerY,
      message: message,
    },
  });

  return screenplays;
};

const emotionToTalkStyle = (emotion: EmotionType): TalkStyle => {
  switch (emotion) {
    case "angry":
      return "angry";
    case "happy":
      return "happy";
    case "sad":
      return "sad";
    case "rapture":
      return "rapture";
    default:
      return "neutral";
  }
};
