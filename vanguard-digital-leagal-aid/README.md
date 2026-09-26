# 🏛️ Vanguard Digital Legal Aid PWA (জাতীয় আইনগত সহায়তা)

> **Government-Grade Progressive Web Application for the National Legal Aid Services Organization (NLASO), Bangladesh**  
> Built with React 19, Vite 8, TypeScript, Tailwind CSS v4, and offline-first Progressive Web App (PWA) architecture. 100% mobile-compatible with responsive ergonomics for smartphones, tablets, and desktops.

---

## 🌟 Key Features & Role Architecture

The application implements 5 distinct operational roles adhering strictly to the **Legal Aid Act 2000 (আইনগত সহায়তা প্রদান আইন ২০০০)** and **Legal Aid Rules**:

### 1. 🏢 DLAO Admin (জেলা লিগ্যাল এইড অফিসার)
- **Triage Dashboard**: AI-powered urgency scoring, systemic pattern detection, and backlog management.
- **Pattern Alert (Challenge T1)**: Automatic detection of inactive panel lawyers (e.g. `Advocate Marzina Begum`) reaching inactivity thresholds with 1-click **Review & Reassign**.
- **Jurisdiction Referral Flow (Challenge T2)**: Visual history of ping-pong bounces between DLAO and Labour Cell with automatic **Escalate to Chief Officer** binding jurisdiction decree after 2 bounces.
- **Role-Based Sensitive Evidence Protection (Challenge A3)**: Complete visual blurring on thumbnails for sensitive harassment cases with access restricted exclusively to **Authorized Receiving DLAO (Role B6)** with formal **Acknowledge Receipt**.
- **Interactive Dossier Slide-Over**: Full-height mobile modal with lawyer assignment, police 999 hotline integration, and NID identity verification.

### 2. 📱 UDC Entrepreneur (ইউনিয়ন ডিজিটাল সেন্টার উদ্যোক্তা)
- **Assisted Citizen Intake**: Simplified form for rural citizens with proxy provenance separation.
- **Audio Voice Recording**: Simulated audio transcription for illiterate or distressed citizens.
- **Traffic Light Sync Indicator**: Live visual tracking of offline storage, queued sync items, and server handshake.

### 3. 👤 Citizen & Proxy (নাগরিক ও প্রক্সি ভিউ)
- **Malek Simplified Low-Literacy View**: Oversized Bengali visual cards with interactive text-to-speech audio guidance.
- **Standard Tracking View**: Real-time hearing dates, lawyer assignment details, and case progress milestones.

### 4. ⚖️ ADR Mediator (বিকল্প বিরোধ নিষ্পত্তি ও সালিশ)
- **AI-Assisted Settlement Deed (Challenge T7)**: Instant deed generation highlighting AI-inferred maintenance and custody clauses with mandatory human-in-the-loop review alerts.
- **Offline E-Signature Pad (Challenge T11)**: Touch-accurate cryptographic digital signing with dedicated full-screen mobile canvas modal ("বড় প্যাডে স্বাক্ষর") and cryptographic hash sync.

### 5. 💼 Panel Lawyer (প্যানেল আইনজীবী পোর্টাল)
- **Hearing Progress Console**: Submit hearing updates, certified copies, and scheduled court dates directly to DLAO records.
- **Lawyer Profile Simulator**: Instant toggle between regular panel advocates and monitored lawyers.

---

## 📱 Mobile Compatibility & Ergonomics

- **Safe-Area Insets**: Full support for iPhone notch and Android navigation bars (`env(safe-area-inset-*)`).
- **iOS Auto-Zoom Prevention**: Enforces 16px minimum font size on mobile inputs to eliminate Safari viewport jumping.
- **Persistent Bottom Navigation Bar**: 5-tab thumb-friendly navigation bar with dynamic notification badges.
- **Mobile Quick-Role Drawer**: Bottom sheet drawer accessible directly from the mobile header.
- **Touch-Accurate Signature Canvas**: High-DPI coordinate scaling (`canvas.width / rect.width`) eliminating stylus/finger drift.

---

## 🛠️ Technology Stack

- **Framework**: [React 19](https://react.dev/) + [Vite 8](https://vite.dev/)
- **Language**: TypeScript
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Offline & PWA**: [Vite PWA Plugin](https://vite-pwa-org.netlify.app/) (Workbox Service Worker)
- **Audio**: Web Speech API (`SpeechSynthesisUtterance`)

---

## 🚀 Getting Started Locally

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- `npm` or `bun`

### Installation & Launch

```bash
# Clone the repository
git clone https://github.com/DrVenom69/vanguard-digital-leagal-aid.git
cd vanguard-digital-leagal-aid

# Install dependencies
npm install --legacy-peer-deps

# Start development server
npm run dev

# Build for production
npm run build
```

---

## ⚖️ Legal & Governance Compliance

- Supports **National Legal Aid Services Organization (NLASO)** statutory mandates.
- Toll-free government legal aid hotline: **16430**.
- Proxy caller identity isolation protects whistleblowers and vulnerable domestic abuse victims.
