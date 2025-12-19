# FEC Data Firebase Schema Design

## Overview
This schema is designed to efficiently answer the query: "Which political parties does Company X support and how much?"

The data flow is: **Company Name → PAC/Committee → Contributions → Candidates → Party Affiliation**

## Firestore Collections

### Collection Naming Strategy

**Multi-year collections** (aggregate data across all years):
- `fec_raw_committees` - Document ID: `{committee_id}_{year}`
- `fec_raw_candidates` - Document ID: `{candidate_id}_{year}`
- `fec_raw_linkages` - Document ID: `{candidate_id}_{committee_id}_{year}`
- `fec_raw_transfers` - Document ID: `{sender_committee_id}_{receiver_committee_id}_{transaction_id}`

**Year-specific collections** (separate collection per year to manage size):
- `fec_raw_contributions_pac_to_candidate_2024` - Document ID: `{committee_id}_{candidate_id}_{line_num}`
- `fec_raw_contributions_pac_to_candidate_2022` - Document ID: `{committee_id}_{candidate_id}_{line_num}`
- ... (one collection per election cycle year)

### 1. `fec_raw_committees`
Stores PAC and committee information including connected organizations (companies). **Multi-year table** containing records from all years.

**Document ID**: `{committee_id}_{year}` (e.g., "C00401224_2024")

**Fields**:
```javascript
{
  committee_id: string,          // Part of composite primary key
  data_year: number,             // Part of composite primary key (e.g., 2024)
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
- Document ID: `{committee_id}_{year}` (auto-indexed)
- `committee_id` (for lookups across years)
- `data_year` (for filtering by year)
- `connected_org_name` (for company lookup)
- `sponsor_name` (for company lookup)

---

### 2. `fec_raw_candidates`
Stores candidate information including party affiliation. **Multi-year table** containing records from all years.

**Document ID**: `{candidate_id}_{year}` (e.g., "H0NY15049_2024")

**Fields**:
```javascript
{
  candidate_id: string,          // Part of composite primary key
  data_year: number,             // Part of composite primary key (e.g., 2024)
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
- Document ID: `{candidate_id}_{year}` (auto-indexed)
- `candidate_id` (for lookups across years)
- `data_year` (for filtering by year)
- `party_affiliation` (for aggregation)
- `election_year` (for time-based queries)

---

### 3. `fec_raw_contributions_pac_to_candidate_{year}`
Stores PAC-to-candidate contribution records. **Year-specific collections** - one collection per election cycle year.

Available years: `2016`, `2018`, `2020`, `2022`, `2024`

**Collection naming examples:**
- `fec_raw_contributions_pac_to_candidate_2024`
- `fec_raw_contributions_pac_to_candidate_2022`
- `fec_raw_contributions_pac_to_candidate_2020`

**Document ID**: `{committee_id}_{candidate_id}_{line_num}` (e.g., "C00401224_H0NY15049_12345")

**Fields**:
```javascript
{
  committee_id: string,          // References fec_raw_committees (match with data_year)
  data_year: number,             // Year of this contribution (e.g., 2024)
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
- Document ID: `{committee_id}_{candidate_id}_{line_num}` (auto-indexed, unique within year)
- `committee_id` (for PAC → contributions lookup)
- `candidate_id` (for candidate → contributions lookup)
- `transaction_date` (for time-based queries)
- Composite: `committee_id + transaction_date` (for efficient queries)

**Why year-specific collections?**
- Prevents Firestore collection size limits (contributions are the largest dataset ~500k+ docs per year)
- Improves query performance by reducing collection size
- Allows efficient year-specific queries without filtering
- Each collection remains under optimal size for indexing

**Querying:**
- **Single year**: Query the specific year collection directly (e.g., `fec_raw_contributions_pac_to_candidate_2024`)
- **Multiple years**: Iterate through year-specific collections sequentially or in parallel
- **Python scripts**: Use `DATA_YEAR = '24'` variable to specify which collection to query

---

### 4. `fec_raw_linkages`
Stores candidate-committee linkages. **Multi-year table** containing records from all years.

**Document ID**: `{candidate_id}_{committee_id}_{year}` (e.g., "H0NY15049_C00639591_2024")

**Fields**:
```javascript
{
  candidate_id: string,          // Part of composite primary key
  committee_id: string,          // Part of composite primary key
  data_year: number,             // Part of composite primary key (e.g., 2024)
  committee_type: string,        // P=Principal, A=Authorized, etc.
  committee_designation: string,
  linkage_id: string,
  created_at: timestamp,
  updated_at: timestamp
}
```

**Indexes**:
- Document ID: `{candidate_id}_{committee_id}_{year}` (auto-indexed)
- `candidate_id` (for candidate → committees lookup)
- `committee_id` (for committee → candidates lookup)
- `data_year` (for filtering by year)

---

### 5. `fec_raw_transfers`
Stores committee-to-committee transfers. **Multi-year table** containing records from all years.

**Document ID**: `{sender_committee_id}_{receiver_committee_id}_{transaction_id}` (e.g., "C00401224_C00639591_TX123456")

**Fields**:
```javascript
{
  sender_committee_id: string,
  receiver_committee_id: string,
  transaction_id: string,
  data_year: number,             // Year of this transfer (e.g., 2024)
  transaction_date: string,      // YYYYMMDD format
  transaction_amount: number,    // In cents for precision
  transaction_type: string,
  created_at: timestamp,
  updated_at: timestamp
}
```

**Indexes**:
- Document ID: `{sender_committee_id}_{receiver_committee_id}_{transaction_id}` (auto-indexed)
- `sender_committee_id` (for transfers from a committee)
- `receiver_committee_id` (for transfers to a committee)
- `data_year` (for filtering by year)
- `transaction_date` (for time-based queries)

---

### 6. `fec_company_index`
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

**Step 3**: Get all contributions from these committees (for a specific year)
```javascript
const year = '2024';  // or '2022', '2020', etc.
const contributions = await db.collection(`fec_raw_contributions_pac_to_candidate_${year}`)
  .where('committee_id', 'in', committeeIds.slice(0, 10)) // Firestore limits 'in' to 10
  .get();
```

**Step 4**: Get candidate info and aggregate by party
```javascript
const candidateIds = [...new Set(contributions.map(c => c.candidate_id))];
const year = '2024';
const candidates = await db.collection('fec_raw_candidates')
  .where('data_year', '==', parseInt(year))
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

### Per Year
- Committees: ~20,000 records × 2KB = 40 MB (multi-year table with data_year field)
- Candidates: ~5,000 records × 1KB = 5 MB (multi-year table with data_year field)
- Linkages: ~10,000 records × 500B = 5 MB (multi-year table with data_year field)
- Transfers: ~50,000 records × 500B = 25 MB (multi-year table with data_year field)
- Contributions (per year): ~500,000 records × 1KB = 500 MB (separate collection per year)

### Across 5 Years (2016, 2018, 2020, 2022, 2024)
- Committees (all years): ~100,000 records = 200 MB
- Candidates (all years): ~25,000 records = 25 MB
- Linkages (all years): ~50,000 records = 25 MB
- Transfers (all years): ~250,000 records = 125 MB
- Contributions (5 separate collections): 5 × 500 MB = 2,500 MB
- Company Index: ~10,000 records × 500B = 5 MB

**Total (5 years)**: ~2,880 MB (~2.9 GB)

**Note**: Multi-year collections (committees, candidates, linkages, transfers) store all years in a single collection with a `data_year` field. Year-specific collections (contributions) have separate collections per year to manage size and improve query performance.

---

## Future Optimizations

1. **Materialized Views**: Pre-aggregate party totals per company
   - Collection: `fec_company_party_totals`
   - Document ID: `{company_id}_{party}`
   - Fields: `total_amount`, `contribution_count`, `last_updated`

2. **Time-based Partitioning**: ✅ **Already implemented** for contributions
   - `fec_raw_contributions_pac_to_candidate_2024`, `fec_raw_contributions_pac_to_candidate_2022`, etc.
   - This prevents single-collection size limits and improves query performance

3. **Full-text Search**: Integrate with Algolia or Elasticsearch for advanced company name matching

4. **Caching**: Add Redis cache for frequently queried companies