package com.tatvic.recaptchatesting;

import android.app.Activity;
import android.os.Bundle;
import android.util.Log;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableMapKeySetIterator;
import com.facebook.react.bridge.WritableMap;
import com.google.android.recaptcha.Recaptcha;
import com.google.android.recaptcha.RecaptchaAction;
import com.google.android.recaptcha.RecaptchaTasksClient;
import com.google.firebase.analytics.FirebaseAnalytics;

public class RecaptchaModule extends ReactContextBaseJavaModule {
    private static final String TAG = "reCAPTCHA";
    private RecaptchaTasksClient recaptchaTasksClient;
    private final FirebaseAnalytics mFirebaseAnalytics;
    private final ReactApplicationContext reactContext;

    public RecaptchaModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        this.mFirebaseAnalytics = FirebaseAnalytics.getInstance(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return "RecaptchaModule";
    }

    @ReactMethod
    public void initializeClient(String siteKey, Promise promise) {
        if (siteKey == null || siteKey.trim().isEmpty()) {
            siteKey = "6LcKNfstAAAAADhXSmfh8TdAeuRQHVVplik8RYEm";
        }

        final String activeKey = siteKey;
        Activity activity = getCurrentActivity();
        android.app.Application app = activity != null 
                ? activity.getApplication() 
                : (android.app.Application) reactContext.getApplicationContext();

        Recaptcha.getTasksClient(app, activeKey)
            .addOnSuccessListener(client -> {
                recaptchaTasksClient = client;
                Log.d(TAG, "reCAPTCHA Enterprise Client ready with site key: " + activeKey);
                promise.resolve("READY");
            })
            .addOnFailureListener(e -> {
                Log.w(TAG, "reCAPTCHA Enterprise Client init warning: " + e.getMessage());
                promise.resolve("READY_SIMULATION_FALLBACK");
            });
    }

    /**
     * Obtains the reCAPTCHA token from Google Enterprise SDK.
     * Networking and score verification are performed directly in React Native.
     */
    @ReactMethod
    public void getRecaptchaToken(String actionName, Promise promise) {
        final String safeAction = (actionName != null && !actionName.trim().isEmpty()) 
                ? actionName 
                : "form_fill";

        if (recaptchaTasksClient != null) {
            recaptchaTasksClient.executeTask(RecaptchaAction.custom(safeAction))
                .addOnSuccessListener(token -> {
                    Log.d(TAG, "Obtained reCAPTCHA token successfully");
                    promise.resolve(token);
                })
                .addOnFailureListener(e -> {
                    Log.w(TAG, "Token fetch warning: " + e.getMessage() + ". Using fallback token.");
                    promise.resolve("mobile-enterprise-token-" + System.currentTimeMillis());
                });
        } else {
            Log.w(TAG, "TasksClient is null. Returning fallback token.");
            promise.resolve("mobile-enterprise-token-" + System.currentTimeMillis());
        }
    }

    /**
     * Direct bridge for Firebase Analytics event logging.
     */
    @ReactMethod
    public void logAnalyticsEvent(String eventName, ReadableMap paramsMap) {
        try {
            Bundle bundle = new Bundle();
            if (paramsMap != null) {
                ReadableMapKeySetIterator iterator = paramsMap.keySetIterator();
                while (iterator.hasNextKey()) {
                    String key = iterator.nextKey();
                    switch (paramsMap.getType(key)) {
                        case String:
                            bundle.putString(key, paramsMap.getString(key));
                            break;
                        case Number:
                            bundle.putDouble(key, paramsMap.getDouble(key));
                            break;
                        case Boolean:
                            bundle.putBoolean(key, paramsMap.getBoolean(key));
                            break;
                        default:
                            break;
                    }
                }
            }
            mFirebaseAnalytics.logEvent(eventName, bundle);
            Log.d(TAG, "[Firebase Analytics] Logged event: " + eventName);
        } catch (Exception e) {
            Log.e(TAG, "[Firebase Analytics] Failed to log event " + eventName + ": " + e.getMessage());
        }
    }
}
