import { generateText } from "ai";
import { google } from "@ai-sdk/google";

const { text } = await generateText({
    model: google("models/gemini-2.5-flash"),
    prompt:"What is an AI agent?",
});

console.log(text);