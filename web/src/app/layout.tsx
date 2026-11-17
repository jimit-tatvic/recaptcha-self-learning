import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "reCAPTCHA Enterprise Testing | Tatvic",
  description: "reCAPTCHA v3 Enterprise Testing with GTM dataLayer integration",
};

const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "6LegCfstAAAAAErSFGl5A2C1j9OgpHGC9rkHBFfL";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Google Tag Manager */}
        <Script
          id="google-tag-manager"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-MCPBM8KQ');`,
          }}
        />
        {/* End Google Tag Manager */}

        {/* Load Google reCAPTCHA Enterprise SDK */}
        <Script
          src={`https://www.google.com/recaptcha/enterprise.js?render=${SITE_KEY}`}
          strategy="afterInteractive"
        />
      </head>
      <body>
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-MCPBM8KQ"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        {/* End Google Tag Manager (noscript) */}

        <nav className="navbar">
          <div className="logo-container">
            <span className="logo-badge">TATVIC</span>
            <div>
              <div className="logo-text">reCAPTCHA Enterprise</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>Testing &amp; GTM dataLayer</div>
            </div>
          </div>

          <div className="env-badge">
            <span className="pulse-dot"></span>
            <span>GTM: GTM-MCPBM8KQ</span>
          </div>
        </nav>

        <main>{children}</main>

        <footer style={{
          borderTop: "1px solid var(--border-subtle)",
          padding: "1.5rem",
          textAlign: "center",
          color: "var(--text-dim)",
          fontSize: "0.85rem",
          marginTop: "3rem"
        }}>
          reCAPTCHA Enterprise &bull; Project: <code>tatvic-testing</code> &bull; GTM Container: <code>GTM-MCPBM8KQ</code>
        </footer>
      </body>
    </html>
  );
}
