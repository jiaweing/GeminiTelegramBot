import { GoogleGenAI } from "@google/genai";
import { config } from "dotenv";
import * as fs from "fs";
import * as https from "https";
import fetch from "node-fetch";
import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";

// Load environment variables from .env file
config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!BOT_TOKEN) throw new Error("BOT_TOKEN environment variable not set");
if (!GEMINI_API_KEY)
  throw new Error("GEMINI_API_KEY environment variable not set");

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Initialize bot
const bot = new Telegraf(BOT_TOKEN, {
  telegram: {
    apiRoot: "https://api.telegram.org",
    agent: new https.Agent({
      family: 4, // Force IPv4
    }),
  },
});

// Start command
bot.start((ctx) => {
  ctx.reply(
    "Welcome! Send me any text or image and I'll respond using Gemini AI.\n" +
      "You can also send an image with a caption to ask specific questions about it.\n" +
      "I can also generate images from your text descriptions!"
  );
});

// Help command
bot.help((ctx) => {
  ctx.reply(
    "Simply send me:\n" +
      "• Any text message to chat\n" +
      "• An image to analyze\n" +
      "• An image with a caption to ask specific questions\n" +
      "• Start your message with 'generate:' to create an image"
  );
});

// Handle images
bot.on(message("photo"), async (ctx) => {
  try {
    const photo = ctx.message.photo[ctx.message.photo.length - 1]; // Get highest quality photo
    const fileUrl = await ctx.telegram.getFileLink(photo.file_id);

    const response = await fetch(fileUrl.href, {
      agent: new https.Agent({
        family: 4, // Force IPv4
      }),
    });
    const buffer = await response.arrayBuffer();
    const base64Image = Buffer.from(buffer).toString("base64");

    const prompt = ctx.message.caption || "What do you see in this image?";
    const result = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: [
        prompt,
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Image,
          },
        },
      ],
      config: {
        responseModalities: ["Text", "Image"],
      },
    });

    // Handle both text and image responses
    if (result.candidates && result.candidates[0]?.content?.parts) {
      for (const part of result.candidates[0].content.parts) {
        if (part.text !== undefined) {
          await ctx.reply(part.text);
        } else if (
          part.inlineData !== undefined &&
          part.inlineData.data &&
          part.inlineData.mimeType
        ) {
          const mime = part.inlineData.mimeType;
          if (mime.startsWith("image/")) {
            const imageData = Buffer.from(part.inlineData.data, "base64");
            const filename = `downloads/image_${Date.now()}.jpg`;
            fs.mkdirSync("downloads", { recursive: true });
            fs.writeFileSync(filename, imageData);
            await ctx.replyWithPhoto({ source: filename });
          }
        }
      }
    } else {
      await ctx.reply("Sorry, I couldn't process the image properly.");
    }
  } catch (error) {
    console.error("Error:", error);
    await ctx.reply("Sorry, I encountered an error. Please try again.");
  }
});

// Handle text messages
bot.on(message("text"), async (ctx) => {
  if (ctx.message.text.startsWith("/")) return; // Skip commands

  try {
    const isImageGeneration = ctx.message.text
      .toLowerCase()
      .startsWith("generate:");
    const prompt = isImageGeneration
      ? ctx.message.text.slice(9).trim()
      : ctx.message.text;

    const result = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: prompt,
      config: {
        responseModalities: isImageGeneration ? ["Text", "Image"] : ["Text"],
      },
    });

    // Handle both text and image responses
    if (result.candidates && result.candidates[0]?.content?.parts) {
      for (const part of result.candidates[0].content.parts) {
        if (part.text !== undefined) {
          await ctx.reply(part.text);
        } else if (
          part.inlineData !== undefined &&
          part.inlineData.data &&
          part.inlineData.mimeType
        ) {
          const mime = part.inlineData.mimeType;
          if (mime.startsWith("image/")) {
            const imageData = Buffer.from(part.inlineData.data, "base64");
            const filename = `downloads/image_${Date.now()}.jpg`;
            fs.mkdirSync("downloads", { recursive: true });
            fs.writeFileSync(filename, imageData);
            await ctx.replyWithPhoto({ source: filename });
          }
        }
      }
    } else {
      await ctx.reply("Sorry, I couldn't process your request properly.");
    }
  } catch (error) {
    console.error("Error:", error);
    await ctx.reply("Sorry, I encountered an error. Please try again.");
  }
});

// Launch bot
bot
  .launch()
  .then(() => console.log("Bot started successfully!"))
  .catch((err) => console.error("Failed to start bot:", err));

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
