import { NextRequest, NextResponse } from "next/server";
import { verifyRecaptchaToken } from "@/lib/recaptcha-service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = body.token;
    const simulatedScore = body.simulatedScore;

    console.log("[Android API] Request received with token:", token ? token.substring(0, 20) + "..." : "none");

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    const androidSiteKey = process.env.RECAPTCHA_ANDROID_SITE_KEY || "6LcKNfstAAAAADhXSmfh8TdAeuRQHVVplik8RYEm";
    const result = await verifyRecaptchaToken(token, "button_click", simulatedScore, androidSiteKey);

    // Return exact format expected by Android handleScore() in doc
    const responsePayload = {
      name: `projects/${process.env.RECAPTCHA_PROJECT_ID || "tatvic-testing"}/assessments/android-assessment`,
      riskAnalysis: {
        score: result.score,
        reasons: result.reasons
      },
      tokenProperties: {
        valid: result.tokenValid,
        action: "button_click",
        createTime: new Date().toISOString()
      },
      userType: result.userType,
      recaptchaRisk: result.riskLevel,
      decision: result.decision,
      isSimulated: result.isSimulated
    };

    console.log("[Android API] Response Score:", result.score, "Risk:", result.riskLevel);
    return NextResponse.json(responsePayload);
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : "Internal error";
    console.error("[Android API] Error:", errMessage);
    return NextResponse.json(
      {
        error: errMessage,
        riskAnalysis: {
          score: 0.1,
          reasons: ["API_ERROR: " + errMessage]
        }
      },
      { status: 500 }
    );
  }
}
