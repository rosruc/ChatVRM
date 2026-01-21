import { Message } from "../messages/messages";

const DZMM_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImE4Y2Q1YzY0LTkxMDMtNDUyYi1iYTM4LThhOWI3N2U3ODdkZSIsImV4cCI6MTc3MTM5MTAxNiwianRpIjoiY2JkZjQ4OTUtOGM0MC00OTg0LWFjMTAtMjU1OGNiNWMxMmNmIn0.rFvmcBKeFdAAdend0UVBENeD8O8TnnT-Lh1DC6XBZ8o"

export async function getChatResponseStream(
  messages: Message[],
  apiKey = DZMM_API_KEY,
) {
  console.log('getChatResponseStream');
  console.log('Messages being sent to API:', JSON.stringify(messages, null, 2));

  const stream = new ReadableStream({
    async start(controller: ReadableStreamDefaultController) {
      try {
        // 构建请求体
        const requestBody = {
          // Max系列 - 旗舰模型 ($0.0004/1K tokens)
          //model: 'nalang-max-0826-10k',  // 10K context
          //model: 'nalang-max-0826-16k',  // 16K context (推荐)
          //model: 'nalang-max-0826',      // 32K context

          // XL系列 - 大模型 ($0.0003/1K tokens)
          //model: 'nalang-xl-0826-16k',   // 16K context (推荐)
          // model: 'nalang-xl-0826-10k', // 10K context
          //model: 'nalang-xl-0826',       // 32K context

          // Medium系列 - 性价比之王 ($0.0002/1K tokens)
          model: 'qwen3-32b:latest',   // 32K context

          // Turbo系列 - 小模型 ($0.0001/1K tokens)
          //model: 'nalang-turbo-0826',    // 32K context (推荐)

          messages: messages,
          stream: true,
          temperature: 0.7,
          max_tokens: 800,
          top_p: 0.35,
          repetition_penalty: 1.05,
        };

        console.log('Request body:', JSON.stringify(requestBody, null, 2));

        const response = await fetch(
          'http://60.12.103.229:3000/api/chat/completions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(requestBody),
          },
        );

        // 检查响应状态
        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unable to read error response');
          console.error('API Error Response:', {
            status: response.status,
            statusText: response.statusText,
            body: errorText,
          });
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        if (response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = ""; // 定义缓冲区
          let hasReceivedData = false;
          let isFirstMessage = true;

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                console.log('Stream reading completed. Has received data:', hasReceivedData);
                break;
              }

              // 将新数据拼接到缓冲区，使用 {stream: true} 处理多字节字符边界
              const decodedChunk = decoder.decode(value, { stream: true });
              buffer += decodedChunk;
              
              // 调试：记录原始数据块
              if (!hasReceivedData) {
                console.log('First chunk received:', decodedChunk.substring(0, 200));
                hasReceivedData = true;
              }

              // 按行分割
              let lines = buffer.split('\n');

              // 将最后一行（可能不完整）留给下一次循环，从 lines 中移除
              buffer = lines.pop() || "";

              for (const line of lines) {
                // 跳过空行
                if (!line.trim()) {
                  continue;
                }

                // 按照参考实现，使用 slice 和 trim 来处理 data: 前缀
                if (line.startsWith("data: ")) {
                  try {
                    // 使用 slice(6).trim() 来移除 "data: " 前缀并去除可能的额外空格
                    // 参考: https://www.dzmm.ai/examples/nalang.js
                    const jsonStr = line.slice(6).trim();
                    
                    // 跳过 [DONE] 信号
                    if (jsonStr === "[DONE]") {
                      console.log('Received [DONE] signal');
                      continue;
                    }

                    const message = JSON.parse(jsonStr);

                    // 调试：记录解析后的消息结构
                    if (isFirstMessage) {
                      console.log('First message parsed:', JSON.stringify(message, null, 2));
                      isFirstMessage = false;
                    }

                    // 处理完成事件
                    if (message.completed) {
                      console.log('Stream completed:', message.completed);
                      continue;
                    }

                    // 安全获取 content - 按照参考实现，使用 choices[0].delta.content
                    const content = message.choices?.[0]?.delta?.content;

                    // 记录所有收到的content
                    console.log('Received content:', {
                      content: content,
                      contentType: typeof content,
                      contentLength: content?.length,
                      isUndefined: content === undefined,
                      isNull: content === null,
                      isEmpty: content === '',
                      fullMessage: JSON.stringify(message, null, 2)
                    });

                    if (content !== undefined && content !== null) {
                      // 即使content是空字符串也enqueue，因为可能是有效的空白字符
                      console.log('Enqueueing content:', JSON.stringify(content));
                      controller.enqueue(content);
                      console.log('Content enqueued successfully');
                    } else {
                      // 调试：记录没有content的消息
                      console.log('Message without content:', JSON.stringify(message, null, 2));
                    }
                  } catch (e) {
                    // 忽略空行导致的解析错误
                    if (line.trim()) {
                      console.warn("JSON parse error on line:", line.substring(0, 100), e);
                    }
                    // 这里不要 throw error，防止单行错误导致整个流中断
                  }
                } else {
                  // 调试：记录不符合预期格式的行
                  if (process.env.NODE_ENV === 'development') {
                    console.log('Unexpected line format:', line.substring(0, 100));
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
        } else {
          console.error('Response body is null');
          throw new Error('Response body is null');
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