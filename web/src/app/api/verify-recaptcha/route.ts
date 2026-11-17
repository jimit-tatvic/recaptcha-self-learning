import { NextRequest, NextResponse } from "next/server";
import { verifyRecaptchaToken } from "@/lib/recaptcha-service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, action = "page_view", simulatedScore, siteKey, version = "v3" } = body;

    if (!token) {
      return NextResponse.json(
        { error: "Missing required parameter: token" },
        { status: 400 }
      );
    }

    const effectiveSiteKey = siteKey || (version === "v2"
      ? (process.env.RECAPTCHA_V2_SITE_KEY || process.env.NEXT_PUBLIC_RECAPTCHA_V2_SITE_KEY || "6LefTvstAAAAAEZP-CLcaPWRJporNKm0LSpJAo85")
      : (process.env.RECAPTCHA_SITE_KEY || process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "6LegCfstAAAAAErSFGl5A2C1j9OgpHGC9rkHBFfL")
    );

    const result = await verifyRecaptchaToken(token, action, simulatedScore, effectiveSiteKey);

    // Return format adhering to the doc specification
    return NextResponse.json({
      success: true,
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
        error: error instanceof Error ? error.message : "Internal Server Error",
        riskAnalysis: { score: 0.0, reasons: ["INTERNAL_ERROR"] },
        userType: "bot",
        recaptchaRisk: "HIGH_RISK",
        decision: "BLOCK"
      },
      { status: 500 }
    );
  }
}
