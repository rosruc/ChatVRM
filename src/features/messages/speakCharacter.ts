import { wait } from "@/utils/wait";
import { Viewer } from "../vrmViewer/viewer";
import { Screenplay } from "./messages";
import { Talk } from "./messages";
import { ElevenLabsParam } from "../constants/elevenLabsParam";

const createSpeakCharacter = () => {
  let lastTime = 0;
  let prevFetchPromise: Promise<unknown> = Promise.resolve();
  let prevSpeakPromise: Promise<unknown> = Promise.resolve();

  return (
    screenplay: Screenplay,
    elevenLabsKey: string,
    elevenLabsParam: ElevenLabsParam,
    viewer: Viewer,
    onStart?: () => void,
    onComplete?: () => void
  ) => {
    const fetchPromise = prevFetchPromise.then(async () => {
      const now = Date.now();
      if (now - lastTime < 1000) {
        await wait(1000 - (now - lastTime));
      }

      // if elevenLabsKey is not set, do not fetch audio
      if (!elevenLabsKey || elevenLabsKey.trim() == "") {
        console.log("elevenLabsKey is not set");
        return null;
      }

      const buffer = await fetchAudio(
        screenplay.talk,
        elevenLabsKey,
        elevenLabsParam
      ).catch(() => null);
      lastTime = Date.now();
      return buffer;
    });

    prevFetchPromise = fetchPromise;
    prevSpeakPromise = Promise.all([fetchPromise, prevSpeakPromise]).then(
      ([audioBuffer]) => {
        onStart?.();
        if (!audioBuffer) {
          // pass along screenplay to change avatar expression
          return viewer.model?.speak(null, screenplay);
        }
        return viewer.model?.speak(audioBuffer, screenplay);
      }
    );
    prevSpeakPromise.then(() => {
      onComplete?.();
    });
  };
};

export const speakCharacter = createSpeakCharacter();

export const fetchAudio = async (
  talk: Talk,
  elevenLabsKey: string,
  elevenLabsParam: ElevenLabsParam,
  saveToFile: boolean = true
): Promise<ArrayBuffer> => {
  const response = await fetch("/api/tts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      talk,
      apiKey: elevenLabsKey,
      elevenLabsParam,
    }),
  });

  if (!response.ok) {
    throw new Error(`TTS API error: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();

  // Save audio to local file if requested
  if (saveToFile) {
    const blob = new Blob([buffer], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // Generate filename with timestamp and first few words of the message
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const messagePreview = talk.message
      .substring(0, 20)
      .replace(/[^a-z0-9]/gi, "_");
    a.download = `tts_${timestamp}_${messagePreview}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return buffer;
};
