# 🏋️ FitForge — AI-Powered Fitness Coach

> Precision training. Exact nutrition. Built for your body.

A fully client-side mobile fitness app UI inspired by Notion's clean design system. No backend, no install — just open `index.html` in a browser.

![FitForge Preview](https://opengraph.githubassets.com/a7a5ef57ad9a62aa30322f397b05333231939e0be32c405ca1caf82c16f7548f/vshukla0x/fit-forge-)

---

## ✨ Features

### 🔐 Onboarding & Login
- Continue with **Google** or **WhatsApp** (simulated auth with loading state)
- Enter your name → personalized greeting: *"Good Morning, Vivek 👋"*
- 3-step onboarding: **Height · Weight · Body Fat %** (via visual reference chart)
- Goal selection: Bulk / Cut / Recomp / Maintain

### 🏠 Home Dashboard
- Daily calorie ring (donut chart) with consumed vs. target
- Macro bars with **upper & lower limits** (protein / carbs / fat / water)
- Hydration tracker with quick-add buttons (+250ml, +500ml)
- Today's workout card with estimated volume & calories

### 🏋️ Workout Tracker
- Personalized workout plan (Push / Pull / Legs split)
- **Tap any set** → marks it done + triggers live **rest timer** with circular countdown
- Skip or add +30s to rest
- **Workout Active Bar** stays visible across all tabs while training
- **Post-workout summary**: duration, sets, total volume (kg), calories burned
- YouTube form-guide videos embedded for every exercise

### 🍎 Nutrition Engine
- **TDEE calculation** using Mifflin-St Jeor BMR + activity multiplier
- Search & log from a **30-food database** (real macros per 100g)
- **8 micronutrients** tracked live: Vit C, Vit D, Calcium, Iron, Magnesium, Zinc, Potassium, B12
- Color-coded status: 🟢 Met / 🟡 Close / 🔴 Low
- All data resets at midnight automatically

### 📈 Progress Tracking
- Log daily weight → **Canvas line chart** (last 14 entries, bezier curves)
- Body stats: BMI, Lean Mass, Body Fat %
- Personal records board
- Activity heatmap (workout sessions per day)

### 🤖 AI Coach
- Context-aware advice referencing your **actual data** (protein gap, calorie balance, weight trend)
- Goal-specific suggestions (bulk / cut / recomp)
- Smart messaging based on time of day and workout state

### 💡 UI/UX
- **Dark & Light** theme toggle (persisted)
- Swipe navigation between screens
- Keyboard shortcuts (1–6 for tabs, T for theme, Esc for modals)
- Fully responsive mobile-first design (390px phone frame)

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Structure | HTML5 |
| Styling | CSS3 (Custom Properties, CSS Grid, Flexbox) |
| Logic | Vanilla JavaScript (ES6+) |
| Storage | `localStorage` |
| Charts | HTML5 Canvas API |
| Video | YouTube iFrame API |
| Fonts | Inter (Google Fonts) |

No frameworks. No dependencies. No build step.

---

## 🚀 Run Locally

```bash
git clone https://github.com/vshukla0x/fit-forge-.git
cd fit-forge-
# Open index.html in Chrome or Edge
start index.html
```

Or just drag `index.html` into your browser.

---

## 📁 File Structure

```
fit-forge-/
├── index.html      # All UI screens & modals
├── style.css       # Design system + component styles (~2600 lines)
├── app.js          # All logic: state, calculations, rendering
└── README.md
```

---

## 📸 Screens

| Screen | Description |
|--------|-------------|
| Login | Google/WhatsApp auth with name input |
| Onboarding | Height, weight, body fat selection |
| Home | Dashboard with macros, hydration, today's workout |
| Workout | Exercise list with live set tracking & rest timer |
| Nutrition | Food log, macros, micronutrients, meal plan |
| Progress | Weight chart, PRs, activity heatmap |
| Learn | Macro & micronutrient education with YouTube guides |
| AI Coach | Context-aware chat interface |

---

## 🤝 Related Projects

### [O.A.S.I.S — SIH 2026](https://github.com/ThunderKhan/oasis)
> Oncology Assessment & Screening Information System

Built with my team at **Smart India Hackathon 2026**. An explainable clinician-facing prototype for cancer screening and referral prioritisation across oral, breast, and cervical cancer pathways.

- Combines red-flag safety rules, screening eligibility, and explainable referral-priority recommendations
- Keeps Screening Priority Index distinct from cancer probability
- Built with **Next.js · TypeScript · FastAPI · Pydantic · SQLModel · scikit-learn**

---

## 📄 License

MIT — free to use, modify, and learn from.

---

*Created by [@vshukla0x](https://github.com/vshukla0x)*
