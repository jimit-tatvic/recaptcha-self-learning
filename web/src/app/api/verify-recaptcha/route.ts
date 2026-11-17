import { NextRequest, NextResponse } from "next/server";
import { verifyRecaptchaToken, verifyRecaptchaV2 } from "@/lib/recaptcha-service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, action = "page_view", simulatedScore, siteKey, version = "v3" } = body;

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          recaptcha_status: "failed",
          error: "Token is missing"
        },
        { status: 400 }
      );
    }

    // Step 4: reCAPTCHA v2 Checkbox Backend Verification
    if (version === "v2") {
      const effectiveSiteKey = siteKey || process.env.RECAPTCHA_V2_SITE_KEY || process.env.NEXT_PUBLIC_RECAPTCHA_V2_SITE_KEY || "6LefTvstAAAAAEZP-CLcaPWRJporNKm0LSpJAo85";
      const result = await verifyRecaptchaV2(token, effectiveSiteKey);
      return NextResponse.json(result);
    }

    // reCAPTCHA v3 Invisible / Score Verification
    const effectiveSiteKey = siteKey || process.env.RECAPTCHA_SITE_KEY || process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "6LegCfstAAAAAErSFGl5A2C1j9OgpHGC9rkHBFfL";
    const result = await verifyRecaptchaToken(token, action, simulatedScore, effectiveSiteKey);

    return NextResponse.json({
      success: result.tokenValid,
      recaptcha_status: result.tokenValid ? "verified" : "failed",
      action: action,
      riskAnalysis: {
        score: result.score,
        reasons: result.reasons
      },
      tokenProperties: {
        valid: result.tokenValid,
        action: action,
        createTime: new Date().toISOString()
      },
      userType: result.userType,
      recaptchaRisk: result.riskLevel,
      decision: result.decision,
      isSimulated: result.isSimulated,
      error: result.error,
      rawResponse: result.rawResponse
    });
  } catch (error: unknown) {
    console.error("[API verify-recaptcha] Error:", error);
    return NextResponse.json(
      {
        success: false,
        recaptcha_status: "failed",
        error: error instanceof Error ? error.message : "Internal Server Error"
      },
      { status: 500 }
    );
  }
}
