# Google Play Console — Data Safety Form Guide for Tempo

This document provides the exact answers required to complete the **Data safety** section in the Google Play Console for **Tempo — Energy Focus Timer** (`com.tempo.focus`).

---

## Section 1: Data Collection and Security

### 1. Does your app collect or share any of the required user data types?
* **Answer**: **Yes**
* *Explanation*: The core app is offline-first, but because Tempo contains an optional, opt-in feature ("AI Focus Reflections") where user-provided study notes and ratings can be transmitted over HTTPS to a backend server upon explicit user activation, Google Play guidelines classify this as data collection.

### 2. Is all of the user data collected by your app encrypted in transit?
* **Answer**: **Yes**
* *Details*: All network requests use HTTPS/TLS encryption in transit. Cleartext traffic is strictly forbidden (`usesCleartextTraffic="false"`).

### 3. Do you provide a way for users to request that their data be deleted?
* **Answer**: **Yes**
* *Details*: Users can instantly and permanently erase all data with the "Erase All Records" button in Settings, or by clearing app storage / uninstalling the app.

---

## Section 2: Data Types Breakdown

Select **No** for all categories except **App activity (User-generated content or Other)** and note the anonymous installation identifier:

| Data Type Category | Collected? | Shared? | Notes |
| :--- | :--- | :--- | :--- |
| **Location** | ❌ No | ❌ No | Tempo never accesses GPS, cell, or Wi-Fi location. |
| **Personal Info** (Name, Email, Phone, Address, User IDs) | ❌ No | ❌ No | No user accounts or login credentials. |
| **Financial Info** | ❌ No | ❌ No | No in-app purchases, credit cards, or financial data. |
| **Health and Fitness** | ❌ No | ❌ No | Non-medical study timer; no health metrics collected. |
| **Messages / SMS / Emails** | ❌ No | ❌ No | No messaging or chat functionality. |
| **Photos and Videos** | ❌ No | ❌ No | No gallery or media permissions requested. |
| **Audio Files** | ❌ No | ❌ No | No microphone or audio recording. |
| **Files and Documents** | ❌ No | ❌ No | No generic file system access. |
| **Calendar / Contacts** | ❌ No | ❌ No | No calendar or contact book access. |
| **App Performance / Crash Logs** | ❌ No | ❌ No | No third-party crash reporting SDKs included. |
| **Device or other IDs** | ⚠️ Anonymous App ID | ❌ No | An anonymous installation identifier (random UUID) is generated locally and sent in request headers solely for rate limiting and abuse control when AI Reflections are enabled. No hardware IDs (IMEI, MAC, SSAID) or advertising IDs (GAID) are collected. |

---

## Section 3: App Activity Details (Optional AI Feature)

Under **App activity** > **User-generated content** (or **Other actions**):

* **Is this data collected, shared, or both?**: **Collected** (and processed transiently via secure backend proxy).
* **Is this data processed ephemerally?**: **Yes** (used only to generate the reflection text; not retained or linked to individual accounts).
* **Is this data required or optional?**: **Optional (Users can choose whether this data is collected)**.
* **Why is this user data collected?**:
  * Check: **App functionality**
  * Check: **Fraud prevention, security, and compliance** (for rate limiting with anonymous installation identifier)
* **Collection details**:
  * Only active when user explicitly turns on "AI Focus Reflections" in Settings (off by default).
  * Consists only of sanitized study session notes and ratings (max 5 sessions).
  * An anonymous installation identifier is used strictly for server-side sliding-window rate limiting.

---

## Section 4: System Backup & Device Transfer

* Tempo stores core data locally on your device. Android system backup and device-transfer features may copy app data according to your device and account settings.

---

## Section 5: Target Audience and Content

* **Target Age**: 13 and older (or General Audience).
* **Ads**: Declare **"No, my app does not contain ads"**.
* **Financial Features**: Declare **"No financial features"**.
* **Health / Medical Features**: Declare **"No health features / Non-Medical"**.
