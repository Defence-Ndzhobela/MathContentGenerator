const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from server/public
app.use(express.static(path.join(__dirname, "public")));

// Load prompt templates from project root prompts.json
const promptTemplates = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "prompts.json"), "utf8")
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.post("/api/ask", async (req, res) => {
  const { grade, topic, contentType, question } = req.body;

  if (!grade || !topic || !contentType || !question) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // Map contentType to prompt key
    let templateKey = "";
    switch (contentType.toLowerCase()) {
      case "summary":
      case "lesson summary":
        templateKey = "lesson_summary";
        break;
      case "practice":
      case "practice problems":
        templateKey = "practice_problems";
        break;
      case "step-by-step":
      case "step by step":
      case "step_by_step":
        templateKey = "step_by_step_solution";
        break;
      case "concept":
      case "concept explanation":
        templateKey = "concept_explanation";
        break;
      case "quiz":
      case "quiz questions":
        templateKey = "quiz_questions";
        break;
      default:
        templateKey = "lesson_summary";
    }

    let prompt = promptTemplates[templateKey] || promptTemplates["lesson_summary"];

    // Replace placeholders
    prompt = prompt
      .replace("{grade}", grade)
      .replace("{topic}", topic)
      .replace("{question}", question || "");

    const startTime = Date.now();

    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1000,
      temperature: 0.7,
    });

    const endTime = Date.now();

    const aiResponse = chatCompletion.choices[0].message.content;

    res.json({
      result: aiResponse,
      generationTimeMs: endTime - startTime,
      usage: chatCompletion.usage || null,
    });
  } catch (error) {
    console.error("Error calling OpenAI:", error);

    if (error.status === 429) {
      if (error.type === "insufficient_quota") {
        return res.status(429).json({
          error: "You've exceeded your OpenAI API quota. Please check your plan and billing.",
          type: "insufficient_quota",
        });
      } else {
        return res.status(429).json({
          error: "Too many requests. Please wait before trying again.",
          type: "rate_limit_exceeded",
        });
      }
    } else if (error.status === 401) {
      return res.status(401).json({
        error: "Invalid API key.",
        type: "invalid_api_key",
      });
    } else if (error.status === 402) {
      return res.status(402).json({
        error: "Insufficient quota. Please add billing info.",
        type: "insufficient_quota",
      });
    }

    res.status(500).json({
      error: "Something went wrong with the AI service.",
      type: "server_error",
    });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "Server is running" });
});

// Serve frontend page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);

  exec(`start http://localhost:${PORT}`, (error) => {
    if (error) {
      console.log(`🌐 Please open http://localhost:${PORT} manually`);
    } else {
      console.log(`🌐 Browser opened automatically`);
    }
  });
});
