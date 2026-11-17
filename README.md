# Tatvic reCAPTCHA v3 Enterprise & GA4 Integration Suite

Testing project for **Google reCAPTCHA Enterprise (v3)** with **GA4 / GTM DataLayer Bridge** across both **Web (Next.js)** and **Mobile (React Native Android APK)**.

---

## 📱 Android App Package Name (For Firebase & Google Cloud Console)

Use this exact package name when adding the Android App in the **Firebase Console** and registering the Android Key in **Google Cloud reCAPTCHA Enterprise**:

```text
com.tatvic.recaptchatesting
```

- **Firebase Project ID**: `tatvic-testing`
- **Measurement ID**: `G-KLNZ258QWL`
- **SHA-1 (Debug Keystore)**: `a8:e5:02:e7:28:13:df:bb:2b:49:15:2a:75:aa:ec:cc:5f:06:55:0f`

---

## 📁 Project Structure

```
recaptcha-self-learning/
├── .env                              # GCP, Firebase & reCAPTCHA credentials
├── server.js                         # Standalone Express verification server (from doc Step 4)
├── package.json                      # Workspace runner scripts
│
├── web/                              # Next.js Web Application
│   ├── .env.local                    # Web environment configuration
│   └── src/
│       ├── app/
│       │   ├── page.tsx              # Single-page form with pre-prompt reCAPTCHA verification
│       │   ├── layout.tsx            # Global layout with Enterprise SDK script & dataLayer init
│       │   ├── globals.css           # Modern dark UI theme with glassmorphism & risk badges
│       │   └── api/
│       │       ├── verify-recaptcha/         # Backend verification endpoint for Web
│       │       └── verify-recaptcha-android/ # Backend verification endpoint for Android
│       └── lib/
│           ├── firebase.ts           # Firebase client app & analytics initialization
│           └── recaptcha-service.ts  # Google reCAPTCHA Enterprise SDK service
│
└── mobile/                           # React Native Android Application
    ├── App.tsx                       # Single-screen React Native form with reCAPTCHA prompt
    ├── app.json                      # TatvicRecaptcha configuration
    └── android/
        ├── app/
        │   ├── build.gradle          # recaptcha:18.4.0, okhttp:4.12.0, firebase-analytics
        │   ├── google-services.json  # Firebase configuration for com.tatvic.recaptchatesting
        │   └── src/main/java/com/tatvic/recaptchatesting/
        │       ├── MainActivity.java
        │       ├── MainApplication.java
        │       ├── RecaptchaModule.java     # Native module handling reCAPTCHA & Firebase logEvent
        │       ├── RecaptchaPackage.java    # Bridge registration
        │       └── TestFlowActivity.java    # Human verified target activity (doc Step 5)
        └── build/outputs/apk/debug/app-debug.apk # Built installable Android APK
```

---

## 🔑 Credentials Stored in `.env`

All credentials have been securely stored in `.env` and `web/.env.local`:
- **GCP Project**: `tatvic-testing`
- **OAuth Client ID**: `367413191242-t0cgb9k6mjvu766r8h8a7l29ihss65sr.apps.googleusercontent.com`
- **Firebase Web App ID**: `1:671930500205:web:48fc50b557805f7fc62b64`
- **Firebase Measurement ID**: `G-KLNZ258QWL`
- **Android Package**: `com.tatvic.recaptchatesting`

---

## 🚀 How to Run

### 1. Run the Web Application (Next.js)
```bash
npm run dev
# Or: cd web && npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

- You will see the form protected by a **Security Check**.
- Click **"Verify with reCAPTCHA Enterprise"** to generate the token, evaluate risk score (0.0 – 1.0), and push to `window.dataLayer` and Firebase Analytics.
- When verified, the form unlocks for user input and submission.
- Fast QA buttons (**Human 0.95**, **Review 0.55**, **Bot 0.15**) allow testing each risk tier without needing bot traffic.

---

### 2. Run / Build the Android App (React Native)

To rebuild the Android debug APK:
```bash
npm run mobile:build-apk
```
The installable APK will be at:
```text
mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

To install on an emulator or connected Android device via ADB:
```bash
adb install -r mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 📊 GA4 / GTM DataLayer Event Specification

When an interaction is assessed, the following event is pushed to `dataLayer` (Web) and logged via Firebase Analytics (Android):

```json
{
  "event": "recaptcha_verification",
  "recaptcha_score": 0.92,
  "recaptcha_risk": "LOW_RISK",
  "recaptcha_user_type": "human"
}
```

### Risk Buckets:
- **`score >= 0.7`**: `LOW_RISK` (Legitimate human traffic, `ALLOW`)
- **`0.3 < score < 0.7`**: `MEDIUM_RISK` (Suspicious interaction, `VERIFY`)
- **`score <= 0.3`**: `HIGH_RISK` (Bot traffic signature, `BLOCK`)
