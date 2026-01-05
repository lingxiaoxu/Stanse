# App Tour/Onboarding Walkthrough - Implementation Plan

**Created**: 2026-01-05
**Status**: 📋 **PLANNED** (Not Yet Implemented)
**Priority**: Medium
**Estimated Effort**: 4-6 hours

---

## Overview

Implement an interactive app tour/walkthrough system for first-time users that:
1. Shows spotlight on key UI elements
2. Provides contextual explanations
3. Supports all 5 languages
4. Triggers once per user per language
5. Can be skipped or replayed

---

## User Experience Flow

### 1. Login Page Enhancement

**Current**:
```
┌──────────────────────┐
│   STANSE LOGIN       │
│                      │
│   Email: _______     │
│   Password: ___      │
│   [LOGIN] [SIGN UP]  │
│   [Google Login]     │
└──────────────────────┘
```

**Enhanced**:
```
┌──────────────────────┐
│   STANSE LOGIN       │
│                      │
│   🌍 Language:       │
│   [EN] [中文] [日本語]│
│   [FR] [ES]          │  ← NEW: Language selector
│                      │
│   Email: _______     │
│   Password: ___      │
│   [LOGIN] [SIGN UP]  │
│   [Google Login]     │
└──────────────────────┘
```

**Behavior**:
- User selects language on login page
- On successful login → setLanguage(selectedLanguage)
- Check if user has seen tour in this language
- If not → trigger tour
- If yes → skip to main app

---

### 2. Tour Trigger Logic

**Firebase Storage** (`users/{userId}`):
```typescript
{
  ...existing fields,
  tourCompleted: {
    EN: true,
    ZH: false,    // Not seen in Chinese yet
    JA: false,
    FR: true,     // Already seen in French
    ES: false
  }
}
```

**Logic**:
```typescript
// After login
const currentLang = language; // e.g., "ZH"
const hasSeenTour = userProfile?.tourCompleted?.[currentLang] || false;

if (!hasSeenTour) {
  // Show tour
  setShowTour(true);
} else {
  // Skip to main app
  navigateToFeed();
}

// After tour completes
await updateDoc(userRef, {
  [`tourCompleted.${currentLang}`]: true
});
```

---

### 3. Tour Steps Definition

**7-8 Steps Covering Main Features**:

```typescript
const TOUR_STEPS: Record<Language, TourStep[]> = {
  EN: [
    {
      id: 'welcome',
      target: 'body',
      title: 'Welcome to Stanse!',
      description: 'AI-powered political & economic alignment app with blockchain-based impact tracking.',
      position: 'center'
    },
    {
      id: 'feed-tab',
      target: '[data-tab="feed"]',
      title: 'Feed Tab',
      description: 'Personalized news curated for your political stance. See what matters to you.',
      position: 'bottom'
    },
    {
      id: 'sense-tab',
      target: '[data-tab="sense"]',
      title: 'Sense Tab',
      description: 'Scan brands and companies to check their alignment with your values.',
      position: 'bottom'
    },
    {
      id: 'stance-tab',
      target: '[data-tab="stance"]',
      title: 'Stance Tab',
      description: 'Your political fingerprint. See your coordinates and persona label.',
      position: 'bottom'
    },
    {
      id: 'union-tab',
      target: '[data-tab="union"]',
      title: 'Union Tab',
      description: 'Track your collective impact through Polis Protocol blockchain.',
      position: 'bottom'
    },
    {
      id: 'menu',
      target: '[data-menu-button]',
      title: 'Menu',
      description: 'Access settings, connect social media, view manifesto, and more.',
      position: 'left'
    },
    {
      id: 'final',
      target: 'body',
      title: 'Welcome to the Future of Political Engagement!',
      description: 'Stanse is an AI-Agentic political & economic central app. Leverage blockchain-verified political influence. Maximize your capital\'s political impact without compromising your identity and privacy.',
      position: 'center'
    }
  ],
  ZH: [
    {
      id: 'welcome',
      target: 'body',
      title: '欢迎来到 Stanse！',
      description: 'AI 驱动的政治经济立场应用，基于区块链的影响力追踪。',
      position: 'center'
    },
    {
      id: 'feed-tab',
      target: '[data-tab="feed"]',
      title: '动态标签',
      description: '根据您的政治立场个性化推荐新闻。查看对您重要的内容。',
      position: 'bottom'
    },
    {
      id: 'sense-tab',
      target: '[data-tab="sense"]',
      title: '感知标签',
      description: '扫描品牌和公司，检查它们与您价值观的一致性。',
      position: 'bottom'
    },
    {
      id: 'stance-tab',
      target: '[data-tab="stance"]',
      title: '立场标签',
      description: '您的政治指纹。查看您的坐标和人格标签。',
      position: 'bottom'
    },
    {
      id: 'union-tab',
      target: '[data-tab="union"]',
      title: '联合标签',
      description: '通过 Polis Protocol 区块链追踪您的集体影响力。',
      position: 'bottom'
    },
    {
      id: 'menu',
      target: '[data-menu-button]',
      title: '菜单',
      description: '访问设置、连接社交媒体、查看宣言等。',
      position: 'left'
    },
    {
      id: 'final',
      target: 'body',
      title: '欢迎来到政治参与的未来！',
      description: 'Stanse 是一个 AI 代理政治经济中心应用。利用区块链验证的政治影响力，在不损害身份和隐私的情况下最大化您资金的政治影响力。',
      position: 'center'
    }
  ]
  // ... JA, FR, ES
};
```

---

## Implementation Tasks

### Phase 1: Login Page Language Selector

**Files to Modify**:
- `components/views/LoginView.tsx`

**Changes**:
1. Add language selector UI (reuse Settings language buttons)
2. Add state: `[selectedLanguage, setSelectedLanguage]`
3. On language click: `setLanguage(selectedLanguage)`
4. Pass selected language to tour system

**UI Position**: Above email/password form

**Estimated Time**: 30 minutes

---

### Phase 2: Tour Component

**New File**: `components/ui/AppTour.tsx`

**Features**:
- Spotlight overlay with SVG mask
- Highlighted element with blue border + pulse
- Tooltip with title + description
- Progress dots indicator
- BACK / NEXT buttons
- Close (X) button to skip
- "Tap anywhere to continue" hint
- Responsive positioning (top/bottom/left/right/center)

**Estimated Time**: 2 hours

---

### Phase 3: Tour Steps Content

**New File**: `data/tourSteps.ts`

**Structure**:
```typescript
export const TOUR_STEPS: Record<Language, TourStep[]> = {
  EN: [...],
  ZH: [...],
  JA: [...],
  FR: [...],
  ES: [...]
};

export interface TourStep {
  id: string;
  target: string; // CSS selector or data-tour-id
  title: string;
  description: string;
  position: 'top' | 'bottom' | 'left' | 'right' | 'center';
}
```

**7 Steps**:
1. Welcome (center)
2. Feed Tab (bottom)
3. Sense Tab (bottom)
4. Stance Tab (bottom)
5. Union Tab (bottom)
6. Menu Button (left)
7. Final Welcome Message (center)

**Estimated Time**: 1.5 hours (translations)

---

### Phase 4: Tour State Management

**Update**: `types.ts`
```typescript
export interface UserProfile {
  // ... existing fields
  tourCompleted?: {
    EN?: boolean;
    ZH?: boolean;
    JA?: boolean;
    FR?: boolean;
    ES?: boolean;
  };
}
```

**New Service Function**: `services/userService.ts`
```typescript
export const markTourCompleted = async (
  userId: string,
  language: Language
): Promise<void> => {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    [`tourCompleted.${language}`]: true,
    updatedAt: serverTimestamp()
  });
};

export const hasSeen TourInLanguage = async (
  userId: string,
  language: Language
): Promise<boolean> => {
  const profile = await getUserProfile(userId);
  return profile?.tourCompleted?.[language] || false;
};
```

**Estimated Time**: 30 minutes

---

### Phase 5: Tour Integration

**Update**: `App.tsx` or main layout

**Logic**:
```typescript
const [showTour, setShowTour] = useState(false);

useEffect(() => {
  // After successful login
  if (user && userProfile) {
    const hasSeenInCurrentLang = userProfile.tourCompleted?.[language] || false;

    if (!hasSeenInCurrentLang) {
      setShowTour(true);
    }
  }
}, [user, userProfile, language]);

const handleTourComplete = async () => {
  if (user) {
    await markTourCompleted(user.uid, language);
    setShowTour(false);
  }
};
```

**Estimated Time**: 1 hour

---

### Phase 6: Add data-tour-id Attributes

**Files to Update**:
- `components/ui/TabBar.tsx` - Add data attributes to tabs
- `components/ui/MenuButton.tsx` - Add data attribute to menu button

**Example**:
```tsx
<button data-tour-id="feed-tab" ...>FEED</button>
<button data-tour-id="sense-tab" ...>SENSE</button>
<button data-tour-id="stance-tab" ...>STANCE</button>
<button data-tour-id="union-tab" ...>UNION</button>
<button data-tour-id="menu-button" ...>☰</button>
```

**Estimated Time**: 30 minutes

---

### Phase 7: Multilingual Tour Content

**Update**: `contexts/LanguageContext.tsx`

**Add Tour Translations**:
```typescript
tour: {
  tap_anywhere: "Tap anywhere to continue",
  skip: "Skip Tour",
  back: "BACK",
  next: "NEXT",
  finish: "FINISH",

  // Step titles & descriptions
  welcome_title: "Welcome to Stanse!",
  welcome_desc: "AI-powered political & economic alignment app...",

  feed_title: "Feed Tab",
  feed_desc: "Personalized news curated for your political stance...",

  // ... more steps

  final_title: "Welcome to the Future!",
  final_desc: "Stanse is an AI-Agentic political & economic central app. Leverage blockchain-verified political influence. Maximize your capital's political impact without compromising your identity and privacy."
}
```

**All 5 Languages**:
- EN, ZH, JA, FR, ES

**Estimated Time**: 1.5 hours

---

## Technical Implementation Details

### AppTour Component Features

#### 1. Spotlight Overlay (SVG Mask)
```tsx
<svg>
  <defs>
    <mask id="tour-mask">
      <rect width="100%" height="100%" fill="white" />
      <rect x={highlight.x} y={highlight.y} fill="black" /> {/* Cutout */}
    </mask>
  </defs>
  <rect fill="rgba(0,0,0,0.7)" mask="url(#tour-mask)" />
</svg>
```

#### 2. Highlight Border
```tsx
<div
  className="absolute border-4 border-blue-500 animate-pulse"
  style={{
    top: highlightRect.top,
    left: highlightRect.left,
    width: highlightRect.width,
    height: highlightRect.height
  }}
/>
```

#### 3. Tooltip Positioning
- Detect viewport boundaries
- Auto-adjust if tooltip would overflow
- Responsive to window resize/scroll

#### 4. Progress Indicator
```tsx
<div className="flex gap-1">
  {steps.map((_, i) => (
    <div className={i === current ? 'bg-black' : 'bg-gray-200'} />
  ))}
</div>
```

---

## User Stories

### Story 1: First-Time User (English)
1. User arrives at login page
2. Sees language selector at top (5 language buttons)
3. Selects **"English"**
4. Enters credentials and logs in (or Google login)
5. **Tour automatically starts** (darkened screen, Feed tab highlighted)
6. Reads "Feed Tab" explanation in **English**
7. Taps screen anywhere → Next step (Sense tab highlighted)
8. Continues through all 7 steps (all in English)
9. Final step shows welcome message in center:
   - "Welcome to the Future of Political Engagement!"
   - "Stanse is an AI-Agentic political & economic central app..."
10. Clicks **FINISH**
11. Tour marked as complete: `tourCompleted.EN = true`
12. App language set to English, can use app normally

**Result in Firebase**:
```json
{
  "tourCompleted": {
    "EN": true,
    "ZH": false,
    "JA": false,
    "FR": false,
    "ES": false
  }
}
```

---

### Story 2: First-Time User (Chinese)
1. User arrives at login page
2. Sees language selector at top
3. Selects **"中文"** (Chinese)
4. Enters credentials and logs in
5. **Tour automatically starts** in Chinese
6. Reads "动态标签" (Feed Tab) explanation in **Chinese**
7. Taps screen → Next step
8. Continues through all 7 steps (all in Chinese)
9. Final step shows Chinese welcome message:
   - "欢迎来到政治参与的未来！"
   - "Stanse 是一个 AI 代理政治经济中心应用..."
10. Clicks **完成** (FINISH in Chinese)
11. Tour marked as complete: `tourCompleted.ZH = true`
12. App language set to Chinese, continues in Chinese

**Result in Firebase**:
```json
{
  "tourCompleted": {
    "EN": false,
    "ZH": true,   ← Completed in Chinese
    "JA": false,
    "FR": false,
    "ES": false
  }
}
```

**Key Difference from Story 1**:
- ✅ User never sees English tour
- ✅ Entire experience is in Chinese from start
- ✅ App remains in Chinese after tour
- ✅ Can still experience tour in other languages later

---

### Story 3: Returning User (New Language)
1. User who **completed EN tour** (tourCompleted.EN = true)
2. Returns to login page
3. Selects **"中文"** this time (wants to try Chinese)
4. Logs in
5. **Tour starts again** (in Chinese!) because ZH tour not completed
6. Goes through Chinese-language tour (all 7 steps)
7. Completes tour
8. Now has completed: **EN ✅, ZH ✅**

**Result in Firebase**:
```json
{
  "tourCompleted": {
    "EN": true,   ← From previous session
    "ZH": true,   ← Just completed
    "JA": false,
    "FR": false,
    "ES": false
  }
}
```

**Use Case**:
- Multilingual users can experience tour in multiple languages
- Helps users learn UI terms in different languages
- Useful for language learners or bilingual users

---

### Story 4: Returning User (Same Language)
1. User who **completed EN tour** (tourCompleted.EN = true)
2. Returns to login page
3. Selects **"English"** again
4. Logs in
5. **Tour does NOT show** (already completed for EN)
6. Goes directly to Feed tab
7. App loads normally in English

**Behavior**:
- ✅ No annoying repeat of tour
- ✅ But user can still replay from Settings if wanted

---

### Story 5: User Switches Language Mid-Session
1. User logged in, completed EN tour
2. Currently using app in English
3. Goes to Settings → Changes language to "中文"
4. **Tour does NOT auto-start** (only triggers on login)
5. User can continue using app in Chinese
6. Next time they log in with Chinese selected:
   - Tour will show (if not yet completed in ZH)

**Design Decision**: Tour only triggers on **login**, not on language change during session. This prevents interrupting active users.

---

### Story 6: New User Skips Tour
1. New user logs in, selects English
2. Tour starts
3. After Step 2, user clicks **X** (close button)
4. Tour closes immediately
5. `tourCompleted.EN = true` (marked as seen, won't auto-show again)
6. User can use app
7. User can replay tour from Settings → "Replay Tour" button

**Behavior**:
- ✅ Respects user's choice to skip
- ✅ Doesn't repeatedly interrupt
- ✅ Still accessible via Settings

---

## Database Schema

### users/{userId}

**New Field**: `tourCompleted`

```typescript
{
  id: "userId",
  email: "user@example.com",

  // ... existing fields

  tourCompleted: {
    EN: true,
    ZH: false,
    JA: false,
    FR: false,
    ES: false
  },

  tourLastShownAt: {
    EN: "2026-01-05T10:00:00Z",
    ZH: null,
    JA: null,
    FR: null,
    ES: null
  }
}
```

---

## Tour Steps Content (All Languages)

### Step 1: Welcome
**Position**: Center
**Target**: body

| Language | Title | Description |
|----------|-------|-------------|
| EN | "Welcome to Stanse!" | "AI-powered political & economic alignment app with blockchain-based impact tracking." |
| ZH | "欢迎来到 Stanse！" | "AI 驱动的政治经济立场应用，基于区块链的影响力追踪。" |
| JA | "Stanse へようこそ！" | "AI 駆動の政治経済アライメントアプリ、ブロックチェーンベースの影響追跡。" |
| FR | "Bienvenue sur Stanse !" | "Application d'alignement politique et économique alimentée par l'IA avec suivi d'impact blockchain." |
| ES | "¡Bienvenido a Stanse!" | "Aplicación de alineación política y económica impulsada por IA con seguimiento de impacto blockchain." |

### Step 2: Feed Tab
**Position**: Bottom
**Target**: [data-tour-id="feed-tab"]

| Language | Title | Description |
|----------|-------|-------------|
| EN | "Feed Tab" | "Personalized news curated for your political stance. See what matters to you." |
| ZH | "动态标签" | "根据您的政治立场个性化推荐新闻。查看对您重要的内容。" |
| JA | "フィードタブ" | "政治的立場に合わせてキュレーションされたパーソナライズされたニュース。" |
| FR | "Onglet Flux" | "Actualités personnalisées selon votre position politique. Voyez ce qui compte pour vous." |
| ES | "Pestaña Feed" | "Noticias personalizadas según su postura política. Vea lo que importa para usted." |

### Step 3: Sense Tab
**Position**: Bottom
**Target**: [data-tour-id="sense-tab"]

| Language | Title | Description |
|----------|-------|-------------|
| EN | "Sense Tab" | "Scan brands and companies to check their alignment with your values." |
| ZH | "感知标签" | "扫描品牌和公司，检查它们与您价值观的一致性。" |
| JA | "センスタブ" | "ブランドや企業をスキャンして、あなたの価値観との整合性を確認。" |
| FR | "Onglet Sense" | "Scannez les marques et entreprises pour vérifier leur alignement avec vos valeurs." |
| ES | "Pestaña Sense" | "Escanee marcas y empresas para verificar su alineación con sus valores." |

### Step 4: Stance Tab
**Position**: Bottom
**Target**: [data-tour-id="stance-tab"]

| Language | Title | Description |
|----------|-------|-------------|
| EN | "Stance Tab" | "Your political fingerprint. See your coordinates and persona label." |
| ZH | "立场标签" | "您的政治指纹。查看您的坐标和人格标签。" |
| JA | "スタンスタブ" | "あなたの政治的指紋。座標とペルソナラベルを確認。" |
| FR | "Onglet Position" | "Votre empreinte politique. Voyez vos coordonnées et votre persona." |
| ES | "Pestaña Postura" | "Su huella política. Vea sus coordenadas y etiqueta de persona." |

### Step 5: Union Tab
**Position**: Bottom
**Target**: [data-tour-id="union-tab"]

| Language | Title | Description |
|----------|-------|-------------|
| EN | "Union Tab" | "Track your collective impact through Polis Protocol blockchain." |
| ZH | "联合标签" | "通过 Polis Protocol 区块链追踪您的集体影响力。" |
| JA | "ユニオンタブ" | "Polis Protocol ブロックチェーンを通じて集団的影響を追跡。" |
| FR | "Onglet Union" | "Suivez votre impact collectif via la blockchain Polis Protocol." |
| ES | "Pestaña Unión" | "Rastree su impacto colectivo a través de blockchain Polis Protocol." |

### Step 6: Menu
**Position**: Left
**Target**: [data-tour-id="menu-button"]

| Language | Title | Description |
|----------|-------|-------------|
| EN | "Menu" | "Access settings, connect social media, view manifesto, and manage your account." |
| ZH | "菜单" | "访问设置、连接社交媒体、查看宣言和管理您的账户。" |
| JA | "メニュー" | "設定へのアクセス、ソーシャルメディアの接続、マニフェストの表示、アカウント管理。" |
| FR | "Menu" | "Accédez aux paramètres, connectez les réseaux sociaux, consultez le manifeste, gérez votre compte." |
| ES | "Menú" | "Acceda a configuración, conecte redes sociales, vea el manifiesto, gestione su cuenta." |

### Step 7: Final Welcome
**Position**: Center
**Target**: body

| Language | Title | Description |
|----------|-------|-------------|
| EN | "Welcome to Political Engagement!" | "Stanse is an AI-Agentic political & economic central app. Leverage blockchain-verified political influence. Maximize your capital's impact without compromising privacy." |
| ZH | "欢迎来到政治参与的未来！" | "Stanse 是一个 AI 代理政治经济中心应用。利用区块链验证的政治影响力，在不损害隐私的情况下最大化您资金的影响力。" |
| JA | "政治参加の未来へようこそ！" | "Stanse は AI エージェント型の政治経済中央アプリです。ブロックチェーン検証済みの政治的影響力を活用。プライバシーを損なうことなく資本の影響を最大化。" |
| FR | "Bienvenue dans l'Avenir Politique !" | "Stanse est une application centrale politique et économique pilotée par l'IA. Tirez parti de l'influence politique vérifiée par blockchain. Maximisez l'impact de votre capital sans compromettre la vie privée." |
| ES | "¡Bienvenido al Futuro Político!" | "Stanse es una aplicación central política y económica impulsada por IA. Aproveche la influencia política verificada por blockchain. Maximice el impacto de su capital sin comprometer la privacidad." |

---

## CSS/Styling

### Overlay Styles
```css
/* Dark overlay */
.tour-overlay {
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(2px);
}

/* Highlight border */
.tour-highlight {
  border: 4px solid #3b82f6;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.3),
              0 0 20px rgba(59, 130, 246, 0.5);
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

/* Tooltip */
.tour-tooltip {
  background: white;
  border: 4px solid black;
  box-shadow: 8px 8px 0 rgba(0, 0, 0, 0.2); /* Pixel shadow */
}
```

---

## Edge Cases & Considerations

### 1. Tour Replay Option
Add "Replay Tour" button in Settings:
```tsx
<button onClick={() => setShowTour(true)}>
  {t('settings', 'replay_tour')}
</button>
```

### 2. Skip Tour
- X button in top-right
- Marks tour as completed (so it doesn't show again)
- User can replay from Settings

### 3. Responsive Behavior
- Tour adapts to mobile/tablet/desktop
- Tooltip repositions if would go off-screen
- Handles viewport changes during tour

### 4. Accessibility
- Keyboard navigation (Arrow keys for next/prev)
- ESC to close
- Focus trap within tour
- Screen reader announcements

---

## Testing Plan

### Test Cases

1. **First-time user, English**
   - [ ] Language selector appears on login
   - [ ] Select EN, login
   - [ ] Tour starts automatically
   - [ ] All 7 steps show correctly
   - [ ] Tap anywhere advances step
   - [ ] FINISH button completes tour
   - [ ] tourCompleted.EN = true in Firebase

2. **First-time user, Chinese**
   - [ ] Select ZH on login
   - [ ] Tour shows in Chinese
   - [ ] All text is Chinese
   - [ ] Final message in Chinese

3. **Returning user, same language**
   - [ ] User with EN tour completed
   - [ ] Selects EN, logs in
   - [ ] Tour does NOT show
   - [ ] Goes directly to app

4. **Returning user, different language**
   - [ ] User with EN tour completed
   - [ ] Selects ZH, logs in
   - [ ] Tour shows in Chinese (not seen in ZH yet)
   - [ ] After completion: EN ✅, ZH ✅

5. **Skip tour**
   - [ ] Click X button during tour
   - [ ] Tour closes
   - [ ] tourCompleted.[lang] = true
   - [ ] Doesn't show again

6. **Replay tour**
   - [ ] Go to Settings
   - [ ] Click "Replay Tour"
   - [ ] Tour starts from step 1
   - [ ] In current language

---

## Migration for Existing Users

### Script: `scripts/maintenance/add-tour-field.ts`

```typescript
// Add tourCompleted field to all existing users
// Default: all languages = false (so they can experience tour)

const usersRef = db.collection('users');
const snapshot = await usersRef.get();

for (const doc of snapshot.docs) {
  await doc.ref.update({
    tourCompleted: {
      EN: false,
      ZH: false,
      JA: false,
      FR: false,
      ES: false
    }
  });
}
```

**Decision**: Should existing users see the tour?
- **Option A**: Default all to `false` (everyone sees tour once per language)
- **Option B**: Default all to `true` (only new users see tour)
- **Recommended**: Option A (good for re-engagement)

---

## Future Enhancements

### 1. Contextual Tours
- Tour for new features (when added)
- "What's New" tour for updates
- Advanced features tour

### 2. Interactive Elements
- User must click specific button to proceed
- Quiz questions during tour
- Gamification (earn points for completing tour)

### 3. Analytics
- Track which step users skip at
- A/B test different tour flows
- Measure tour completion rate

### 4. Conditional Steps
- Show different steps based on user type
- Skip steps for features user already used
- Personalized tour based on persona

---

## Files to Create/Modify

### New Files
1. `components/ui/AppTour.tsx` - Main tour component
2. `data/tourSteps.ts` - Tour content (all languages)
3. `scripts/maintenance/add-tour-field.ts` - Migration script
4. `hooks/useTour.ts` - Tour state management hook

### Modified Files
1. `components/views/LoginView.tsx` - Add language selector
2. `contexts/LanguageContext.tsx` - Add tour translations
3. `types.ts` - Add tourCompleted to UserProfile
4. `services/userService.ts` - Add tour tracking functions
5. `App.tsx` - Integrate tour trigger
6. `components/ui/TabBar.tsx` - Add data-tour-id attributes
7. `components/ui/MenuButton.tsx` - Add data-tour-id attribute
8. `components/views/SettingsView.tsx` - Add "Replay Tour" option

**Total**: 12 files (4 new, 8 modified)

---

## Implementation Priority

### Must Have (MVP)
- [x] Login page language selector
- [x] Basic AppTour component (spotlight + tooltip)
- [x] 7 tour steps (English only for MVP)
- [x] Tour trigger logic (once per user)
- [x] Skip/Complete functionality

### Should Have (Full Feature)
- [ ] All 5 languages
- [ ] Replay tour option
- [ ] Responsive positioning
- [ ] Keyboard navigation

### Nice to Have (Future)
- [ ] Animations/transitions
- [ ] Interactive elements
- [ ] Analytics tracking
- [ ] Conditional steps

---

## Estimated Timeline

| Phase | Task | Time |
|-------|------|------|
| 1 | Login language selector | 30 min |
| 2 | AppTour component | 2 hours |
| 3 | Tour steps content | 1.5 hours |
| 4 | State management | 30 min |
| 5 | Integration | 1 hour |
| 6 | Data attributes | 30 min |
| 7 | Translations | 1.5 hours |
| **Total** | **Full Implementation** | **~6 hours** |

MVP (English only): **~3 hours**

---

## Benefits

### User Experience
✅ Reduces confusion for new users
✅ Highlights key features
✅ Multi-language support (inclusive)
✅ Non-intrusive (can skip)
✅ Repeatable (from Settings)

### Engagement
✅ Increases feature discovery
✅ Improves retention
✅ Reduces support questions
✅ Professional onboarding experience

### Technical
✅ Reusable component
✅ Easy to add new tour steps
✅ Language-aware
✅ Firebase-backed state

---

## Next Steps

**Option A: Implement Now**
- Start with Phase 1 (Login language selector)
- Build out full tour system
- Deploy and test

**Option B: Implement Later**
- Document complete plan (this doc) ✅ **DONE**
- Prioritize against other features
- Implement in next sprint

**Recommendation**:
Given the complexity and time already invested today (12 commits, major refactors), I recommend **Option B** - implement in a future session when you can dedicate 3-6 hours focused time.

This plan is comprehensive and ready to execute when you decide!

---

**This feature would significantly improve first-time user experience and highlight all the powerful features Stanse offers.**
