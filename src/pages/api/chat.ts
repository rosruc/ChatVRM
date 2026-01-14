import type { NextApiRequest, NextApiResponse } from "next";
import { Message } from "@/features/messages/messages";

const DZMM_API_KEY = "5f9a1587-4076-49d2-88ed-7ea6732722d2";

export default async function chatHandler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.status(405).json({ message: "Method not allowed" });
    return;
  }

  const { messages }: { messages: Message[] } = req.body;

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ message: "Messages array is required" });
    return;
  }

  try {
    // Build request body for DZMM API (non-streaming, but API may still return stream format)
    const requestBody = {
      model: "nalang-medium-0826",
      messages: messages,
      stream: false,
      temperature: 0.7,
      max_tokens: 800,
      top_p: 0.35,
      repetition_penalty: 1.05,
    };

    const response = await fetch(
      "https://www.gpt4novel.com/api/xiaoshuoai/ext/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DZMM_API_KEY}`,
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await response
        .text()
        .catch(() => "Unable to read error response");
      console.error("API Error Response:", {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
      res.status(response.status).json({ message: `API error: ${errorText}` });
      return;
    }

    if (!response.body) {
      res.status(500).json({ message: "Response body is null" });
      return;
    }

    // Handle streaming response (SSE format) and accumulate all content
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let accumulatedContent = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        const decodedChunk = decoder.decode(value, { stream: true });
        buffer += decodedChunk;

        // Split by lines (SSE format)
        let lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }

          if (line.startsWith("data: ")) {
            try {
              const jsonStr = line.slice(6).trim();

              // Skip [DONE] marker
              if (jsonStr === "[DONE]") {
                continue;
              }

              const message = JSON.parse(jsonStr);

              // Skip completed marker
              if (message.completed) {
                continue;
              }

              // Extract content from delta (streaming format)
              const content = message.choices?.[0]?.delta?.content;

              if (content !== undefined && content !== null) {
                accumulatedContent += content;
              }
            } catch (e) {
              // Ignore parse errors for empty lines
              if (line.trim()) {
                console.warn(
                  "JSON parse error on line:",
                  line.substring(0, 100),
                  e
                );
              }
            }
          }
        }
      }

      // Handle any remaining buffer content
      if (buffer.trim()) {
        const line = buffer.trim();
        if (line.startsWith("data: ")) {
          try {
            const jsonStr = line.slice(6).trim();
            if (jsonStr !== "[DONE]") {
              const message = JSON.parse(jsonStr);
              if (!message.completed) {
                const content = message.choices?.[0]?.delta?.content;
                if (content !== undefined && content !== null) {
                  accumulatedContent += content;
                }
              }
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    } catch (error) {
      console.error("Error reading the stream", error);
      res.status(500).json({ message: "Error processing stream" });
      return;
    } finally {
      reader.releaseLock();
    }

    // Return the complete accumulated content
    res.status(200).json({ content: accumulatedContent });
  } catch (error) {
    console.error("Error in chat API:", error);
    console.error(
      "Error stack:",
      error instanceof Error ? error.stack : "No stack trace"
    );
    res.status(500).json({
      message:
        error instanceof Error ? error.message : "Unknown error occurred",
      error: error instanceof Error ? error.toString() : String(error),
    });
  }
}
