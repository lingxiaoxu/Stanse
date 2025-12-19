# FEC Data Processing System

## Overview

This system downloads, processes, and stores Federal Election Commission (FEC) bulk data to answer the key question: **"Which political parties does Company X contribute to and how much?"**

The data pipeline connects: **Company Name → PAC/Committee → Contributions → Candidates → Party Affiliation**

## Architecture

### Data Flow
```
1. Download FEC bulk data (ZIP files)
   ↓
2. Extract and parse pipe-delimited TXT files
   ↓
3. Build company index for fuzzy matching
   ↓
4. Upload to Firebase Firestore
   ↓
5. Query via Stanse frontend
```

### Components

- **[download_fec_data.py](../../scripts/fec-data/download_fec_data.py)**: Downloads FEC bulk data files
- **[parse_and_upload.py](../../scripts/fec-data/parse_and_upload.py)**: Parses data and uploads to Firebase
- **[19_fec_data_schema.md](./19_fec_data_schema.md)**: Detailed Firestore schema design

## Installation

### Prerequisites

- Python 3.9+
- Firebase project credentials
- Stable internet connection (FEC files are large)

### Setup

1. Install Python dependencies:
```bash
cd /Users/xuling/code/Stanse
pip install -r requirements.txt
```

2. Download Firebase credentials:
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select "stanseproject"
   - Project Settings → Service Accounts → Generate New Private Key
   - Save as `firebase-credentials.json` in project root

3. Verify credentials path:
```bash
ls firebase-credentials.json
```

## Usage

### Step 1: Download FEC Data

Download bulk data files from FEC website:

```bash
cd scripts/fec-data
python download_fec_data.py
```

This will download:
- Committee Master files (cm*.zip) - PAC/Committee information
- Candidate Master files (cn*.zip) - Candidate party affiliations
- Contribution files (pas2*.zip) - PAC-to-candidate donations
- Header/description files - Data dictionaries

**Expected time**: ~10-15 minutes depending on connection speed

**Expected storage**: ~500 MB (compressed), ~2 GB (extracted)

### Step 2: Parse and Upload to Firestore

Extract, parse, and upload data to Firebase:

```bash
python parse_and_upload.py
```

This will:
1. Extract ZIP files to TXT files
2. Parse pipe-delimited data
3. Build company name index
4. Upload to Firestore in batches

**Expected time**: ~30-60 minutes depending on data size

**Firestore collections created**:

**Multi-year collections** (contain records from all years with `data_year` field):
- `fec_raw_committees` (~100,000 documents across 5 years)
- `fec_raw_candidates` (~25,000 documents across 5 years)
- `fec_raw_linkages` (~50,000 documents across 5 years)
- `fec_raw_transfers` (~250,000 documents across 5 years)
- `fec_company_index` (~10,000 documents)

**Year-specific collections** (separate collection per election cycle year):
- `fec_raw_contributions_pac_to_candidate_2024` (~500,000 documents)
- `fec_raw_contributions_pac_to_candidate_2022` (~500,000 documents)
- `fec_raw_contributions_pac_to_candidate_2020` (~500,000 documents)
- `fec_raw_contributions_pac_to_candidate_2018` (~500,000 documents)
- `fec_raw_contributions_pac_to_candidate_2016` (~500,000 documents)

**Configuration**: Python scripts use `DATA_YEAR = '24'` variable (can be '16', '18', '20', '22', '24') to specify which year to process.

### Step 3: Query Data

Example query via Firebase SDK (to be integrated into Stanse):

```python
from google.cloud import firestore

db = firestore.Client()

# Configuration: Specify which year to query
DATA_YEAR = '24'  # Can be '16', '18', '20', '22', '24'
year_int = 2000 + int(DATA_YEAR)  # Convert to full year (e.g., 2024)

# 1. Find company
company_doc = db.collection('fec_company_index').document('exxonmobil').get()
committee_ids = company_doc.get('committee_ids')

# 2. Get contributions from these PACs (MUST specify year in collection name)
contributions = db.collection(f'fec_raw_contributions_pac_to_candidate_{year_int}') \
    .where('committee_id', 'in', committee_ids[:10]) \
    .get()

# 3. Get candidate party affiliations (filter by data_year)
candidate_ids = [c.get('candidate_id') for c in contributions]
candidates = db.collection('fec_raw_candidates') \
    .where('data_year', '==', year_int) \
    .where('candidate_id', 'in', candidate_ids[:10]) \
    .get()

# 4. Aggregate by party
party_totals = {}
for contribution in contributions:
    candidate = next((c for c in candidates if c.get('candidate_id') == contribution.get('candidate_id')), None)
    if candidate:
        party = candidate.get('party_affiliation')
        amount = contribution.get('transaction_amount', 0)
        party_totals[party] = party_totals.get(party, 0) + amount

print(party_totals)
# Output: {'DEM': 125000, 'REP': 250000}
```

**Key Architecture Points:**
1. **Year-specific contributions**: Collection name includes year (e.g., `fec_raw_contributions_pac_to_candidate_2024`)
2. **Multi-year committees/candidates**: Use `data_year` field to filter by year
3. **Why this design?**
   - Contributions are the largest dataset (~500k+ docs per year)
   - Separate collections prevent Firestore size limits and improve performance
   - Committees/candidates are smaller datasets, easier to manage in one collection with filtering

## Data Schema

See [19_fec_data_schema.md](./19_fec_data_schema.md) for detailed schema design.

### Quick Reference

**Multi-year Collections** (contain records from all years, filter by `data_year`):

1. **fec_raw_committees** - PAC/Committee master data
   - Document ID: `{committee_id}_{year}` (e.g., "C00401224_2024")
   - Key fields: `committee_id`, `data_year`, `committee_name`, `connected_org_name`
   - Purpose: Link companies to PACs

2. **fec_raw_candidates** - Candidate master data
   - Document ID: `{candidate_id}_{year}` (e.g., "H0NY15049_2024")
   - Key fields: `candidate_id`, `data_year`, `candidate_name`, `party_affiliation`
   - Purpose: Link candidates to political parties

3. **fec_raw_linkages** - Candidate-committee linkages
   - Document ID: `{candidate_id}_{committee_id}_{year}`
   - Key fields: `candidate_id`, `committee_id`, `data_year`
   - Purpose: Link candidates to their committees

4. **fec_raw_transfers** - Committee-to-committee transfers
   - Document ID: `{sender_committee_id}_{receiver_committee_id}_{transaction_id}`
   - Key fields: `sender_committee_id`, `receiver_committee_id`, `data_year`
   - Purpose: Track transfers between committees

**Year-specific Collections** (separate collection per year):

5. **fec_raw_contributions_pac_to_candidate_{year}** - PAC-to-candidate contributions
   - Available years: 2016, 2018, 2020, 2022, 2024
   - Document ID: `{committee_id}_{candidate_id}_{line_num}`
   - Key fields: `committee_id`, `candidate_id`, `transaction_amount`, `data_year`
   - Purpose: Track donation amounts
   - **Important**: Must specify year in collection name when querying

**Index Collection**:

6. **fec_company_index** - Optimized company name lookup
   - Document ID: `{normalized_company_name}` (e.g., "exxonmobil")
   - Key fields: `normalized_name`, `committee_ids`, `search_keywords`
   - Purpose: Fast fuzzy company name matching

## FEC Data Sources

**Base URL**: https://www.fec.gov/data/browse-data/?tab=bulk-data

**Data Files**:
- Committee Master (`cm{year}.zip`) - [FEC Documentation](https://www.fec.gov/campaign-finance-data/committee-master-file-description/)
- Candidate Master (`cn{year}.zip`) - [FEC Documentation](https://www.fec.gov/campaign-finance-data/candidate-master-file-description/)
- Contributions (`pas2{year}.zip`) - [FEC Documentation](https://www.fec.gov/campaign-finance-data/contributions-committees-candidates-file-description/)

**Update Frequency**: FEC data is updated monthly. Re-run scripts to refresh.

## File Structure

```
scripts/fec-data/
├── download_fec_data.py       # Step 1: Download FEC files
├── parse_and_upload.py        # Step 2: Parse and upload
└── raw_data/                  # Downloaded/extracted data
    ├── committees/            # Committee files
    ├── candidates/            # Candidate files
    ├── contributions/         # Contribution files
    └── descriptions/          # Data dictionaries
```

## Troubleshooting

### Download Issues

**Problem**: Download fails or times out
```
✗ Error downloading cm23-24.zip: Connection timeout
```

**Solution**:
- Check internet connection
- The script will automatically skip existing files, just re-run it
- FEC servers may be slow during peak hours, try again later

### Parse Issues

**Problem**: Unicode/encoding errors
```
UnicodeDecodeError: 'utf-8' codec can't decode byte...
```

**Solution**:
- FEC files use `latin-1` encoding (already handled in scripts)
- If you see this error, check that you're using the provided scripts

### Firebase Upload Issues

**Problem**: Permission denied
```
Permission denied: fec_committees
```

**Solution**:
- Verify `firebase-credentials.json` exists and is valid
- Check Firebase console security rules allow write access
- Ensure the service account has "Cloud Datastore User" role

**Problem**: Batch write failed
```
Batch write failed: too many writes
```

**Solution**:
- Script automatically batches writes (500 docs per batch)
- If this error persists, there may be a network issue
- Re-run the script - it won't duplicate existing data

## Data Updates

To refresh FEC data with latest information:

```bash
# 1. Remove old data
rm -rf scripts/fec-data/raw_data/

# 2. Re-download
cd scripts/fec-data
python download_fec_data.py

# 3. Re-parse and upload (will overwrite existing documents)
python parse_and_upload.py
```

## Future Integration with Stanse

### Frontend Query API

Create a new service file: `services/fecService.ts`

```typescript
export async function queryCompanyPolitics(companyName: string, year: number = 2024) {
  // 1. Normalize company name
  const normalized = normalizeCompanyName(companyName);

  // 2. Look up in company index
  const companyDoc = await db.collection('fec_company_index')
    .doc(normalized).get();

  if (!companyDoc.exists) {
    throw new Error('Company not found');
  }

  const committeeIds = companyDoc.data().committee_ids;

  // 3. Get contributions from year-specific collection
  const contributionsRef = db.collection(`fec_raw_contributions_pac_to_candidate_${year}`);
  const contributionsSnap = await contributionsRef
    .where('committee_id', 'in', committeeIds.slice(0, 10))  // Firestore limit
    .get();

  // 4. Get candidate info (filter by data_year)
  const candidateIds = [...new Set(contributionsSnap.docs.map(d => d.data().candidate_id))];
  const candidatesSnap = await db.collection('fec_raw_candidates')
    .where('data_year', '==', year)
    .where('candidate_id', 'in', candidateIds.slice(0, 10))
    .get();

  // 5. Aggregate by party
  const partyTotals: Record<string, number> = {};
  contributionsSnap.forEach(contribDoc => {
    const contrib = contribDoc.data();
    const candidate = candidatesSnap.docs.find(c => c.data().candidate_id === contrib.candidate_id);
    if (candidate) {
      const party = candidate.data().party_affiliation;
      partyTotals[party] = (partyTotals[party] || 0) + contrib.transaction_amount;
    }
  });

  return {
    company: companyName,
    year: year,
    partyContributions: partyTotals,
    totalAmount: Object.values(partyTotals).reduce((a, b) => a + b, 0)
  };
}

// Query multiple years
export async function queryCompanyPoliticsMultiYear(companyName: string, years: number[] = [2024, 2022, 2020]) {
  const results = await Promise.all(
    years.map(year => queryCompanyPolitics(companyName, year))
  );

  return results;
}
```

### UI Component

Display company political contributions in a card or modal:

```tsx
<CompanyPoliticsCard companyName="ExxonMobil">
  <PartyBreakdown>
    <PartyBar party="REP" amount={250000} percentage={65.8} />
    <PartyBar party="DEM" amount={125000} percentage={32.9} />
    <PartyBar party="IND" amount={5000} percentage={1.3} />
  </PartyBreakdown>
</CompanyPoliticsCard>
```

## Performance Considerations

### Query Performance
- Company index enables O(1) lookups by normalized name
- Fuzzy search uses `array-contains` on `search_keywords` (indexed)
- Firestore composite indexes recommended for complex queries

### Storage Costs
- Estimated total storage: ~550 MB
- Firestore free tier: 1 GB storage
- Should fit comfortably within free tier

### Read Costs
- Firestore free tier: 50K reads/day
- Typical query: ~50-100 reads per company lookup
- Can handle ~500-1000 company queries per day for free

## Maintenance

### Monthly Updates
FEC data should be refreshed monthly to capture new contributions:

```bash
# Add to crontab or GitHub Actions
0 0 1 * * cd /path/to/Stanse/scripts/fec-data && python download_fec_data.py && python parse_and_upload.py
```

### Data Validation
Periodically verify data integrity:

```python
# Check collection counts
committees = db.collection('fec_committees').count().get()
candidates = db.collection('fec_candidates').count().get()
contributions = db.collection('fec_contributions').count().get()

print(f'Committees: {committees}')
print(f'Candidates: {candidates}')
print(f'Contributions: {contributions}')
```

## References

- [FEC Bulk Data Portal](https://www.fec.gov/data/browse-data/?tab=bulk-data)
- [Firebase Firestore Documentation](https://firebase.google.com/docs/firestore)
- [Firebase Admin Python SDK](https://firebase.google.com/docs/admin/setup)

## Support

For issues or questions:
1. Check [19_fec_data_schema.md](./19_fec_data_schema.md) for data structure details
2. Review Firestore console for data verification
3. Check script logs for error messages
