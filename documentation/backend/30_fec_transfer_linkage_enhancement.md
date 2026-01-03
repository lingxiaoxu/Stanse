# FEC Transfer and Linkage Data Enhancement Plan

## Executive Summary

This document outlines a phased approach to enhance FEC political donation data collection by integrating **transfer** and **linkage** datasets. The current system only uses individual contributions, resulting in incomplete data coverage (e.g., AAPL and GOOGL show "No data found"). This enhancement will capture corporate PAC donations and improve company name matching.

**Status**: Planning Phase
**Priority**: High
**Risk Level**: Medium (requires careful data integrity protection)

---

## 1. Problem Statement

### Current Limitations

The existing FEC data collector (`01-collect-fec-donations.py`) has three major gaps:

1. **Missing Corporate PAC Donations**: Only captures individual employee contributions, missing corporate PAC transfers to candidates and parties
2. **Poor Company Name Matching**: Relies on exact string matching against `fec_company_index`, missing variants like "APPLE INC PAC" vs "APPLE INC"
3. **Low Data Coverage**: Test results show only 1/3 companies (MSFT) have data; AAPL and GOOGL show "No data found"

### Example: Apple Inc (AAPL)

**Current State**:
- Individual contributions: $0 (not indexed)
- Status: "No data found"

**With Enhancement**:
- Individual contributions: Potentially $50K-$100K
- PAC transfers: Potentially $5M-$15M
- Status: Complete political donation profile

---

## 2. Data Sources

### 2.1 FEC Transfer Data (`fec_transfers`)

**What it contains**:
- Money transfers between PACs, party committees, and candidates
- Corporate PAC → Candidate donations
- PAC → Party Committee → Candidate flows

**Structure**:
```typescript
{
  cmte_id: "C00250894",           // Donor committee ID
  amndt_ind: "N",                 // Amendment indicator
  rpt_tp: "M10",                  // Report type
  transaction_pgi: "G",           // Primary/General indicator
  image_num: "123456789",         // Image number
  transaction_tp: "24K",          // Transaction type
  entity_tp: "PAC",               // Entity type
  name: "APPLE INC PAC",          // Committee name
  city: "CUPERTINO",
  state: "CA",
  zip_code: "95014",
  employer: "",
  occupation: "",
  transaction_dt: "12312024",     // MMDDYYYY
  transaction_amt: 5000,          // Donation amount
  other_id: "C00123456",          // Recipient committee ID
  tran_id: "SA123456789",         // Transaction ID
  file_num: 987654,               // File number
  memo_cd: "",                    // Memo code
  memo_text: "",                  // Memo text
  sub_id: 1234567890123456        // Unique record ID
}
```

**Key fields for matching**:
- `cmte_id`: Links to `fec_linkage` for company identification
- `other_id`: Recipient committee (candidate/party)
- `transaction_amt`: Donation amount
- `transaction_dt`: Date

### 2.2 FEC Linkage Data (`fec_linkage`)

**What it contains**:
- Maps committee IDs to company names and connected organizations
- Solves the ticker → company name matching problem

**Structure**:
```typescript
{
  candId: "",                     // Candidate ID (if applicable)
  candName: "",                   // Candidate name
  candOffice: "",                 // Office sought
  candOfficeSt: "",              // State
  candOfficeDistrict: "",        // District
  candPty: "",                    // Party
  cmteId: "C00250894",           // Committee ID (PRIMARY KEY)
  cmteName: "APPLE INC PAC",     // Committee name
  cmteType: "Q",                 // Committee type (Q = PAC)
  cmteDesig: "B",                // Designation
  linkageId: 123456,             // Linkage record ID
  connected_org: "APPLE INC",    // Connected organization name
  cycle: 2024                    // Election cycle
}
```

**Key fields**:
- `cmteId`: Links to `fec_transfers.cmte_id`
- `connected_org`: Company name for matching
- `cmteType`: "Q" = PAC, "N" = Non-party committee

---

## 3. Enhancement Strategy

### 3.1 Data Architecture Decision

**Recommended Approach**: **Integration into existing `fec_company_party_summary` structure**

**Rationale**:
- ✅ Single query for all FEC data
- ✅ Easier calculation of total political lean
- ✅ Clear separation of individual vs PAC data within document
- ❌ More complex document structure

**Alternative Considered**: Separate `fec_company_pac_transfers` collection
- ❌ Requires joins to get complete picture
- ❌ More complex querying in frontend

### 3.2 Enhanced Data Structure

#### New Collection: `fec_ticker_committee_mapping`

Purpose: Store verified ticker → committee ID mappings with confidence scores

```typescript
{
  ticker: "AAPL",
  company_name: "Apple Inc",

  verification_status: "verified" | "pending" | "rejected",
  verified_by: "manual" | "auto",
  verified_at: timestamp,

  committees: [
    {
      cmte_id: "C00250894",
      cmte_nm: "APPLE INC POLITICAL ACTION COMMITTEE",
      committee_type: "Q",              // PAC
      connected_org: "APPLE INC",
      confidence: 0.95,
      source: "fec_linkage" | "manual",
      cycle: 2024
    }
  ],

  discovered_variants: [
    "APPLE INC PAC",
    "APPLE INC. EMPLOYEES POLITICAL ACTION COMMITTEE"
  ],

  last_updated: timestamp
}
```

#### Enhanced: `company_rankings_by_ticker/{ticker}/fec_data`

```typescript
{
  ticker: "AAPL",
  display_name: "Apple Inc",

  // === Existing - Individual contributions ===
  party_totals: {
    DEM: {
      total_amount: 100000,      // Individual contributions
      count: 50
    },
    REP: {
      total_amount: 80000,
      count: 40
    }
  },
  total_usd: 180000,
  data_source: "fec_company_party_summary",
  variants_found: ["APPLE INC", "APPLE COMPUTER"],
  normalized_variants: ["apple inc", "apple computer"],

  // === New - PAC/Transfer data ===
  pac_data: {
    committee_ids: ["C00250894"],
    committee_names: ["APPLE INC POLITICAL ACTION COMMITTEE"],

    transfer_totals: {
      DEM: {
        total_amount: 5000000,   // PAC transfers
        count: 120
      },
      REP: {
        total_amount: 3000000,
        count: 80
      }
    },
    total_usd: 8000000,
    data_source: "fec_transfers",
    last_updated: timestamp
  },

  // === Combined totals for UI ===
  combined_totals: {
    DEM: {
      total_amount: 5100000,
      individual: 100000,
      pac: 5000000,
      count: 170
    },
    REP: {
      total_amount: 3080000,
      individual: 80000,
      pac: 3000000,
      count: 120
    }
  },
  total_all_sources: 8180000,

  // === Metadata ===
  political_lean_score: 24.7,    // Recalculated with PAC data
  last_updated: timestamp,
  data_completeness: "complete"   // "complete" | "partial" | "individual_only"
}
```

---

## 4. Implementation Plan (3 Phases)

### Phase 1: Discovery (Read-Only) - TEST 3 COMPANIES

**Goal**: Discover new mappings and PAC data WITHOUT modifying existing collections

**Test Companies**: AAPL, MSFT, GOOGL

**Script**: `05-discover-fec-transfers.py`

**Process**:
1. Query `fec_linkage` to find committee IDs for each ticker
2. Query `fec_transfers` to get PAC donation data
3. Save discoveries to **temporary collection** `fec_discovery_temp`
4. Generate human-readable review report
5. **DO NOT** modify `fec_company_name_variants` or `fec_company_index`

**Output**:
- `fec_discovery_temp/{ticker}`: Discovered data for review
- `scripts/fec-data/reports/16-fec-discovery-report.json`: Summary report

**Success Criteria**:
- ✅ Find at least 1 committee for AAPL
- ✅ Find at least 1 committee for GOOGL
- ✅ No writes to `fec_company_name_variants`
- ✅ No writes to `fec_company_index`

### Phase 2: Human Review & Validation

**Goal**: Review discovered mappings and approve/reject before production

**Process**:
1. Review `fec_discovery_temp` collection manually
2. Validate committee → ticker mappings
3. Check for conflicts with existing `fec_company_index`
4. Approve verified mappings to `fec_ticker_committee_mapping`

**Review Checklist**:
- [ ] Committee name clearly matches company name?
- [ ] Connected organization matches ticker?
- [ ] No conflicts with existing index?
- [ ] Donation amounts reasonable?
- [ ] Multiple committees for same ticker (if any) all valid?

**Output**:
- `fec_ticker_committee_mapping/{ticker}`: Verified mappings with `verification_status: "verified"`

### Phase 3: Production Rollout - ALL SP500 COMPANIES

**Goal**: Safe rollout to all SP500 companies using verified mappings

**Script**: `06-collect-fec-enhanced.py` (new version of `01-collect-fec-donations.py`)

**Process**:
1. For each ticker in SP500_TICKERS:
   - Collect individual contributions (existing logic)
   - Query `fec_ticker_committee_mapping` for verified committees
   - If verified committees exist:
     - Query `fec_transfers` for PAC donations
     - Merge individual + PAC data
   - Save to `company_rankings_by_ticker/{ticker}/fec_data`
2. Maintain backward compatibility with existing queries

**Safety Mechanisms**:
- Only use `verification_status: "verified"` mappings
- Graceful fallback if PAC data unavailable
- Preserve existing individual contribution data
- Log all new variants discovered (but don't auto-add to index)

---

## 5. Data Integrity Protection

### 5.1 SafeIndexManager Class

Purpose: Prevent pollution of `fec_company_name_variants` and `fec_company_index`

```python
class SafeIndexManager:
    """Manages index updates with conflict detection and dry-run mode"""

    def __init__(self, dry_run: bool = True):
        self.dry_run = dry_run
        self.conflicts = []
        self.proposed_additions = []

    def add_index_entry(self, normalized_name: str, ticker: str, source: str = "linkage") -> bool:
        """
        Add entry to fec_company_index with conflict detection

        Returns:
            True if successful or dry_run, False if conflict detected
        """
        # Check if already exists
        existing = self.get_index_entry(normalized_name)

        if existing:
            if existing['ticker'] != ticker:
                # CONFLICT! Needs human resolution
                self.log_conflict({
                    'normalized_name': normalized_name,
                    'existing_ticker': existing['ticker'],
                    'proposed_ticker': ticker,
                    'source': source,
                    'status': 'CONFLICT_REQUIRES_REVIEW'
                })
                return False
            else:
                # Already exists and consistent, skip
                return True

        # New entry
        if self.dry_run:
            self.log_proposed_addition({
                'normalized_name': normalized_name,
                'ticker': ticker,
                'source': source
            })
            return True
        else:
            # Actually write
            self.db.collection('fec_company_index').document(normalized_name).set({
                'ticker': ticker,
                'source': source,
                'added_at': firestore.SERVER_TIMESTAMP
            })
            return True

    def get_conflict_report(self) -> dict:
        """Generate report of all conflicts for human review"""
        return {
            'total_conflicts': len(self.conflicts),
            'conflicts': self.conflicts,
            'proposed_additions': self.proposed_additions
        }
```

### 5.2 Conflict Resolution Process

**Scenario 1**: New variant for existing ticker
```
Existing: "APPLE INC" → AAPL
Discovered: "APPLE INC PAC" → AAPL
Action: ✅ Auto-approve (same ticker)
```

**Scenario 2**: Same variant, different ticker (CONFLICT)
```
Existing: "ALPHABET INC" → GOOGL
Discovered: "ALPHABET INC" → GOOG
Action: ❌ Flag for human review
```

**Scenario 3**: New variant for new ticker
```
Existing: (none)
Discovered: "TESLA INC PAC" → TSLA
Action: ⚠️  Propose for human review (Phase 2)
```

---

## 6. Testing Strategy

### 6.1 Phase 1 Testing (Discovery)

**Test Cases**:

1. **AAPL (No existing data)**:
   - Expected: Find "APPLE INC PAC" in linkage
   - Expected: Find PAC transfers in fec_transfers
   - Verify: No writes to production collections

2. **MSFT (Has existing data)**:
   - Expected: Find "MICROSOFT CORPORATION PAC"
   - Expected: Merge with existing individual data
   - Verify: Individual data preserved

3. **GOOGL (No existing data, complex naming)**:
   - Expected: Find "ALPHABET INC PAC" or "GOOGLE INC PAC"
   - Expected: Handle multiple committee variants
   - Verify: Conflict detection works

### 6.2 Verification Script

**Script**: `scripts/company-ranking/verification/verify-transfer-linkage.py`

**Checks**:
- [ ] `fec_discovery_temp` has 3 documents (AAPL, MSFT, GOOGL)
- [ ] Each document has `committees` array with at least 1 entry
- [ ] Each document has `pac_transfers` with DEM/REP totals
- [ ] `fec_company_index` unchanged (document count same as before)
- [ ] `fec_company_name_variants` unchanged

---

## 7. Timeline and Milestones

### Week 1: Phase 1 Implementation
- [x] Create documentation (this file)
- [ ] Implement `05-discover-fec-transfers.py`
- [ ] Run discovery on AAPL, MSFT, GOOGL
- [ ] Generate discovery report

### Week 2: Phase 2 Validation
- [ ] Human review of discovered mappings
- [ ] Approve verified mappings to `fec_ticker_committee_mapping`
- [ ] Document any conflicts and resolutions

### Week 3: Phase 3 Production
- [ ] Implement `06-collect-fec-enhanced.py`
- [ ] Test on 10 companies
- [ ] Roll out to all SP500
- [ ] Update verification scripts

---

## 8. Rollback Plan

If issues are detected:

1. **Immediate**: Stop Phase 3 script execution
2. **Assess**: Check `fec_company_index` for unwanted changes
3. **Rollback**: Restore from Firestore backup if needed
4. **Fix**: Address root cause in discovery/validation logic
5. **Retest**: Re-run Phase 1 with fixes

**Backup Commands**:
```bash
# Backup before Phase 3
gcloud firestore export gs://stanseproject-backup/fec-pre-enhancement

# Restore if needed
gcloud firestore import gs://stanseproject-backup/fec-pre-enhancement
```

---

## 9. Success Metrics

### Data Coverage
- **Before**: 1/3 test companies (33%) have FEC data
- **Target**: 3/3 test companies (100%) have FEC data

### Data Completeness
- **Before**: MSFT has ~$500K in donations (individual only)
- **Target**: MSFT has $5M+ in donations (individual + PAC)

### Data Integrity
- **Zero** unwanted modifications to `fec_company_index`
- **Zero** conflicts in production rollout
- **100%** of verified mappings accurate

---

## 10. Related Documentation

- [19_fec_data_schema.md](19_fec_data_schema.md) - FEC data structure reference
- [20_fec_data_system.md](20_fec_data_system.md) - FEC system overview
- [21_fec_firebase_architecture.md](21_fec_firebase_architecture.md) - Firebase collections
- [24_fec_data_scripts_guide.md](24_fec_data_scripts_guide.md) - Script usage guide

---

## 11. Open Questions

1. **Committee Type Filtering**: Should we only include "Q" (PAC) committees, or also "N" (non-party)?
2. **Historical Data**: Should we backfill historical PAC data for previous election cycles?
3. **Update Frequency**: How often should we refresh transfer data (weekly/monthly)?

---

**Document Version**: 1.0
**Last Updated**: 2025-12-28
**Author**: AI Assistant
**Reviewed By**: [Pending]
