import { Message } from "../messages/messages";
import { getWindowAI } from 'window.ai';

export async function getChatResponse(messages: Message[], apiKey: string) {
  // function currently not used
  throw new Error("Not implemented");

  /*
  if (!apiKey) {
    throw new Error("Invalid API Key");
  }

  const configuration = new Configuration({
    apiKey: apiKey,
  });
  // ブラウザからAPIを叩くときに発生するエラーを無くすworkaround
  // https://github.com/openai/openai-node/issues/6#issuecomment-1492814621
  delete configuration.baseOptions.headers["User-Agent"];

  const openai = new OpenAIApi(configuration);

  const { data } = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: messages,
  });

  const [aiRes] = data.choices;
  const message = aiRes.message?.content || "エラーが発生しました";

  return { message: message };
  */
}

// export async function getChatResponseStream(
//   messages: Message[],
//   apiKey: string,
//   openRouterKey: string
// ) {
//   // TODO: remove usages of apiKey in code
//   /*
//   if (!apiKey) {
//     throw new Error("Invalid API Key");
//   }
//   */

//   console.log('getChatResponseStream');

//   console.log('messages');
//   console.log(messages);

//   const stream = new ReadableStream({
//     async start(controller: ReadableStreamDefaultController) {
//       try {

//         const OPENROUTER_API_KEY = openRouterKey;
//         const YOUR_SITE_URL = 'https://chat-vrm-window.vercel.app/';
//         const YOUR_SITE_NAME = 'ChatVRM';

//         if (!OPENROUTER_API_KEY) {
//           throw new Error('OpenRouter API key is missing');
//         }

//         let isStreamed = false;
//         const generation = await fetch("https://openrouter.ai/api/v1/chat/completions", {
//           method: "POST",
//           headers: {
//             "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
//             // "HTTP-Referer": `${YOUR_SITE_URL}`, // Optional, for including your app on openrouter.ai rankings.
//             // "X-Title": `${YOUR_SITE_NAME}`, // Optional. Shows in rankings on openrouter.ai.
//             "Content-Type": "application/json"
//           },
//           body: JSON.stringify({
//             // "model": "cohere/command",
//             // "model": "openai/gpt-3.5-turbo",
//             // "model": "cohere/command-r-plus",
//             // "model": "google/gemini-2.0-flash-exp:free",
//             // "model": "anthropic/claude-3.5-sonnet:beta", // Better for role-playing and following system prompts
//             // model: "deepseek/deepseek-chat-v3-0324",
//             model: "deepseek/deepseek-r1-0528",
//             "messages": messages,
//             "temperature": 0.7,
//             "max_tokens": 200,
//             "stream": true,
//           })
//         });

//         if (generation.body) {
//           const reader = generation.body.getReader();
//           try {
//             while (true) {
//               const { done, value } = await reader.read();
//               if (done) break;

//               // console.log('value');
//               // console.log(value);

//               // Assuming the stream is text, convert the Uint8Array to a string
//               let chunk = new TextDecoder().decode(value);
//               // Process the chunk here (e.g., append it to the controller for streaming to the client)
//               // console.log(chunk); // Or handle the chunk as needed

//               // split the chunk into lines
//               let lines = chunk.split('\n');
//               // console.log('lines');
//               // console.log(lines);

//               const SSE_COMMENT = ": OPENROUTER PROCESSING";


//               // filter out lines that start with SSE_COMMENT
//               lines = lines.filter((line) => !line.trim().startsWith(SSE_COMMENT));

//               // filter out lines that end with "data: [DONE]"
//               lines = lines.filter((line) => !line.trim().endsWith("data: [DONE]"));

//               // Filter out empty lines and lines that do not start with "data:"
//               const dataLines = lines.filter(line => line.startsWith("data:"));

//               // Extract and parse the JSON from each data line
//               const messages = dataLines.map(line => {
//                 // Remove the "data: " prefix and parse the JSON
//                 const jsonStr = line.substring(5); // "data: ".length == 5
//                 return JSON.parse(jsonStr);
//               });

//               // console.log('messages');
//               // console.log(messages);

//               // loop through messages and enqueue them to the controller

//               try {
//                 messages.forEach((message) => {
//                   const content = message.choices[0].delta.content;

//                   controller.enqueue(content);
//                 });
//               } catch (error) {
//                 // log the messages
//                 console.log('error processing messages:');
//                 console.log(messages);

//                 throw error;
//               }

//               // Parse the chunk as JSON
//               // const parsedChunk = JSON.parse(chunk);
//               // Access the content
//               // const content = parsedChunk.choices[0].delta.content;
//               // console.log(content); // Use the content as needed

//               // enqueue the content to the controller
//               // controller.enqueue(content);

//               isStreamed = true;
//             }
//           } catch (error) {
//             console.error('Error reading the stream', error);
//           } finally {
//             reader.releaseLock();
//           }
//         }

//         // handle case where streaming is not supported
//         if (!isStreamed) {
//           console.error('Streaming not supported! Need to handle this case.');
//           // controller.enqueue(response[0].message.content);
//         }
//       } catch (error) {
//         controller.error(error);
//       } finally {
//         controller.close();
//       }
//     },
//   });

//   return stream;
// }

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