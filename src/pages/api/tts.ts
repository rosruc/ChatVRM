import { synthesizeVoice } from "@/features/elevenlabs/elevenlabs";
import type { NextApiRequest, NextApiResponse } from "next";
import type { Talk } from "@/features/messages/messages";
import type { ElevenLabsParam } from "@/features/constants/elevenLabsParam";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      talk,
      apiKey,
      elevenLabsParam,
    }: {
      talk: Talk;
      apiKey: string;
      elevenLabsParam: ElevenLabsParam;
    } = req.body;

    if (!talk || !apiKey || !elevenLabsParam) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    // Fetch audio using existing synthesizeVoice function
    const ttsVoice = await synthesizeVoice(
      talk.message,
      talk.speakerX,
      talk.speakerY,
      talk.style,
      apiKey,
      elevenLabsParam
    );

    const url = ttsVoice.audio;
    if (!url) {
      return res.status(500).json({ error: "Failed to generate audio" });
    }

    // Fetch the audio from the URL and return as buffer
    const audioResponse = await fetch(url);
    const audioBuffer = await audioResponse.arrayBuffer();

    // Return audio buffer
    res.setHeader("Content-Type", "audio/mpeg");
    res.status(200).send(Buffer.from(audioBuffer));
  } catch (error) {
    console.error("TTS API error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
