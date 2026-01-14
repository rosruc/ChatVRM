import { VRMExpression, VRMExpressionPresetName } from "@pixiv/three-vrm";
import { KoeiroParam } from "../constants/koeiroParam";

// ChatGPT API
export type Message = {
  role: "assistant" | "system" | "user";
  content: string;
};

const talkStyles = [
  "talk",
  "happy",
  "sad",
  "angry",
  "fear",
  "surprised",
] as const;
export type TalkStyle = (typeof talkStyles)[number];

export type Talk = {
  style: TalkStyle;
  speakerX: number;
  speakerY: number;
  message: string;
};

const emotions = ["neutral", "happy", "angry", "sad", "relaxed"] as const;
type EmotionType = (typeof emotions)[number] & VRMExpressionPresetName;

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

export const textsToScreenplay = (
  texts: string[],
  koeiroParam: KoeiroParam
): Screenplay[] => {
  const screenplays: Screenplay[] = [];
  let prevExpression = "neutral";
  
  // Common action tags that can be extracted
  const actionTags = [
    "wave", "nod", "jump", "walk", "run", "jog", "crouch", "laydown",
    "standup", "pat", "pickingup", "crawling", "gaming", "greeting",
    "attention_seeking", "dance", "exercise"
  ];
  
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];

    // Extract emotion tag: [happy], [sad], [angry], etc.
    const emotionMatch = text.match(/\[(happy|sad|angry|neutral|relaxed|joy|anger|sadness|excitement|surprise|fear|disgust|confusion|amusement|love)\]/i);
    const emotionTag = emotionMatch ? emotionMatch[1] : prevExpression;

    // Extract action tag: [wave], [nod], etc.
    const actionMatch = text.match(new RegExp(`\\[(${actionTags.join("|")})\\]`, "i"));
    const actionTag = actionMatch ? actionMatch[1] : undefined;

    // Remove all tags from message
    const message = text.replace(/\[(.*?)\]/g, "");

    let expression = prevExpression;
    if (emotions.includes(emotionTag as any)) {
      expression = emotionTag;
      prevExpression = emotionTag;
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
  }

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
    default:
      return "talk";
  }
};
