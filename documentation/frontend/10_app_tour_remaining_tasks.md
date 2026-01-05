# App Tour - Remaining Tasks & Improvements

**Created**: 2026-01-05
**Status**: 🚧 **IN PROGRESS**
**Related**: [09_app_tour_onboarding_plan.md](09_app_tour_onboarding_plan.md)

---

## Current Status

### ✅ Completed
- [x] AppTour component with spotlight overlay
- [x] 10-step tour content (all 5 languages)
- [x] Login page language selector (already existed)
- [x] Tour trigger logic (shows once per language per user)
- [x] Tour state management (tourCompleted field)
- [x] Skip/Complete functionality
- [x] Tour management scripts (check status, reset all)
- [x] Dark overlay for center steps (welcome/final)
- [x] Progress indicator
- [x] Multi-language translations

### 🚧 In Progress / Issues Found
- [ ] Tooltip positioning still covers bottom navigation
- [ ] Missing data-tour-id attributes on FeedView sections
- [ ] No auto-scroll to target elements
- [ ] No auto-tab-switch for cross-tab elements
- [ ] Highlight border not showing for center positions

---

## Critical Issues to Fix

### Issue 1: Tooltip Covers Bottom Navigation

**Problem**: When highlighting bottom nav tabs, tooltip appears above but still partially covers the tabs.

**Current Behavior**:
```
┌────────────────────┐
│   Tooltip Here     │ ← Covers tabs
│   [BACK] [NEXT]    │
├────────────────────┤
│ FEED│SENSE│STANCE  │ ← Target (partially covered)
└────────────────────┘
```

**Desired Behavior**:
```
┌────────────────────┐
│   Tooltip Here     │ ← Well above tabs
│   [BACK] [NEXT]    │
└────────────────────┘
       ↓ (clear space)
┌────────────────────┐
│ FEED│SENSE│STANCE  │ ← Target (fully visible)
└────────────────────┘
```

**Solution**:
```typescript
// In getTooltipStyle(), for bottom nav elements:
case 'top':
  // Check if element is in bottom 20% of screen (likely bottom nav)
  if (highlightRect.bottom > window.innerHeight * 0.8) {
    // Position tooltip well above, ensure minimum clearance
    top = Math.min(
      highlightRect.top - tooltipHeight - 60,  // 60px clearance
      window.innerHeight * 0.4  // Max: middle of screen
    );
  }
```

**File**: `components/ui/AppTour.tsx`, line 100-110

---

### Issue 2: Missing data-tour-id Attributes

**Problem**: Market Alignment and Company Rankings sections have no data-tour-id, so tour can't highlight them.

**Current Code** (FeedView.tsx):
```tsx
// Market stocks section - NO data-tour-id
<div className="...">
  <h3>VALUES MARKET ALIGNMENT</h3>
  {/* market stocks */}
</div>

// Company rankings - NO data-tour-id
<ValuesCompanyRanking onRankingsChange={handleRankingsChange} />
```

**Solution**:
```tsx
// Add data-tour-id to market section
<div className="..." data-tour-id="market-stocks">
  <h3>VALUES MARKET ALIGNMENT</h3>
  {/* market stocks */}
</div>

// Add data-tour-id to rankings component
<ValuesCompanyRanking
  data-tour-id="company-rankings"
  onRankingsChange={handleRankingsChange}
/>
```

**Files to Modify**:
- `components/views/FeedView.tsx` (add data-tour-id to sections)
- `components/ui/ValuesCompanyRanking.tsx` (accept and apply data-tour-id prop)

---

### Issue 3: No Auto-Scroll to Target Elements

**Problem**: If market-stocks or company-rankings sections are below the fold, user won't see them being highlighted.

**Solution**: Add scrollIntoView when step changes

```typescript
// In AppTour.tsx useEffect
useEffect(() => {
  if (!isOpen || steps.length === 0) return;

  const updateHighlight = () => {
    const step = steps[currentStep];
    if (!step) return;

    let targetElement = document.querySelector(`[data-tour-id="${step.target}"]`);
    if (!targetElement) {
      targetElement = document.querySelector(step.target);
    }

    if (targetElement) {
      // Scroll element into view
      targetElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center'
      });

      // Wait for scroll to complete, then update rect
      setTimeout(() => {
        const rect = targetElement.getBoundingClientRect();
        setHighlightRect(rect);
      }, 300); // Wait for smooth scroll
    } else {
      setHighlightRect(null);
    }
  };

  updateHighlight();
}, [currentStep, steps, isOpen]);
```

**File**: `components/ui/AppTour.tsx`, line 24-62

---

### Issue 4: No Auto-Tab-Switch for Coordinates

**Problem**: "Political Coordinates" step (step 7) expects coordinates chart to be visible, but user is still on Feed tab.

**Current Flow**:
1. Step 1-4: Feed tab (✅ correct)
2. Step 5: Sense tab (needs switch)
3. Step 6: Stance tab (needs switch)
4. Step 7: Coordinates chart (user still on Feed! ❌)
5. Step 8: Union tab (needs switch)

**Solution**: Add tab switching logic to tour steps

**Option A: Add `action` field to TourStep**
```typescript
export interface TourStep {
  id: string;
  target: string;
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  action?: {
    type: 'switchTab';
    tab: ViewState;
  };
}

// Example:
{
  id: 'sense-tab',
  target: 'sense-tab',
  title: 'Sense Tab',
  description: '...',
  position: 'top',
  action: {
    type: 'switchTab',
    tab: ViewState.SENSE
  }
}
```

**Option B: Pass setView callback to AppTour**
```tsx
// In App.tsx
<AppTour
  steps={getTourSteps(language)}
  isOpen={showTour}
  onComplete={handleTourComplete}
  onSkip={handleTourSkip}
  onSwitchTab={(tab) => setView(tab)}  // NEW
/>

// In AppTour.tsx
useEffect(() => {
  // If step has a required tab, switch to it
  const step = steps[currentStep];
  if (step.requiredTab && onSwitchTab) {
    onSwitchTab(step.requiredTab);
  }
}, [currentStep]);
```

**Recommended**: Option B (simpler)

**Files to Modify**:
- `components/ui/AppTour.tsx` - Accept onSwitchTab prop
- `App.tsx` - Pass setView as onSwitchTab
- `data/tourSteps.ts` - Add requiredTab field to relevant steps

---

## Proposed Tour Flow with Tab Switching

### Revised 10-Step Flow

| Step | Tab | Target | Title | Auto-Switch? |
|------|-----|--------|-------|--------------|
| 1 | N/A | body | Welcome | No (center) |
| 2 | FEED | feed-tab | Feed Tab | **Yes → FEED** |
| 3 | FEED | market-stocks | Market Alignment | No (same tab) |
| 4 | FEED | company-rankings | Company Rankings | No (same tab) |
| 5 | SENSE | sense-tab | Sense Tab | **Yes → SENSE** |
| 6 | STANCE | stance-tab | Stance Tab | **Yes → STANCE** |
| 7 | STANCE | coordinates-chart | Political Coordinates | No (same tab) |
| 8 | UNION | union-tab | Union Tab | **Yes → UNION** |
| 9 | N/A | menu-button | Menu | **Yes → FEED** (reset) |
| 10 | N/A | body | Final Welcome | No (center) |

**Implementation**:
```typescript
// tourSteps.ts
{
  id: 'sense-tab',
  target: 'sense-tab',
  title: 'Sense Tab',
  description: '...',
  position: 'top',
  requiredTab: ViewState.SENSE  // NEW
}
```

---

## Code Changes Required

### 1. AppTour.tsx

**Add auto-scroll**:
```typescript
// Line 24-62, in useEffect
targetElement.scrollIntoView({
  behavior: 'smooth',
  block: 'center'
});
```

**Add tab switching**:
```typescript
interface AppTourProps {
  // ... existing props
  onSwitchTab?: (tab: ViewState) => void; // NEW
}

// In useEffect
if (step.requiredTab && onSwitchTab) {
  onSwitchTab(step.requiredTab);
}
```

**Improve tooltip positioning for bottom nav**:
```typescript
// Better detection and positioning
if (highlightRect.bottom > window.innerHeight * 0.8) {
  // This is bottom nav, position tooltip much higher
  top = window.innerHeight * 0.3;
}
```

### 2. App.tsx

**Pass setView callback**:
```tsx
<AppTour
  steps={getTourSteps(language)}
  isOpen={showTour}
  onComplete={handleTourComplete}
  onSkip={handleTourSkip}
  onSwitchTab={setView}  // NEW
/>
```

### 3. tourSteps.ts

**Add requiredTab to TourStep interface**:
```typescript
export interface TourStep {
  id: string;
  target: string;
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  requiredTab?: ViewState;  // NEW
}
```

**Update steps with requiredTab**:
```typescript
{
  id: 'feed-tab',
  target: 'feed-tab',
  title: 'Feed Tab',
  description: '...',
  position: 'top',
  requiredTab: ViewState.FEED
},
{
  id: 'market-stocks',
  target: 'market-stocks',
  title: 'Market Alignment',
  description: '...',
  position: 'top',
  requiredTab: ViewState.FEED  // Stay on FEED
},
{
  id: 'sense-tab',
  target: 'sense-tab',
  title: 'Sense Tab',
  description: '...',
  position: 'top',
  requiredTab: ViewState.SENSE  // Switch to SENSE
}
```

### 4. FeedView.tsx

**Add data-tour-id attributes**:
```tsx
// Find market stocks section (around line 150-200)
<div className="..." data-tour-id="market-stocks">
  <div className="flex items-center justify-between mb-3">
    <h3>VALUES MARKET ALIGNMENT</h3>
    {/* ... */}
  </div>
</div>

// Find ValuesCompanyRanking component (around line 250-300)
<div data-tour-id="company-rankings">
  <ValuesCompanyRanking onRankingsChange={handleRankingsChange} />
</div>
```

### 5. FingerprintView.tsx

**Add data-tour-id to coordinates chart**:
```tsx
// Find coordinates visualization (around line 350-400)
<div className="..." data-tour-id="coordinates-chart">
  {/* Political coordinates chart */}
</div>
```

---

## Estimated Time to Complete

| Task | Effort | Priority |
|------|--------|----------|
| Fix tooltip positioning | 30 min | High |
| Add data-tour-id attributes | 30 min | High |
| Implement auto-scroll | 45 min | High |
| Implement tab switching | 1 hour | High |
| Test all scenarios | 1 hour | High |
| **Total** | **3.5 hours** | |

---

## Testing Checklist

After completing above changes:

- [ ] Welcome step shows dark overlay (no highlight)
- [ ] Feed tab highlighted correctly (not covered by tooltip)
- [ ] Market section highlighted correctly (auto-scrolls if needed)
- [ ] Company rankings highlighted correctly (auto-scrolls if needed)
- [ ] Sense tab highlighted correctly (auto-switches tab)
- [ ] Stance tab highlighted correctly (auto-switches tab)
- [ ] Coordinates chart highlighted correctly (auto-switches tab + scrolls)
- [ ] Union tab highlighted correctly (auto-switches tab)
- [ ] Menu highlighted correctly
- [ ] Final step shows dark overlay (no highlight)
- [ ] All 5 languages work correctly
- [ ] Tour completion saves to Firebase
- [ ] Second login in same language skips tour
- [ ] Second login in different language shows tour

---

## Session Summary (2026-01-05)

### Completed Today

**Major Features**:
1. ✅ Reset All Settings system (complete)
2. ✅ Social Media Firebase integration (main doc + history)
3. ✅ Dual StanceType system (AI labels + canonical types)
4. ✅ App Tour/Walkthrough (90% complete)
5. ✅ UI improvements (buttons, translations)
6. ✅ Comprehensive error handling

**Git Commits**: 17
**Deployments**: 15
**New Documentation**: 3
**New Scripts**: 5
**Code Added**: +3,500 lines

### Remaining for App Tour

**High Priority** (Next Session):
1. Fix tooltip positioning to avoid covering targets
2. Add data-tour-id to FeedView sections
3. Implement auto-scroll to targets
4. Implement auto-tab-switch

**Medium Priority**:
1. Add "Replay Tour" button in Settings
2. Improve animations/transitions
3. Add keyboard navigation (arrow keys)

**Low Priority**:
1. Tour analytics tracking
2. Conditional steps based on user state
3. Interactive elements (require clicks)

---

## Quick Start for Next Session

**To resume App Tour development**:

1. **Review current issues** (this document)

2. **Start with high-priority fixes**:
   ```bash
   # Open key files
   code components/ui/AppTour.tsx
   code components/views/FeedView.tsx
   code data/tourSteps.ts
   ```

3. **Test tour status**:
   ```bash
   npx tsx scripts/maintenance/check-tour-status.ts
   ```

4. **Reset tours for testing**:
   ```bash
   npx tsx scripts/maintenance/reset-all-tours.ts
   ```

5. **Test in browser**:
   - Logout
   - Login with different language
   - Verify tour shows and works correctly

---

## Notes

- The core tour infrastructure is solid and working
- Main issues are UX polish (positioning, scrolling, tab switching)
- All language content is complete and ready
- Tour state management is fully implemented
- ~3.5 hours of focused work needed to complete remaining tasks

**The tour is functional but needs UX improvements before production-ready.**

---

**Next session goal**: Complete all High Priority items to make tour production-ready.
