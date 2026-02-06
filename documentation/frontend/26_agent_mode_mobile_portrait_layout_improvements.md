# Agent Mode Mobile Portrait Layout Improvements
**Date**: 2026-01-30
**Status**: Planned (Not Yet Implemented)

## Current Issues (Based on User Screenshots)

### Issue 1: Input + CostTracker Position on Mobile Portrait
**Problem**: In mobile portrait mode, the input box and cost tracker are sandwiched between chat messages and code/preview panel. They should be at the absolute bottom of the entire AI Chat Assistant.

**Required Fix**:
- **Condition**: ONLY when `width < 768px AND height > width` (mobile portrait)
- **Layout Order** (top to bottom):
  1. Header (mode selector, controls)
  2. Chat Messages Panel (scrollable)
  3. Divider (horizontal)
  4. Code/Preview Panel (scrollable)
  5. **CostTracker + Input (fixed at bottom)** ← MUST be here
- **Desktop/Landscape**: No change, keep current layout

**Implementation Notes**:
- Need to restructure `AgentModeChat.tsx` layout
- Extract CostTracker and Input from Chat Panel `<div>`
- Conditionally render them inside Chat Panel (desktop) or at root level (mobile portrait)
- Use strict condition: `isMobilePortrait && generatedCode`

---

### Issue 2: Chat Messages Panel Lacks Scroll
**Problem**: Chat messages panel doesn't have scrolling in mobile portrait mode, can't see all messages.

**Required Fix**:
- Add `overflow-y-auto` to messages container
- Ensure `flex-1` and proper height constraints
- File: `AgentModeChat.tsx` line ~710

**Current Code**:
```tsx
<div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
```

**Needs**:
- Verify `max-height` is set correctly in mobile portrait
- Test scrolling works on iPhone

---

### Issue 3: Code/Preview Panel Lacks Scroll
**Problem**: Code/Preview panel doesn't have scrolling in mobile portrait mode, can't see all code.

**Required Fix**:
- Ensure `CodeView` and `PreviewView` components support scrolling
- Check `AgentCodePanel.tsx` has proper overflow handling
- File: `components/ai-chat/CodeView.tsx`, `PreviewView.tsx`

**Verification**:
- Check if these components already have `overflow-y-auto`
- If not, add it with proper height constraints

---

### Issue 4: Settings Payment Method Dropdown Scroll (All Mobile Screens)
**Problem**: When "支付方式" (Payment Method) dropdown is opened in Settings → Manage Subscription, the content is too long and can't scroll. Can't fill in card info.

**Required Fix**:
- **Condition**: ANY mobile screen (width < 768px), both portrait and landscape
- **Target**: Payment method dropdown content area (NOT the entire Manage Subscription modal)
- Add `overflow-y-auto` with `max-height` to payment dropdown content
- Scrollbar can be hidden (auto-hide), but scrolling must work

**Files to Check**:
- Settings component (likely in `/components/settings/` or `/pages/settings/`)
- Look for "Manage Subscription" or "支付方式" components
- Search for payment-related forms

---

## Implementation Plan

### Step 1: Restructure AgentModeChat Layout
```tsx
// Current structure (WRONG for mobile portrait):
<ChatPanel>
  <Messages />
  <CostTracker />
  <Input />
</ChatPanel>
<CodePanel />

// Needed structure (mobile portrait):
<Header />
<Content flex-1>
  <ChatMessages flex scrollable />
  <Divider />
  <CodePreview flex scrollable />
</Content>
<CostTracker />
<Input />
```

### Step 2: Add Scroll Support
- Chat messages: Already has `overflow-y-auto`, verify height
- Code/Preview: Add `overflow-y-auto` to `AgentCodePanel`

### Step 3: Fix Settings Payment Scroll
- Find Settings/Subscription component
- Add `overflow-y-auto max-h-[60vh]` to payment dropdown

---

## Critical Conditions to Enforce

```tsx
// Mobile portrait detection
const isMobilePortrait = window.innerWidth < 768 && window.innerHeight > window.innerWidth;

// Use ONLY when:
// 1. isMobilePortrait === true
// 2. generatedCode exists (code panel is shown)

// Desktop/Landscape behavior:
// - NO changes to current layout
// - Input + CostTracker stay in Chat Panel
```

---

## Testing Checklist

- [ ] Desktop: Layout unchanged, everything works as before
- [ ] Mobile landscape: Layout unchanged
- [ ] Mobile portrait WITHOUT code: Input at bottom of chat panel (current behavior)
- [ ] Mobile portrait WITH code:
  - [ ] Header at top
  - [ ] Chat messages scrollable
  - [ ] Divider horizontal
  - [ ] Code/Preview scrollable
  - [ ] CostTracker at bottom
  - [ ] Input at very bottom
- [ ] Settings payment dropdown scrollable on mobile

---

## Files to Modify

1. `components/ai-chat/AgentModeChat.tsx` - Main layout restructure
2. `components/ai-chat/AgentCodePanel.tsx` - Verify scroll support
3. `components/ai-chat/CodeView.tsx` - Add overflow-y-auto if needed
4. `components/ai-chat/PreviewView.tsx` - Add overflow-y-auto if needed
5. Settings component (TBD - need to find file) - Add payment dropdown scroll

---

## Status
- **Current**: Deployed basic mobile portrait detection
- **Next**: Implement layout restructure and scroll fixes
- **Priority**: High (affects mobile UX significantly)
