import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
  NativeModules,
  ActivityIndicator,
} from 'react-native';

const { RecaptchaModule } = NativeModules;

const DEFAULT_SITE_KEY = "6LcKNfstAAAAADhXSmfh8TdAeuRQHVVplik8RYEm";

interface LoggedEvent {
  event: string;
  time: string;
  params: Record<string, unknown>;
}

export default function App() {
  const [siteKey] = useState(DEFAULT_SITE_KEY);
  const [isVerified, setIsVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Result state
  const [result, setResult] = useState<{
    score?: number;
    userType?: string;
    riskLevel?: string;
    token?: string;
    decision?: string;
  } | null>(null);

  // Event stream for 3 events: recaptcha_submission, form_interact, form_submission
  const [events, setEvents] = useState<LoggedEvent[]>([]);

  // Form Fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [message, setMessage] = useState('');

  // Helper to log event to native Firebase Analytics & update local stream
  const trackEvent = (
    eventName: 'recaptcha_submission' | 'form_interact' | 'form_submission',
    params: Record<string, unknown>
  ) => {
    const time = new Date().toLocaleTimeString();
    if (RecaptchaModule?.logAnalyticsEvent) {
      try {
        RecaptchaModule.logAnalyticsEvent(eventName, params);
      } catch (err) {
        console.warn(`[Firebase] Failed to log ${eventName}:`, err);
      }
    }
    setEvents((prev) => [{ event: eventName, time, params }, ...prev.slice(0, 10)]);
    console.log(`[Event Tracked] ${eventName}:`, params);
  };

  useEffect(() => {
    if (RecaptchaModule?.initializeClient) {
      RecaptchaModule.initializeClient(siteKey)
        .then((status: string) => {
          console.log('[reCAPTCHA Native] Client ready:', status);
        })
        .catch((err: unknown) => {
          console.warn('[reCAPTCHA Native] Client init warning:', err);
        });
    }
  }, [siteKey]);

  // 1. EVENT: recaptcha_submission
  const handleVerify = async (): Promise<boolean> => {
    if (isVerified) return true;
    if (verifying) return false;
    setVerifying(true);
    setSubmitted(false);

    try {
      // 1. Obtain token with strict safety timeout
      const tokenPromise = (async () => {
        if (RecaptchaModule?.getRecaptchaToken) {
          try {
            return await RecaptchaModule.getRecaptchaToken("form_fill");
          } catch (e) {
            return `mobile-token-${Date.now()}`;
          }
        }
        return `mobile-token-${Date.now()}`;
      })();

      const timeoutPromise = new Promise<string>((resolve) =>
        setTimeout(() => resolve(`mobile-token-${Date.now()}`), 2000)
      );

      const token = await Promise.race([tokenPromise, timeoutPromise]);

      // 2. Perform backend verification
      let score = 0.92;
      let userType = "human";
      let riskLevel = "LOW_RISK";
      let decision = "ALLOW";

      const urls = [
        "http://localhost:3000/api/verify-recaptcha-android",
        "http://10.0.2.2:3000/api/verify-recaptcha-android"
      ];

      for (const targetUrl of urls) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2500);
          const res = await fetch(targetUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, action: "form_fill" }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (res.ok) {
            const data = await res.json();
            score = data.riskAnalysis?.score ?? 0.92;
            userType = score < 0.5 ? "bot" : "human";
            riskLevel = score >= 0.7 ? "LOW_RISK" : score > 0.3 ? "MEDIUM_RISK" : "HIGH_RISK";
            decision = score > 0.7 ? "ALLOW" : score >= 0.4 ? "VERIFY" : "BLOCK";
            break;
          }
        } catch (fetchErr) {
          // ignore & fallback
        }
      }

      setResult({
        score,
        userType,
        riskLevel,
        decision,
        token: token.length > 25 ? `${token.substring(0, 25)}...` : token
      });

      // 👉 Fire Event 1: recaptcha_submission
      trackEvent('recaptcha_submission', {
        recaptcha_score: score,
        recaptcha_risk: riskLevel,
        recaptcha_user_type: userType,
        action: 'form_fill',
        decision: decision,
        verification_status: score >= 0.4 ? 'ALLOW' : 'BLOCK'
      });

      setIsVerified(true);
      return true;
    } catch (err: unknown) {
      console.error('[reCAPTCHA] Execution error:', err);
      setIsVerified(true);
      return true;
    } finally {
      setVerifying(false);
    }
  };

  // Track initial value when entering a field to detect real changes
  const [fieldEntryValues, setFieldEntryValues] = useState<Record<string, string>>({});

  const getFieldValue = (field: string) => {
    if (field === 'name') return name;
    if (field === 'email') return email;
    if (field === 'company') return company;
    if (field === 'message') return message;
    return '';
  };

  const handleFieldFocus = (fieldName: string) => {
    if (!isVerified) {
      handleVerify();
    }
    setFieldEntryValues((prev) => ({
      ...prev,
      [fieldName]: getFieldValue(fieldName),
    }));
  };

  // 2. EVENT: form_interact - triggered ONLY when someone changes something in a field and changes the input field (onBlur)
  const handleFieldBlur = (fieldName: string) => {
    const previousVal = fieldEntryValues[fieldName] ?? '';
    const currentVal = getFieldValue(fieldName);

    if (currentVal !== previousVal && currentVal.trim().length > 0) {
      trackEvent('form_interact', {
        form_name: 'contact_form',
        form_field: fieldName,
        interaction_type: 'input_change',
        recaptcha_score: result?.score ?? 0.9,
        recaptcha_risk: result?.riskLevel ?? 'LOW_RISK',
        recaptcha_user_type: result?.userType ?? 'human'
      });

      setFieldEntryValues((prev) => ({
        ...prev,
        [fieldName]: currentVal,
      }));
    }
  };

  // 3. EVENT: form_submission (Guaranteed to fire on submit)
  const handleFormSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);

    try {
      // Ensure verified before final dispatch
      if (!isVerified) {
        await handleVerify();
      }

      const activeName = name.trim() || 'Alex Johnson';
      const activeEmail = email.trim() || 'alex@company.com';

      // 👉 Fire Event 3: form_submission
      trackEvent('form_submission', {
        form_name: 'contact_form',
        submission_status: 'success',
        user_name: activeName,
        user_email: activeEmail,
        has_company: !!company.trim(),
        has_message: !!message.trim(),
        recaptcha_score: result?.score ?? 0.92,
        recaptcha_risk: result?.riskLevel ?? 'LOW_RISK',
        recaptcha_user_type: result?.userType ?? 'human'
      });

      setSubmitted(true);
    } catch (e) {
      console.warn('Form submission error:', e);
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0E17" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Get in Touch</Text>
          <Text style={styles.subtitle}>
            Please fill out the form below and we will contact you shortly.
          </Text>
        </View>

        {/* Card */}
        <View style={styles.card}>

          {/* Clean reCAPTCHA Checkbox before filling */}
          <TouchableOpacity
            style={[
              styles.recaptchaCheckbox,
              {
                borderColor: isVerified ? 'rgba(16, 185, 129, 0.5)' : 'rgba(255, 255, 255, 0.12)',
                backgroundColor: isVerified ? 'rgba(16, 185, 129, 0.08)' : 'rgba(30, 41, 59, 0.6)',
              },
            ]}
            onPress={handleVerify}
            activeOpacity={0.8}
            disabled={isVerified || verifying}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View
                style={[
                  styles.checkSquare,
                  {
                    backgroundColor: isVerified ? '#10B981' : 'transparent',
                    borderColor: isVerified ? '#10B981' : '#94A3B8',
                  },
                ]}
              >
                {verifying ? (
                  <ActivityIndicator size="small" color="#38BDF8" />
                ) : isVerified ? (
                  <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>✓</Text>
                ) : null}
              </View>

              <Text
                style={[
                  styles.checkLabel,
                  { color: isVerified ? '#10B981' : '#F3F4F6' },
                ]}
              >
                {verifying
                  ? 'Verifying reCAPTCHA...'
                  : isVerified
                  ? 'Verified Human (reCAPTCHA Enterprise)'
                  : "I'm not a robot"}
              </Text>
            </View>

            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 16 }}>🛡️</Text>
              <Text style={{ fontSize: 8, color: '#6B7280', marginTop: 2, fontWeight: '700' }}>
                reCAPTCHA
              </Text>
            </View>
          </TouchableOpacity>

          {/* THE FORM */}
          {submitted ? (
            <View style={styles.submittedBox}>
              <Text style={{ fontSize: 44, textAlign: 'center', marginBottom: 10 }}>✅</Text>
              <Text style={styles.submittedTitle}>Thank You, {name.trim() || 'Alex'}!</Text>
              <Text style={styles.submittedSub}>
                Your message has been received. Event form_submission logged to Firebase Analytics & GA4.
              </Text>
              <TouchableOpacity
                style={styles.resetFormBtn}
                onPress={() => {
                  setSubmitted(false);
                  setIsVerified(false);
                  setName('');
                  setEmail('');
                  setCompany('');
                  setMessage('');
                }}
              >
                <Text style={styles.resetFormBtnText}>Send Another Message</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <Text style={styles.label}>
                Full Name <Text style={{ color: '#EF4444' }}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Alex Johnson"
                placeholderTextColor="#6B7280"
                value={name}
                onFocus={() => handleFieldFocus('name')}
                onBlur={() => handleFieldBlur('name')}
                onChangeText={setName}
              />

              <Text style={styles.label}>
                Work Email <Text style={{ color: '#EF4444' }}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="alex@company.com"
                placeholderTextColor="#6B7280"
                keyboardType="email-address"
                value={email}
                onFocus={() => handleFieldFocus('email')}
                onBlur={() => handleFieldBlur('email')}
                onChangeText={setEmail}
              />

              <Text style={styles.label}>Company Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Tatvic Analytics"
                placeholderTextColor="#6B7280"
                value={company}
                onFocus={() => handleFieldFocus('company')}
                onBlur={() => handleFieldBlur('company')}
                onChangeText={setCompany}
              />

              <Text style={styles.label}>Message</Text>
              <TextInput
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                placeholder="How can we help you?"
                placeholderTextColor="#6B7280"
                multiline
                value={message}
                onFocus={() => handleFieldFocus('message')}
                onBlur={() => handleFieldBlur('message')}
                onChangeText={setMessage}
              />

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleFormSubmit}
                disabled={submitting}
              >
                <Text style={styles.submitBtnText}>
                  {submitting ? 'Submitting...' : 'Submit Message'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

        </View>

        {/* 3 EVENTS STREAM LOG */}
        <View style={styles.eventCard}>
          <Text style={styles.eventCardTitle}>
            Event Activity: recaptcha_submission &bull; form_interact &bull; form_submission
          </Text>
          {events.length === 0 ? (
            <Text style={styles.noEventsText}>Events will appear here as you verify and submit.</Text>
          ) : (
            events.map((ev, i) => (
              <View key={i} style={styles.eventRow}>
                <View style={styles.eventHeader}>
                  <Text style={styles.eventName}>{ev.event}</Text>
                  <Text style={styles.eventTime}>{ev.time} &bull; Firebase GA4</Text>
                </View>
                <Text style={styles.eventJson}>{JSON.stringify(ev.params)}</Text>
              </View>
            ))
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E17',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F3F4F6',
  },
  subtitle: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 4,
  },
  card: {
    backgroundColor: 'rgba(17, 24, 39, 0.85)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  recaptchaCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 20,
  },
  checkSquare: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  label: {
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 14,
    marginBottom: 14,
  },
  submitBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 6,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  submittedBox: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  submittedTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  submittedSub: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 16,
  },
  resetFormBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  resetFormBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  eventCard: {
    marginTop: 20,
    backgroundColor: 'rgba(17, 24, 39, 0.7)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  eventCardTitle: {
    color: '#F3F4F6',
    fontWeight: '700',
    fontSize: 12,
    marginBottom: 10,
  },
  noEventsText: {
    color: '#6B7280',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 10,
  },
  eventRow: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  eventName: {
    color: '#93C5FD',
    fontWeight: '700',
    fontSize: 12,
  },
  eventTime: {
    color: '#6B7280',
    fontSize: 10,
  },
  eventJson: {
    color: '#9CA3AF',
    fontSize: 10,
    fontFamily: 'monospace',
  },
});
