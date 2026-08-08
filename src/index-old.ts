import { HumanMessage } from "@langchain/core/messages";
import { agent } from "./graph";

const result = await agent.invoke({
  messages: [
    new HumanMessage(
      "What is 25 multiplied by 8, and what time is it in Karachi?",
    ),
  ],
});

const lastMessage = result.messages[result.messages.length - 1];

console.log(lastMessage.content);

// import { ChatGroq } from "@langchain/groq";
// import { calculatorTool } from "./tools/calculator";
// import dotenv from "dotenv";

// dotenv.config();

// const model = new ChatGroq({
//   apiKey: process.env.GROQ_API_KEY,
//   model: "openai/gpt-oss-120b",
//   temperature: 0,
// });

// const modelWithTools = model.bindTools([calculatorTool]);

// const response = await modelWithTools.invoke("What is 25 multiplied by 8?");

// // console.log(response);
// console.log(JSON.stringify(response.tool_calls, null, 2));

// import { calculatorTool } from "./tools/calculator";

// const result = await calculatorTool.invoke({
//   a: 10,
//   b: 5,
//   operation: "multiply",
// });

// console.log(result);

// import { ChatGroq } from "@langchain/groq";
// import dotenv from "dotenv";

// dotenv.config();

// const model = new ChatGroq({
//   apiKey: process.env.GROQ_API_KEY,
//   model: "openai/gpt-oss-120b",
//   temperature: 0,
// });

// const response = await model.invoke(
//   "Explain what an AI agent is in one sentence.",
// );

// console.log(response.content);
