import { Message } from "../messages/messages";

export async function getChatResponseStream(
  messages: Message[],
  apiKey: string,
  openRouterKey: string
) {
  console.log('getChatResponseStream');

  const stream = new ReadableStream({
    async start(controller: ReadableStreamDefaultController) {
      try {
        const OPENROUTER_API_KEY = openRouterKey;
        const YOUR_SITE_URL = 'https://chat-vrm-window.vercel.app/';
        const YOUR_SITE_NAME = 'ChatVRM';

        const generation = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "HTTP-Referer": `${YOUR_SITE_URL}`,
            "X-Title": `${YOUR_SITE_NAME}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            "model": "xiaomi/mimo-v2-flash:free",
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 200,
            "stream": true,
          })
        });

        if (generation.body) {
          const reader = generation.body.getReader();
          const decoder = new TextDecoder();
          let buffer = ""; // 【关键修改 1】定义缓冲区

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              // 【关键修改 2】将新数据拼接到缓冲区，使用 {stream: true} 处理多字节字符边界
              buffer += decoder.decode(value, { stream: true });

              // 按行分割
              let lines = buffer.split('\n');

              // 【关键修改 3】将最后一行（可能不完整）留给下一次循环，从 lines 中移除
              buffer = lines.pop() || "";

              for (const line of lines) {
                const trimmedLine = line.trim();

                // 跳过特定的 SSE 注释或空行
                if (!trimmedLine || trimmedLine === "" || trimmedLine.startsWith(": OPENROUTER PROCESSING")) {
                  continue;
                }

                if (trimmedLine === "data: [DONE]") {
                  continue;
                }

                if (trimmedLine.startsWith("data: ")) {
                  try {
                    const jsonStr = trimmedLine.substring(6); // "data: " 长度为 6 (注意你的代码原为5，通常标准是6包含空格，但也可能是5，视返回而定，这里建议容错)
                    const message = JSON.parse(jsonStr);

                    // 安全获取 content
                    const content = message.choices?.[0]?.delta?.content;
                    if (content) {
                      controller.enqueue(content);
                    }
                  } catch (e) {
                    console.warn("JSON parse error on line:", trimmedLine, e);
                    // 这里不要 throw error，防止单行错误导致整个流中断
                  }
                }
              }
            }
          } catch (error) {
            console.error('Error reading the stream', error);
            controller.error(error);
          } finally {
            reader.releaseLock();
          }
        }
      } catch (error) {
        controller.error(error);
      } finally {
        controller.close();
      }
    },
  });

  return stream;
}