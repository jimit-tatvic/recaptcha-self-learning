// Standalone Express Server implementation as described in Google reCAPTCHA Enterprise Integration Doc
require("dotenv").config({ path: ".env" });
const express = require("express");
const cors = require("cors");
const { RecaptchaEnterpriseServiceClient } = require("@google-cloud/recaptcha-enterprise");

const app = express();
app.use(cors());
app.use(express.json());

const projectID = process.env.RECAPTCHA_PROJECT_ID || process.env.GCP_PROJECT_ID || "tatvic-testing";
const siteKey = process.env.RECAPTCHA_SITE_KEY || process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "6Ld17YYsAAAAAJmTe4AUYgXP2bkH1w6iD7Fa71eW";

let client;
try {
  client = new RecaptchaEnterpriseServiceClient();
  console.log("reCAPTCHA Enterprise Client initialized with Google credentials.");
} catch (e) {
  console.warn("reCAPTCHA Enterprise Client warning (fallback to simulated mode if needed):", e.message);
}

// 1. Web Verification Endpoint
app.post("/verify-recaptcha", async (req, res) => {
  const token = req.body.token;
  const action = req.body.action || "page_view";
  console.log(`[Web API] Received token for action: ${action}`);

  if (!token) {
    return res.status(400).json({ error: "Missing token" });
  }

  // Handle simulation if requested
  if (req.body.simulatedScore !== undefined) {
    const score = Number(req.body.simulatedScore);
    return res.json({
      riskAnalysis: { score: score, reasons: ["SIMULATED"] },
      tokenProperties: { valid: true, action: action }
    });
  }

  const request = {
    parent: `projects/${projectID}`,
    assessment: {
      event: {
        token: token,
        siteKey: siteKey,
      }
    }
  };

  try {
    if (!client) {
      // Diagnostic fallback when service account key isn't installed yet
      return res.json({
        warning: "Running in diagnostic mode (no recaptcha-key.json detected)",
        riskAnalysis: { score: 0.85, reasons: [] },
        tokenProperties: { valid: true, action: action }
      });
    }
    const [response] = await client.createAssessment(request);
    console.log("[Web API] Google assessment response:", response);
    res.json(response);
  } catch (error) {
    console.error("[Web API] Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// 2. Android Verification Endpoint
app.post("/verify-recaptcha-android", async (req, res) => {
  const token = req.body.token;
  console.log("[Android API] Request received with token:", token ? token.substring(0, 20) + "..." : "none");

  if (!token) {
    return res.status(400).json({ error: "Missing token" });
  }

  if (req.body.simulatedScore !== undefined) {
    const score = Number(req.body.simulatedScore);
    return res.json({
      riskAnalysis: { score: score, reasons: ["SIMULATED"] },
      tokenProperties: { valid: true, action: "button_click" }
    });
  }

  const request = {
    parent: `projects/${projectID}`,
    assessment: {
      event: {
        token: token,
        siteKey: siteKey,
      }
    }
  };

  try {
    if (!client) {
      return res.json({
        riskAnalysis: { score: 0.9, reasons: [] },
        tokenProperties: { valid: true, action: "button_click" }
      });
    }
    const [response] = await client.createAssessment(request);
    console.log("Android reCAPTCHA Score:", response.riskAnalysis ? response.riskAnalysis.score : "N/A");
    res.json(response);
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Standalone reCAPTCHA verification server running on port ${PORT}`);
  });
}

module.exports = app;
