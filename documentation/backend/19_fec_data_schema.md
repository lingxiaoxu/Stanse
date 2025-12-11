# FEC Data Firebase Schema Design

## Overview
This schema is designed to efficiently answer the query: "Which political parties does Company X support and how much?"

The data flow is: **Company Name → PAC/Committee → Contributions → Candidates → Party Affiliation**

## Firestore Collections

### 1. `fec_committees`
Stores PAC and committee information including connected organizations (companies).

**Document ID**: Committee ID (e.g., "C00401224")

**Fields**:
```javascript
{
  committee_id: string,          // Primary key
  committee_name: string,        // e.g., "EXXONMOBIL POLITICAL ACTION COMMITTEE"
  committee_type: string,        // e.g., "Q" (qualified PAC)
  connected_org_name: string,    // Company name (if applicable)
  treasurer_name: string,
  street_1: string,
  street_2: string,
  city: string,
  state: string,
  zip: string,
  designation: string,           // A=Authorized, P=Principal, etc.
  category: string,              // Party, Corporation, Labor, etc.
  filing_frequency: string,
  interest_group_category: string,
  sponsor_name: string,          // Often the parent company
  created_at: timestamp,
  updated_at: timestamp
}
```

**Indexes**:
- `committee_id` (auto-indexed as doc ID)
- `connected_org_name` (for company lookup)
- `sponsor_name` (for company lookup)

---

### 2. `fec_candidates`
Stores candidate information including party affiliation.

**Document ID**: Candidate ID (e.g., "H0NY15049")

**Fields**:
```javascript
{
  candidate_id: string,          // Primary key
  candidate_name: string,        // e.g., "OCASIO-CORTEZ, ALEXANDRIA"
  party_affiliation: string,     // DEM, REP, IND, LIB, GRE, etc.
  office_sought: string,         // H (House), S (Senate), P (President)
  state: string,                 // Two-letter state code
  district: string,              // Congressional district (for House)
  incumbent_challenger_status: string, // I, C, O
  candidate_status: string,      // Active, Withdrawn, etc.
  principal_committee_id: string, // Links to fec_committees
  street_1: string,
  street_2: string,
  city: string,
  zip: string,
  election_year: number,
  created_at: timestamp,
  updated_at: timestamp
}
```

**Indexes**:
- `candidate_id` (auto-indexed as doc ID)
- `party_affiliation` (for aggregation)
- `election_year` (for time-based queries)

---

### 3. `fec_contributions`
Stores PAC-to-candidate contribution records.

**Document ID**: Auto-generated (contributions don't have natural keys)

**Fields**:
```javascript
{
  committee_id: string,          // References fec_committees
  amendment_indicator: string,   // N=New, A=Amendment, T=Termination
  report_type: string,
  primary_general_indicator: string, // P, G, etc.
  image_number: string,
  transaction_type: string,      // 24A, 24E, etc.
  entity_type: string,           // CAN (candidate), CCM (committee), etc.
  contributor_name: string,      // Usually same as committee_name
  city: string,
  state: string,
  zip: string,
  employer: string,
  occupation: string,
  transaction_date: string,      // YYYYMMDD format
  transaction_amount: number,    // In cents for precision
  other_id: string,              // Candidate ID or other committee ID
  candidate_id: string,          // References fec_candidates
  transaction_id: string,
  file_number: string,
  memo_code: string,
  memo_text: string,
  fec_record_number: string,
  created_at: timestamp
}
```

**Indexes**:
- `committee_id` (for PAC → contributions lookup)
- `candidate_id` (for candidate → contributions lookup)
- `transaction_date` (for time-based queries)
- Composite: `committee_id + transaction_date` (for efficient queries)

---

### 4. `fec_company_index`
Optimized index for fuzzy company name matching. This is the entry point for queries.

**Document ID**: Normalized company name (lowercase, no punctuation)

**Fields**:
```javascript
{
  normalized_name: string,       // e.g., "exxonmobil"
  original_names: string[],      // All variations found (e.g., ["ExxonMobil", "EXXONMOBIL", "Exxon Mobil"])
  committee_ids: string[],       // All PAC IDs associated with this company
  search_keywords: string[],     // For fuzzy matching (e.g., ["exxon", "mobil"])
  total_committees: number,      // Count of associated PACs
  created_at: timestamp,
  updated_at: timestamp
}
```

**Indexes**:
- `normalized_name` (auto-indexed as doc ID)
- `search_keywords` (array-contains for fuzzy search)

---

## Query Patterns

### Primary Query: "Which parties does Company X support?"

**Step 1**: Look up company in `fec_company_index`
```javascript
// Exact match
const companyDoc = await db.collection('fec_company_index').doc('exxonmobil').get();

// Fuzzy match
const results = await db.collection('fec_company_index')
  .where('search_keywords', 'array-contains', 'exxon')
  .get();
```

**Step 2**: Get all committee IDs
```javascript
const committeeIds = companyDoc.data().committee_ids;
```

**Step 3**: Get all contributions from these committees
```javascript
const contributions = await db.collection('fec_contributions')
  .where('committee_id', 'in', committeeIds.slice(0, 10)) // Firestore limits 'in' to 10
  .get();
```

**Step 4**: Get candidate info and aggregate by party
```javascript
const candidateIds = [...new Set(contributions.map(c => c.candidate_id))];
const candidates = await db.collection('fec_candidates')
  .where('candidate_id', 'in', candidateIds.slice(0, 10))
  .get();

// Aggregate contributions by party
const partyTotals = {};
contributions.forEach(contribution => {
  const candidate = candidates.find(c => c.candidate_id === contribution.candidate_id);
  const party = candidate.party_affiliation;
  partyTotals[party] = (partyTotals[party] || 0) + contribution.transaction_amount;
});
```

---

## Data Processing Pipeline

1. **Download**: Python script downloads ZIP files from FEC
2. **Extract**: Unzip to get pipe-delimited TXT files
3. **Parse**: Read TXT files, split by `|` delimiter
4. **Transform**:
   - Build company index from committee data
   - Normalize company names
   - Convert amounts to cents
   - Convert dates to timestamps
5. **Load**: Batch upload to Firestore (500 docs per batch)

---

## Estimated Storage

- Committees: ~20,000 records × 2KB = 40 MB
- Candidates: ~5,000 records × 1KB = 5 MB
- Contributions: ~500,000 records × 1KB = 500 MB
- Company Index: ~10,000 records × 500B = 5 MB

**Total**: ~550 MB (well within Firestore limits)

---

## Future Optimizations

1. **Materialized Views**: Pre-aggregate party totals per company
   - Collection: `fec_company_party_totals`
   - Document ID: `{company_id}_{party}`
   - Fields: `total_amount`, `contribution_count`, `last_updated`

2. **Time-based Partitioning**: Separate collections by election cycle
   - `fec_contributions_2024`, `fec_contributions_2022`, etc.

3. **Full-text Search**: Integrate with Algolia or Elasticsearch for advanced company name matching

4. **Caching**: Add Redis cache for frequently queried companies