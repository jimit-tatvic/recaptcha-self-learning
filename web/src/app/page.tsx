"use client";

import { useState, useEffect } from "react";

declare global {
  interface Window {
    grecaptcha?: {
      enterprise: {
        ready: (cb: () => void) => void;
        execute: (siteKey: string, options: { action: string }) => Promise<string>;
        render: (
          container: string | HTMLElement,
          parameters: {
            sitekey: string;
            theme?: "light" | "dark";
            size?: "normal" | "compact";
            callback?: (token: string) => void;
            "expired-callback"?: () => void;
            "error-callback"?: () => void;
          }
        ) => number;
        reset: (opt_widget_id?: number) => void;
        getResponse: (opt_widget_id?: number) => string;
      };
      getResponse?: (opt_widget_id?: number) => string;
      reset?: (opt_widget_id?: number) => void;
    };
    dataLayer?: Array<Record<string, unknown>>;
  }
}

interface TrackedEvent {
  event: string;
  version: "v3" | "v2";
  timestamp: string;
  status?: "verified" | "failed";
  params: Record<string, unknown>;
}

const SITE_KEY_V3 = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "6LegCfstAAAAAErSFGl5A2C1j9OgpHGC9rkHBFfL";
const SITE_KEY_V2 = process.env.NEXT_PUBLIC_RECAPTCHA_V2_SITE_KEY || "6LefTvstAAAAAEZP-CLcaPWRJporNKm0LSpJAo85";

export default function ContactPage() {
  const [recaptchaVersion, setRecaptchaVersion] = useState<"v3" | "v2">("v2");
  const [isVerified, setIsVerified] = useState<boolean>(false);
  const [verifying, setVerifying] = useState<boolean>(false);

  // v2 Specific status: "idle" | "verifying" | "verified" | "failed"
  const [v2Status, setV2Status] = useState<"idle" | "verifying" | "verified" | "failed">("idle");
  const [v2ErrorMessage, setV2ErrorMessage] = useState<string>("");
  const [v2WidgetId, setV2WidgetId] = useState<number | null>(null);

  // v3 Specific risk metrics (NOT used in v2 per specification)
  const [recaptchaScore, setRecaptchaScore] = useState<number | null>(null);
  const [recaptchaRisk, setRecaptchaRisk] = useState<string>("LOW_RISK");
  const [recaptchaUserType, setRecaptchaUserType] = useState<string>("human");

  const [submitted, setSubmitted] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Live event log stream for QA / GTM dataLayer inspection
  const [eventHistory, setEventHistory] = useState<TrackedEvent[]>([]);

  // Form Fields
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    message: ""
  });

  // Central Event Dispatcher for GTM dataLayer: recaptcha_verification | form_interact | form_submission
  const dispatchAnalyticsEvent = (
    eventName: "recaptcha_verification" | "form_interact" | "form_submission",
    params: Record<string, unknown>
  ) => {
    const timestamp = new Date().toLocaleTimeString();
    const eventPayload = {
      event: eventName,
      recaptcha_version: recaptchaVersion,
      ...params,
      event_timestamp: new Date().toISOString()
    };

    // Push strictly to window.dataLayer for Google Tag Manager (GTM-MCPBM8KQ)
    if (typeof window !== "undefined") {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(eventPayload);
      console.log(`[GTM dataLayer] ${eventName} (${recaptchaVersion}):`, eventPayload);
    }

    // Keep local stream for QA inspection
    setEventHistory((prev) => [
      {
        event: eventName,
        version: recaptchaVersion,
        timestamp,
        status: (params.recaptcha_status as "verified" | "failed" | undefined),
        params
      },
      ...prev.slice(0, 14)
    ]);
  };

  // Helper to verify a v3 token against backend assessment API
  const assessV3Token = async (token: string) => {
    const res = await fetch("/api/verify-recaptcha", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        action: "form_fill",
        siteKey: SITE_KEY_V3,
        version: "v3"
      })
    });

    const data = await res.json();
    const score = data.riskAnalysis?.score ?? 0.9;
    const userType = score < 0.5 ? "bot" : "human";
    const riskLevel = score >= 0.7 ? "LOW_RISK" : score > 0.3 ? "MEDIUM_RISK" : "HIGH_RISK";
    const decision = score > 0.7 ? "ALLOW" : score >= 0.4 ? "VERIFY" : "BLOCK";
    const isStatusVerified = score >= 0.4;

    setRecaptchaScore(score);
    setRecaptchaRisk(riskLevel);
    setRecaptchaUserType(userType);

    // 👉 FIRE EVENT: recaptcha_verification (v3)
    dispatchAnalyticsEvent("recaptcha_verification", {
      recaptcha_status: isStatusVerified ? "verified" : "failed",
      recaptcha_score: score,
      recaptcha_risk: riskLevel,
      recaptcha_user_type: userType,
      action: "form_fill",
      decision: decision
    });

    if (isStatusVerified) {
      setIsVerified(true);
    } else {
      setIsVerified(false);
    }
  };

  // v3 Invisible verification trigger on interaction
  const handleRecaptchaV3Verification = async () => {
    if (isVerified || verifying) return;
    setVerifying(true);

    try {
      let token = "";
      if (typeof window !== "undefined" && window.grecaptcha?.enterprise?.execute) {
        token = await new Promise<string>((resolve, reject) => {
          window.grecaptcha!.enterprise.ready(async () => {
            try {
              const t = await window.grecaptcha!.enterprise.execute(SITE_KEY_V3, {
                action: "form_fill"
              });
              resolve(t);
            } catch (err) {
              reject(err);
            }
          });
        });
      } else {
        token = `fallback-token-v3-${Date.now()}`;
      }

      await assessV3Token(token);
    } catch (e) {
      console.error("[reCAPTCHA v3] Verification error:", e);
      setIsVerified(false);
      dispatchAnalyticsEvent("recaptcha_verification", {
        recaptcha_status: "failed",
        error: "reCAPTCHA v3 execution error"
      });
    } finally {
      setVerifying(false);
    }
  };

  // Render reCAPTCHA v2 Checkbox Widget (Step 3: without immediate assessment callback)
  const renderV2Widget = () => {
    if (typeof window === "undefined" || !window.grecaptcha?.enterprise?.render) return;

    const container = document.getElementById("recaptcha-v2-container");
    if (container && container.childNodes.length === 0) {
      try {
        const id = window.grecaptcha.enterprise.render(container, {
          sitekey: SITE_KEY_V2,
          theme: "dark",
          size: "normal",
          "expired-callback": () => {
            console.log("[v2 Checkbox] Token expired");
            setIsVerified(false);
            setV2Status("idle");
          },
          "error-callback": () => {
            console.warn("[v2 Checkbox] Widget error");
            setV2Status("failed");
            setV2ErrorMessage("Widget error occurred");
          }
        });
        setV2WidgetId(id);
      } catch (err) {
        console.warn("[v2 Checkbox] Render warning:", err);
      }
    }
  };

  // Re-render or reset widget whenever the version changes
  useEffect(() => {
    setIsVerified(false);
    setV2Status("idle");
    setV2ErrorMessage("");
    setRecaptchaScore(null);

    if (recaptchaVersion === "v2") {
      const timer = setTimeout(() => {
        if (window.grecaptcha?.enterprise?.ready) {
          window.grecaptcha.enterprise.ready(renderV2Widget);
        } else {
          renderV2Widget();
        }
      }, 300);
      return () => clearTimeout(timer);
    } else {
      // Clean up container when leaving v2
      const container = document.getElementById("recaptcha-v2-container");
      if (container) container.innerHTML = "";
    }
  }, [recaptchaVersion]);

  // Track initial value when entering a field to detect real changes
  const [fieldEntryValues, setFieldEntryValues] = useState<Record<string, string>>({});

  const handleFieldFocus = (fieldName: string) => {
    // Only auto-trigger v3 on focus; v2 requires manual checkbox interaction on form submission
    if (recaptchaVersion === "v3" && !isVerified) {
      handleRecaptchaV3Verification();
    }
    setFieldEntryValues((prev) => ({
      ...prev,
      [fieldName]: formData[fieldName as keyof typeof formData] || ""
    }));
  };

  // EVENT: form_interact
  const handleFieldBlur = (fieldName: string) => {
    const previousVal = fieldEntryValues[fieldName] ?? "";
    const currentVal = formData[fieldName as keyof typeof formData] || "";

    if (currentVal !== previousVal && currentVal.trim().length > 0) {
      const payload: Record<string, unknown> = {
        form_name: "contact_form",
        form_field: fieldName,
        interaction_type: "input_change"
      };

      // Only include score parameters for v3
      if (recaptchaVersion === "v3") {
        payload.recaptcha_score = recaptchaScore ?? 0.9;
        payload.recaptcha_risk = recaptchaRisk;
        payload.recaptcha_user_type = recaptchaUserType;
      } else {
        payload.recaptcha_status = v2Status === "verified" ? "verified" : "pending";
      }

      dispatchAnalyticsEvent("form_interact", payload);

      setFieldEntryValues((prev) => ({
        ...prev,
        [fieldName]: currentVal
      }));
    }
  };

  // Step 3 & Step 4: Form Submission with on-submit token verification
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // ==========================================
    // reCAPTCHA v2 FLOW (as per Document Step 3)
    // ==========================================
    if (recaptchaVersion === "v2") {
      let token = "";
      if (v2WidgetId !== null && window.grecaptcha?.enterprise?.getResponse) {
        token = window.grecaptcha.enterprise.getResponse(v2WidgetId);
      } else if (window.grecaptcha?.getResponse) {
        token = window.grecaptcha.getResponse();
      }

      // Step 3: Check if token exists
      if (!token) {
        console.log("reCAPTCHA not completed");
        setV2Status("failed");
        setV2ErrorMessage("Please complete the 'I'm not a robot' reCAPTCHA checkbox before submitting.");

        // 👉 Track FAILED attempt in dataLayer (recaptcha_status: failed)
        dispatchAnalyticsEvent("recaptcha_verification", {
          recaptcha_status: "failed",
          error: "reCAPTCHA not completed"
        });
        return;
      }

      setSubmitting(true);
      setV2Status("verifying");
      setV2ErrorMessage("");

      try {
        console.log("Token generated:", token);

        // Step 4: Send token to backend endpoint (/verify-recaptcha)
        const res = await fetch("/api/verify-recaptcha", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: token,
            version: "v2",
            siteKey: SITE_KEY_V2
          })
        });

        const data = await res.json();
        console.log("Backend response:", data);

        // Step 4 verification logic: response.tokenProperties.valid === true -> recaptcha_status: "verified"
        if (data.success && data.recaptcha_status === "verified") {
          setIsVerified(true);
          setV2Status("verified");

          // 👉 Push verified status to dataLayer (recaptcha_status: verified)
          // NO risk score, NO riskLevel, NO userType in v2!
          dispatchAnalyticsEvent("recaptcha_verification", {
            recaptcha_status: "verified"
          });

          // 👉 Fire form_submission event
          dispatchAnalyticsEvent("form_submission", {
            form_name: "contact_form",
            submission_status: "success",
            recaptcha_status: "verified",
            fields_completed: Object.keys(formData).filter((k) => !!formData[k as keyof typeof formData]).length
          });

          setTimeout(() => {
            setSubmitting(false);
            setSubmitted(true);
          }, 400);
        } else {
          // Verification Failed
          setIsVerified(false);
          setV2Status("failed");
          const reason = data.invalid_reason || data.error || "Verification failed";
          setV2ErrorMessage(`reCAPTCHA Verification Failed: ${reason}`);

          // 👉 Push failed status to dataLayer (recaptcha_status: failed)
          dispatchAnalyticsEvent("recaptcha_verification", {
            recaptcha_status: "failed",
            invalid_reason: reason
          });

          // Reset widget for retry
          if (v2WidgetId !== null && window.grecaptcha?.enterprise?.reset) {
            window.grecaptcha.enterprise.reset(v2WidgetId);
          }
          setSubmitting(false);
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Network error";
        console.error("Verification error:", err);
        setIsVerified(false);
        setV2Status("failed");
        setV2ErrorMessage("Network error while connecting to verification server.");

        // 👉 Push network error failed status to dataLayer
        dispatchAnalyticsEvent("recaptcha_verification", {
          recaptcha_status: "failed",
          error: errorMsg
        });
        setSubmitting(false);
      }
      return;
    }

    // ==========================================
    // reCAPTCHA v3 FLOW (Invisible Score-based)
    // ==========================================
    if (!isVerified) {
      await handleRecaptchaV3Verification();
    }

    setSubmitting(true);
    dispatchAnalyticsEvent("form_submission", {
      form_name: "contact_form",
      submission_status: "success",
      recaptcha_status: isVerified ? "verified" : "failed",
      fields_completed: Object.keys(formData).filter((k) => !!formData[k as keyof typeof formData]).length,
      recaptcha_score: recaptchaScore ?? 0.9,
      recaptcha_risk: recaptchaRisk,
      recaptcha_user_type: recaptchaUserType
    });

    setTimeout(() => {
      setSubmitting(false);
      setSubmitted(true);
    }, 600);
  };

  // Manual QA Simulation Helper for Testing Failed Verification
  const simulateFailedV2Attempt = () => {
    setV2Status("failed");
    setV2ErrorMessage("Simulated Failed Verification Attempt (QA Test)");
    dispatchAnalyticsEvent("recaptcha_verification", {
      recaptcha_status: "failed",
      invalid_reason: "SIMULATED_FAILURE_TEST"
    });
  };

  return (
    <div className="container" style={{ maxWidth: "640px" }}>
      {/* Form Card */}
      <div className="glass-card" style={{ padding: "2.5rem" }}>
        
        {/* Version Switcher Tabs */}
        <div style={{
          display: "flex",
          background: "rgba(15, 23, 42, 0.8)",
          padding: "4px",
          borderRadius: "12px",
          marginBottom: "1.75rem",
          border: "1px solid var(--border-subtle)"
        }}>
          <button
            type="button"
            onClick={() => setRecaptchaVersion("v2")}
            style={{
              flex: 1,
              padding: "0.65rem 0.5rem",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: 600,
              background: recaptchaVersion === "v2" ? "#2563eb" : "transparent",
              color: recaptchaVersion === "v2" ? "#fff" : "var(--text-muted)",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px"
            }}
          >
            <span>🤖 reCAPTCHA v2</span>
            <span style={{
              fontSize: "0.65rem",
              padding: "2px 6px",
              borderRadius: "4px",
              background: recaptchaVersion === "v2" ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.06)",
              color: "#fff"
            }}>CHECKBOX</span>
          </button>

          <button
            type="button"
            onClick={() => setRecaptchaVersion("v3")}
            style={{
              flex: 1,
              padding: "0.65rem 0.5rem",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: 600,
              background: recaptchaVersion === "v3" ? "#2563eb" : "transparent",
              color: recaptchaVersion === "v3" ? "#fff" : "var(--text-muted)",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px"
            }}
          >
            <span>🛡️ reCAPTCHA v3</span>
            <span style={{
              fontSize: "0.65rem",
              padding: "2px 6px",
              borderRadius: "4px",
              background: recaptchaVersion === "v3" ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.06)",
              color: "#fff"
            }}>SCORE</span>
          </button>
        </div>

        {/* Header */}
        <div style={{ marginBottom: "1.75rem" }}>
          <h1 style={{ fontSize: "1.85rem", fontWeight: 700, marginBottom: "0.35rem", color: "var(--text-main)" }}>
            Get in Touch
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            {recaptchaVersion === "v2"
              ? "Testing reCAPTCHA v2 Enterprise (Checkbox with recaptcha_status: verified / failed)"
              : "Testing reCAPTCHA v3 Enterprise (Invisible risk score 0.0 - 1.0)"}
          </p>
        </div>

        {submitted ? (
          <div style={{ textAlign: "center", padding: "2.5rem 1rem" }}>
            <div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>✅</div>
            <h2 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              Thank You, {formData.name || "Visitor"}!
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", marginBottom: "1.5rem" }}>
              Your message has been received. Event <code>recaptcha_verification</code> &bull; <code>form_submission</code> fired to GTM dataLayer.
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSubmitted(false);
                setIsVerified(false);
                setV2Status("idle");
                setFormData({ name: "", email: "", company: "", message: "" });
              }}
            >
              Send Another Message
            </button>
          </div>
        ) : (
          <form onSubmit={handleFormSubmit}>

            {/* VERSION 2 UI: Official Google Checkbox Widget */}
            {recaptchaVersion === "v2" ? (
              <div style={{ marginBottom: "1.75rem" }}>
                <div style={{
                  padding: "1.25rem",
                  borderRadius: "10px",
                  background: v2Status === "verified"
                    ? "rgba(16, 185, 129, 0.08)"
                    : v2Status === "failed"
                    ? "rgba(239, 68, 68, 0.08)"
                    : "rgba(30, 41, 59, 0.6)",
                  border: v2Status === "verified"
                    ? "1px solid rgba(16, 185, 129, 0.4)"
                    : v2Status === "failed"
                    ? "1px solid rgba(239, 68, 68, 0.4)"
                    : "1px solid var(--border-subtle)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: "120px",
                  transition: "all 0.2s ease"
                }}>
                  {/* Google reCAPTCHA v2 Widget Mount Target */}
                  <div id="recaptcha-v2-container" style={{ display: "inline-block" }}></div>

                  {v2Status === "verified" && (
                    <div style={{ marginTop: "0.75rem", fontSize: "0.85rem", color: "#10b981", fontWeight: 600 }}>
                      ✓ reCAPTCHA v2 Verified &bull; <code>recaptcha_status: &quot;verified&quot;</code>
                    </div>
                  )}

                  {v2Status === "failed" && v2ErrorMessage && (
                    <div style={{ marginTop: "0.75rem", fontSize: "0.85rem", color: "#ef4444", fontWeight: 600, textAlign: "center" }}>
                      ⚠ {v2ErrorMessage} &bull; <code>recaptcha_status: &quot;failed&quot;</code>
                    </div>
                  )}

                  {v2Status === "idle" && (
                    <div style={{ marginTop: "0.6rem", fontSize: "0.75rem", color: "var(--text-dim)" }}>
                      Token will be verified upon clicking <strong>Submit Message</strong> below.
                    </div>
                  )}
                </div>

                {/* QA helper: Test failed attempt button */}
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.4rem" }}>
                  <button
                    type="button"
                    onClick={simulateFailedV2Attempt}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#94a3b8",
                      fontSize: "0.72rem",
                      cursor: "pointer",
                      textDecoration: "underline"
                    }}
                  >
                    QA: Simulate Failed Verification Attempt (recaptcha_status: &quot;failed&quot;)
                  </button>
                </div>
              </div>
            ) : (
              /* VERSION 3 UI: Invisible / Clean inline check */
              <div
                onClick={handleRecaptchaV3Verification}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.9rem 1.25rem",
                  borderRadius: "10px",
                  background: isVerified ? "rgba(16, 185, 129, 0.08)" : "rgba(30, 41, 59, 0.6)",
                  border: isVerified ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid var(--border-subtle)",
                  marginBottom: "1.75rem",
                  cursor: isVerified ? "default" : "pointer",
                  transition: "all 0.2s ease"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                  <div style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "5px",
                    border: isVerified ? "2px solid #10b981" : "2px solid #94a3b8",
                    background: isVerified ? "#10b981" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: "0.85rem",
                    fontWeight: 800
                  }}>
                    {verifying ? (
                      <span className="pulse-dot" style={{ width: "6px", height: "6px", background: "#38bdf8" }} />
                    ) : isVerified ? (
                      "✓"
                    ) : null}
                  </div>

                  <div>
                    <div style={{ fontSize: "0.95rem", fontWeight: 500, color: isVerified ? "#10b981" : "var(--text-main)" }}>
                      {verifying
                        ? "Verifying reCAPTCHA v3..."
                        : isVerified
                        ? `Verified Human (Score: ${recaptchaScore ?? 0.9})`
                        : "I'm not a robot (v3 Invisible)"}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
                      Key: <code>6LegCfst...HBFfL</code>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z" fill="#3b82f6" opacity="0.8"/>
                  </svg>
                  <span style={{ fontSize: "0.65rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    v3 SCORE
                  </span>
                </div>
              </div>
            )}

            {/* Form Fields: Normal Form Experience */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              
              {/* Name */}
              <div>
                <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.4rem", color: "var(--text-main)" }}>
                  Full Name <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alex Johnson"
                  value={formData.name}
                  onFocus={() => handleFieldFocus("name")}
                  onBlur={() => handleFieldBlur("name")}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "0.75rem 1rem",
                    background: "rgba(0,0,0,0.25)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "0.95rem",
                    outline: "none"
                  }}
                />
              </div>

              {/* Email */}
              <div>
                <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.4rem", color: "var(--text-main)" }}>
                  Work Email <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="alex@company.com"
                  value={formData.email}
                  onFocus={() => handleFieldFocus("email")}
                  onBlur={() => handleFieldBlur("email")}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "0.75rem 1rem",
                    background: "rgba(0,0,0,0.25)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "0.95rem",
                    outline: "none"
                  }}
                />
              </div>

              {/* Company */}
              <div>
                <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.4rem", color: "var(--text-main)" }}>
                  Company Name
                </label>
                <input
                  type="text"
                  placeholder="Acme Corp"
                  value={formData.company}
                  onFocus={() => handleFieldFocus("company")}
                  onBlur={() => handleFieldBlur("company")}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "0.75rem 1rem",
                    background: "rgba(0,0,0,0.25)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "0.95rem",
                    outline: "none"
                  }}
                />
              </div>

              {/* Message */}
              <div>
                <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.4rem", color: "var(--text-main)" }}>
                  Message
                </label>
                <textarea
                  rows={3}
                  placeholder="How can we help your team?"
                  value={formData.message}
                  onFocus={() => handleFieldFocus("message")}
                  onBlur={() => handleFieldBlur("message")}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "0.75rem 1rem",
                    background: "rgba(0,0,0,0.25)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "0.95rem",
                    outline: "none",
                    resize: "vertical"
                  }}
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: "100%", padding: "0.9rem", fontSize: "1rem", marginTop: "0.5rem" }}
                disabled={submitting}
              >
                {submitting ? "Verifying & Sending..." : "Submit Message"}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Analytics Event Inspector (Bottom Drawer) */}
      <div style={{ marginTop: "2rem" }}>
        <div className="glass-card" style={{ padding: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)" }}>
              Event Activity: <code>recaptcha_verification</code> &bull; <code>form_interact</code> &bull; <code>form_submission</code>
            </span>
            <span className="env-badge" style={{ fontSize: "0.7rem" }}>
              {eventHistory.length} Events Fired
            </span>
          </div>

          {eventHistory.length === 0 ? (
            <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", textAlign: "center", padding: "1rem 0" }}>
              Events will appear here as you verify and submit the form above.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "280px", overflowY: "auto" }}>
              {eventHistory.map((item, idx) => {
                const isVerifiedStatus = item.params?.recaptcha_status === "verified";
                const isFailedStatus = item.params?.recaptcha_status === "failed";

                return (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "0.6rem 0.75rem",
                      background: "rgba(0,0,0,0.3)",
                      borderRadius: "6px",
                      fontSize: "0.75rem",
                      borderLeft: `3px solid ${
                        item.event === "recaptcha_verification"
                          ? isFailedStatus
                            ? "#ef4444"
                            : "#10b981"
                          : item.event === "form_interact"
                          ? "#f59e0b"
                          : "#38bdf8"
                      }`
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{
                        padding: "1px 5px",
                        borderRadius: "3px",
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        background: item.version === "v2" ? "rgba(59, 130, 246, 0.25)" : "rgba(16, 185, 129, 0.25)",
                        color: item.version === "v2" ? "#60a5fa" : "#34d399"
                      }}>
                        {item.version.toUpperCase()}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "#fff" }}>
                        {item.event}
                      </span>

                      {item.params?.recaptcha_status != null ? (
                        <span style={{
                          padding: "1px 6px",
                          borderRadius: "3px",
                          fontSize: "0.65rem",
                          fontWeight: 700,
                          background: isVerifiedStatus ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)",
                          color: isVerifiedStatus ? "#10b981" : "#ef4444"
                        }}>
                          {String(item.params.recaptcha_status).toUpperCase()}
                        </span>
                      ) : null}
                    </div>
                    <span style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                      {item.timestamp} &bull; GTM dataLayer
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
