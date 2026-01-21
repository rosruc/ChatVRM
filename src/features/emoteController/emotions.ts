import { Emotion } from "./expressionController";

export type CustomEmotion = {
  id: string;
  emotion: Emotion;
};

export const CUSTOM_EMOTIONS: Array<CustomEmotion> = [
  {
    id: "lust_1",
    emotion: {
      waves: [
        {
          expressionName: "happy",
          options: {
            durationSec: 1.3,
            minWeight: 0.2,
            maxWeight: 0.35,
            cycles: -1,
          },
        },
        {
          expressionName: "relaxed",
          options: {
            durationSec: 1.5,
            minWeight: 0.15,
            maxWeight: 0.35,
            cycles: -1,
          },
        },
        {
          expressionName: "sad",
          options: {
            durationSec: 1.7,
            minWeight: 0.15,
            maxWeight: 0.25,
            cycles: -1,
          },
        },
        {
          expressionName: "oh",
          options: {
            durationSec: 2,
            minWeight: 0.1,
            maxWeight: 0.2,
            cycles: -1,
          },
        },
      ],
      autoBlinkDisabled: true,
    },
  },
  {
    id: "lust_2",
    emotion: {
      waves: [
        {
          expressionName: "happy",
          options: {
            durationSec: 1.3,
            minWeight: 0.2,
            maxWeight: 0.55,
            cycles: -1,
          },
        },
        {
          expressionName: "relaxed",
          options: {
            durationSec: 1.5,
            minWeight: 0.15,
            maxWeight: 0.55,
            cycles: -1,
          },
        },
        {
          expressionName: "sad",
          options: {
            durationSec: 1.7,
            minWeight: 0.15,
            maxWeight: 0.25,
            cycles: -1,
          },
        },
        {
          expressionName: "oh",
          options: {
            durationSec: 2,
            minWeight: 0.1,
            maxWeight: 0.4,
            cycles: -1,
          },
        },
      ],
      autoBlinkDisabled: true,
    },
  },
  {
    id: "lust_3",
    emotion: {
      waves: [
        {
          expressionName: "happy",
          options: {
            durationSec: 1.3,
            minWeight: 0.3,
            maxWeight: 0.65,
            cycles: -1,
          },
        },
        {
          expressionName: "relaxed",
          options: {
            durationSec: 1.5,
            minWeight: 0.3,
            maxWeight: 0.7,
            cycles: -1,
          },
        },
        {
          expressionName: "sad",
          options: {
            durationSec: 1.7,
            minWeight: 0.15,
            maxWeight: 0.25,
            cycles: -1,
          },
        },
        {
          expressionName: "oh",
          options: {
            durationSec: 2,
            minWeight: 0.1,
            maxWeight: 0.4,
            cycles: -1,
          },
        },
      ],
      autoBlinkDisabled: true,
    },
  },
  {
    id: "lust_4",
    emotion: {
      waves: [
        {
          expressionName: "happy",
          options: {
            durationSec: 0.9,
            minWeight: 0.4,
            maxWeight: 0.6,
            cycles: -1,
          },
        },
        {
          expressionName: "relaxed",
          options: {
            durationSec: 0.8,
            minWeight: 0.4,
            maxWeight: 1,
            cycles: -1,
          },
        },
        {
          expressionName: "sad",
          options: {
            durationSec: 1,
            minWeight: 0.15,
            maxWeight: 0.3,
            cycles: -1,
          },
        },
        {
          expressionName: "oh",
          options: {
            durationSec: 1,
            minWeight: 0.2,
            maxWeight: 0.8,
            cycles: -1,
          },
        },
      ],
      autoBlinkDisabled: true,
    },
  },
  {
    id: "ahegao",
    emotion: {
      waves: [
        {
          expressionName: "relaxed",
          options: {
            durationSec: 0.8,
            minWeight: 0.4,
            maxWeight: 0.45,
            cycles: -1,
          },
        },
        {
          expressionName: "relaxed",
          options: {
            durationSec: 0.8,
            minWeight: 0.9,
            maxWeight: 1,
            cycles: -1,
          },
        },
        {
          expressionName: "oh",
          options: {
            durationSec: 0.6,
            minWeight: 0.75,
            maxWeight: 0.8,
            cycles: -1,
          },
        },
        {
          expressionName: "ou",
          options: {
            durationSec: 0.6,
            minWeight: 0.3,
            maxWeight: 0.35,
            cycles: -1,
          },
        },
      ],
      autoBlinkDisabled: true,
    },
  },
];
