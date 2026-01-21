import type { NextApiRequest, NextApiResponse } from "next";
import { Message } from "@/features/messages/messages";

const DZMM_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImE4Y2Q1YzY0LTkxMDMtNDUyYi1iYTM4LThhOWI3N2U3ODdkZSIsImV4cCI6MTc3MTM5MTAxNiwianRpIjoiY2JkZjQ4OTUtOGM0MC00OTg0LWFjMTAtMjU1OGNiNWMxMmNmIn0.rFvmcBKeFdAAdend0UVBENeD8O8TnnT-Lh1DC6XBZ8o";

export default async function chatStreamHandler(
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
    // Set headers for streaming
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Build request body for DZMM API
    const requestBody = {
      model: "qwen3-32b:latest",
      messages: messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 800,
      top_p: 0.35,
      repetition_penalty: 1.05,
    };

    const response = await fetch(
      "http://60.12.103.229:3000/api/chat/completions",
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

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let accumulatedContent = ""; // Accumulate all content chunks

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        const decodedChunk = decoder.decode(value, { stream: true });
        buffer += decodedChunk;

        // Split by lines
        let lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }

          if (line.startsWith("data: ")) {
            try {
              const jsonStr = line.slice(6).trim();

              if (jsonStr === "[DONE]") {
                continue;
              }

              const message = JSON.parse(jsonStr);

              if (message.completed) {
                continue;
              }

              const content = message.choices?.[0]?.delta?.content;

              if (content !== undefined && content !== null) {
                // Accumulate content
                accumulatedContent += content;

                // Stream the content to the client
                res.write(content);

                // Log complete sentences when we detect sentence endings
                // Pattern: [tag] followed by content ending with punctuation (。．！？\n.!?)
                const sentencePattern =
                  /(\[[^\]]+\][^。．！？\n.!?]*[。．！？\n.!?])/;
                let match;
                while (
                  (match = accumulatedContent.match(sentencePattern)) !== null
                ) {
                  console.log(match[1]);
                  // Remove the logged sentence from accumulated content
                  accumulatedContent = accumulatedContent.slice(
                    match[1].length
                  );
                }
              }
            } catch (e) {
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

      // Log any remaining accumulated content at the end
      if (accumulatedContent.trim()) {
        console.log(accumulatedContent);
      }
    } catch (error) {
      console.error("Error reading the stream", error);
      res.status(500).json({ message: "Error processing stream" });
      return;
    } finally {
      reader.releaseLock();
    }

    res.end();
  } catch (error) {
    console.error("Error in chat API:", error);
    res.status(500).json({
      message:
        error instanceof Error ? error.message : "Unknown error occurred",
    });
  }
}
