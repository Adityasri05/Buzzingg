# ⚡ Buzzingg

A premium, high-performance real-time buzzer web application built for **GDG SRMCEM**. Buzzingg allows moderators to host live interactive trivia or quiz sessions (like *Cinema Riddle* or *Brand Identity*) where participants can join instantly via QR code and buzz in with millisecond-precision response tracing.

---

## ✨ Features

- **⚡ Precision Buzz Telemetry**: Traces and sorts participant buzz times down to millisecond accuracy, ensuring fair contention tracking.
- **📱 Instant Access Point**: Features a high-visibility connection panel with a zoom-to-maximize QR code modal so participants in any room size can scan and join instantly.
- **🏆 Clean Live Leaderboard**: Displays participant ranks dynamically with customizable badges (`1ST`, `2ND`, etc.) and embeds the precision response time (e.g. `• ⚡ 1.234s`) directly beside scores.
- **🛡️ Instant Session Termination**: Administrators can instantly wipe current session data, reset active states, and return to the game initialization setup.
- **🚀 Serverless Firestore Architecture**: Replaced the traditional socket server with direct, optimized client-side Firestore synchronization (`onSnapshot`), offering infinite scalability and zero hosting cost.
- **📦 Bypassed CDN Cache**: Configured built-in hosting headers to prevent caching of static HTML/JS resources, ensuring all players automatically load the latest build version.

---

## 🛠️ Technology Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Framer Motion (for sleek transitions).
- **Backend Database**: Cloud Firestore (Real-time NoSQL DB).
- **Hosting**: Firebase Hosting.
- **Icons**: Lucide React.

---

## 🚀 Getting Started

### Prerequisites

Make sure you have **Node.js** (v18 or higher) installed on your system.

### Local Setup

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/Adityasri05/Buzzingg.git
   cd Buzzingg
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env.local` file in the root directory and add your Firebase configuration parameters:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

4. **Launch the Development Server**:
   ```bash
   npm run dev
   ```
   Open your browser and navigate to `http://localhost:5173` (or the port specified in terminal).

---

## 🔒 Security & Roles

- **Admin Password**: Access the admin dashboard (`/admin`) using the secure hardcoded passphrase `"gdgsrmcem"`.
- **Firestore Security Rules**: The project comes with wide-open security rules suited for live events in `firestore.rules`. For production usage, deploy restricted rules:
  ```javascript
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /{document=**} {
        allow read, write: if true;
      }
    }
  }
  ```

---

## 🚢 Production Deployment

To compile static assets and deploy directly to Firebase Hosting:

1. **Build the Project**:
   ```bash
   npm run build
   ```

2. **Deploy to Firebase**:
   ```bash
   firebase deploy
   ```

---

## 📁 Project Structure

```
├── .firebaserc              # Firebase project configuration mapping
├── firebase.json            # Firebase hosting redirects and header definitions
├── firestore.rules          # Database security rules
├── package.json             # NPM package scripts & dependencies
├── tailwind.config.js       # Tailwind layout & spacing parameters
├── vite.config.ts           # Vite compile configurations
├── src/
│   ├── main.tsx             # Application entry-point
│   ├── types.ts             # Domain typescript schemas (Game, Participant, Buzz)
│   ├── lib/
│   │   └── firebase.ts      # Firebase Client SDK initializer
│   └── components/
│       ├── LandingPage.tsx  # Welcome portal
│       ├── JoinGame.tsx     # Player onboarding panel
│       ├── ParticipantView.tsx # Real-time player buzzer layout
│       ├── AdminLogin.tsx   # Dashboard access gateway
│       └── AdminDashboard.tsx # Comprehensive admin moderation system
```
