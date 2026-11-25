# Privacy Policy for Tempo — Energy Focus Timer

**Last Updated: September 22, 2026**

Tempo ("we", "our", or "the App") is committed to protecting your privacy. Tempo is architected from the ground up as an **offline-first, privacy-by-default** focus and study application.

---

## 1. Overview of Core Principles

* **No Accounts Required**: You do not need to create an account, log in, or provide personal credentials (such as your name, email address, or phone number) to use Tempo.
* **Offline-First Core**: Tempo's core experience works offline. All timer sessions, study notes, focus ratings, subjects, and goals are stored locally on your device in an isolated local database. Optional AI reflections require an internet connection and are disabled by default.
* **Zero Trackers or Advertisements**: Tempo contains no advertising libraries, no behavioral analytics SDKs, and no device fingerprinting trackers.
* **Optional AI Reflections**: AI-assisted focus reflections are **strictly opt-in and disabled by default**. When disabled, Tempo generates zero network requests.

---

## 2. Information We Process

### A. Local On-Device Data (Always Local)
The following information is stored locally on your device:
* Focus session durations, planned vs. actual times, and timestamps.
* User-selected energy ratings (1 to 5) and focus quality feedback.
* Study subjects, session categories, notes, and distraction tallies.
* Daily/weekly study targets and streak counts.

Tempo stores core data locally on your device. Android system backup and device-transfer features may copy app data according to your device and account settings. This information never leaves your device unless you initiate a system backup, initiate an export, or enable optional AI reflections.

### B. Optional AI Focus Reflections (Opt-In Only)
If and only if you explicitly toggle on **AI Focus Reflections** in Settings:
* **What is sent**: A strictly minimized and sanitized summary of your most recent study sessions (up to 5 recent sessions), consisting of subject name, session type, energy rating, planned duration, and user-entered notes.
* **Sanitization & Limitations**: Before transmission, user notes are automatically filtered through regex sanitizers to redact common API keys, passwords, and email addresses. Automated pattern filtering cannot guarantee the detection or removal of all unstructured personal information (such as personal names, phone numbers, or private addresses) typed into free-text notes. We advise users not to include sensitive personal details in study notes.
* **Rate Limiting & Abuse Prevention**: An anonymous installation identifier generated randomly on the device (UUID) is transmitted in request headers exclusively for rate limiting and abuse prevention. It is not an authentication token and is not linked to your personal identity. Standard network-level IP addresses are processed in transit by hosting infrastructure to route requests and enforce abuse limits, and are not stored in user profiles.
* **What is NEVER sent**: Personal contact details, real names, email addresses, advertising identifiers (GAID), persistent hardware serials, location data, or your full historical database.
* **Encryption**: All transmissions are protected with HTTPS/TLS encryption in transit through Tempo's secure backend gateway.
* **Non-Diagnostic**: Reflections are limited to study habit observations. Tempo never provides medical, psychological, or diagnostic advice.

---

## 3. Device Permissions

Tempo requests only the minimum Android permissions necessary to function:
* **`POST_NOTIFICATIONS` (Android 13+)**: Used strictly to show ongoing timer status while you study and to alert you when a focus session or break ends. We do not send marketing or remote push notifications.
* **`VIBRATE`**: Used to provide haptic feedback when starting, pausing, or completing a timer session.
* **`INTERNET`**: Required exclusively for the optional AI reflection feature if enabled by the user.

---

## 4. User Data Control, Export & Deletion

* **Complete Export**: You can export your entire session history at any time as standard JSON or CSV files through the Settings screen.
* **One-Tap Erasure**: You can permanently and irreversibly erase all session records, goals, and preferences at any time by selecting **Erase All Records** in Settings.
* **App Uninstallation**: Uninstalling Tempo immediately deletes all local database tables and preferences stored within the application's sandbox.

---

## 5. Third-Party Services

Tempo does not sell, rent, or trade your data with third parties. When AI Reflections are enabled, session summaries are processed via Tempo's secure backend proxy to generate reflection text without storing or profiling user identities.

---

## 6. Children's Privacy

Tempo does not knowingly collect or solicit personal information from children under the age of 13. Tempo's core experience works offline and requires no account creation, so no personal identification data is ever gathered.

---

## 7. Contact Us

If you have questions or concerns regarding this Privacy Policy or your data, please contact the developer via the official repository or support channel listed on our Google Play Store page.
