export type ElevenLabsParam = {
  voiceId: string;
};

// voiceId: "MF3mGyEYCl7XYWbV9V6O", // Elli
export const DEFAULT_ELEVEN_LABS_PARAM: ElevenLabsParam = {
  voiceId: "bfy-xj", // Rachel
} as const;
