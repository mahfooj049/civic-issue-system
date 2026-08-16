const fetch = require("node-fetch");

// Maps common ImageNet/general labels to our civic issue categories
const LABEL_MAP = {
  pothole: "pothole",
  road: "road_damage",
  crack: "road_damage",
  garbage: "garbage",
  trash: "garbage",
  waste: "garbage",
  dump: "garbage",
  water: "water_leakage",
  pipe: "water_leakage",
  leak: "water_leakage",
  streetlight: "streetlight",
  lamp: "streetlight",
  light: "streetlight",
  wire: "electricity",
  electric: "electricity",
  pole: "electricity",
  drain: "drainage",
  sewage: "drainage",
};

/**
 * Uses Hugging Face's free inference API (image classification model) to
 * suggest a category for the uploaded issue image.
 * Returns null silently if API key is missing or the call fails -
 * this is a "nice-to-have" and should never block issue creation.
 */
async function classifyImage(imageUrl) {
  if (!process.env.HUGGINGFACE_API_KEY) {
    return null;
  }

  const response = await fetch(
    "https://api-inference.huggingface.co/models/google/vit-base-patch16-224",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: imageUrl }),
    }
  );

  if (!response.ok) {
    throw new Error(`HuggingFace API error: ${response.status}`);
  }

  const results = await response.json();
  if (!Array.isArray(results) || results.length === 0) return null;

  // find first label that maps to one of our categories
  for (const result of results) {
    const labelLower = result.label.toLowerCase();
    for (const [keyword, category] of Object.entries(LABEL_MAP)) {
      if (labelLower.includes(keyword)) {
        return { category, confidence: result.score };
      }
    }
  }

  return null; // no confident match found
}

module.exports = { classifyImage };
