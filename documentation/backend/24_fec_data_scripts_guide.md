# FEC Data Scripts Guide

## Overview

This document explains the organization and usage of FEC data scripts located in `scripts/fec-data/`.

## Directory Structure

```
scripts/fec-data/
├── production/       # Production data pipeline scripts
├── verification/     # Data verification and testing scripts
├── reports/          # Output reports and verification results
└── config/           # Configuration and progress tracking files
```

## Production Scripts (`production/`)

Core data pipeline scripts for production use:

### 01-download.py
- **Purpose**: Downloads FEC bulk data files
- **Downloads**: Committees, candidates, and contributions CSV files
- **Output**: Local data files for processing
- **Usage**: `cd production && python3 01-download.py`

### 02-upload-incremental.py
- **Purpose**: Primary upload script with resume capability
- **Features**:
  - Progress tracking via `01-upload-progress.json`
  - Can resume from interruption
  - Incremental upload support
  - Selective table upload with `--only` parameter
  - ADC token auto-refresh for long uploads
- **Collections**:
  - `fec_raw_committees` - Committee information
  - `fec_raw_candidates` - Candidate information
  - `fec_raw_contributions_pac_to_candidate_24` - 2024 PAC to candidate contributions
  - `fec_raw_linkages` - Candidate-committee linkages
  - `fec_raw_transfers` - Committee-to-committee transfers (13.8M records)
- **Usage**:
  - **Recommended**: Use wrapper script `./09-run-with-restart.sh [tables]` for automatic logging
  - Direct: `cd production && python3 02-upload-incremental.py` - Upload all tables
  - Direct: `cd production && python3 02-upload-incremental.py --only transfers,linkages` - Upload specific tables
- **Performance**: ~100-120 rows/sec with automatic rate limit handling
- **Note**: Transfers upload completed successfully (74 hours for 13.8M records)

### 03-upload-all.py
- **Purpose**: Full upload without resume functionality
- **Use case**: Clean upload from scratch
- **Usage**: `cd production && python3 03-upload-all.py`

### 09-run-with-restart.sh
- **Purpose**: Shell wrapper for automated uploads with logging
- **Features**:
  - Auto-generates timestamped log files (format: `02-upload-{tables}-YYYYMMDD-HHMMSS.log`)
  - Outputs to both terminal and log file
  - Supports table selection via command-line argument
  - Automatic restart every 45 minutes to avoid token expiration
- **Usage**:
  - `cd production && ./09-run-with-restart.sh` - Upload all tables with logging
  - `cd production && ./09-run-with-restart.sh transfers` - Upload only transfers with logging
- **Log Location**: `/Users/xuling/code/Stanse/logs/fec-data/`
- **Note**: This is the recommended way to run uploads for automatic logging

### 04-parse-and-upload.py
- **Purpose**: Combined parsing and upload in one step
- **Use case**: Alternative workflow
- **Usage**: `cd production && python3 04-parse-and-upload.py`

### 05-monitor.py
- **Purpose**: Monitor upload progress
- **Features**: Display progress statistics and current status
- **Usage**: `cd production && python3 05-monitor.py`

### 06-build-indexes.py
- **Purpose**: Build company indexes for fast lookups
- **Creates**:
  - `fec_company_index` - Company name → committee ID mapping
  - `fec_company_party_summary` - Company → party aggregation
- **Usage**: `cd production && python3 06-build-indexes.py`

### 07-complete-setup.py
- **Purpose**: End-to-end setup workflow
- **Features**: Combines download, upload, and indexing
- **Usage**: `cd production && python3 07-complete-setup.py`

### 08-check-status.py
- **Purpose**: Check Firebase data status
- **Features**: Verify data integrity, check collection counts
- **Usage**: `cd production && python3 08-check-status.py`

### 09-run-with-restart.sh
- **Purpose**: Auto-restart wrapper for upload script
- **Features**: Automatically restarts on failure for resilient upload
- **Usage**: `cd production && ./09-run-with-restart.sh`

### 10-create-manual-indexes.py
- **Purpose**: Manually create indexes for 9 verified companies
- **Features**: Fast index creation for validated companies to make queries immediately functional
- **Companies**: JPMorgan, Goldman Sachs, Microsoft, Google, Amazon, Apple, Meta, Boeing, Lockheed Martin
- **Usage**: `cd production && python3 10-create-manual-indexes.py`

### 11-delete-corrupted-data.py
- **Purpose**: Delete corrupted FEC data from Firestore
- **Features**:
  - Delete all fec_raw_contributions_pac_to_candidate (701,559 records with date errors)
  - Delete all fec_company_party_summary (summaries built from corrupted data)
  - Delete all fec_company_index (indexes built from corrupted data)
- **Usage**: `cd production && python3 11-delete-corrupted-data.py`
- **Warning**: Destructive operation - use with caution

### 12-build-company-variants.py
- **Purpose**: Automatically build company name variant mapping table
- **Features**:
  - Extract company names from all 20,934 committee records
  - Use fuzzy matching (rapidfuzz) to automatically group variants
  - Manual overrides for 9 verified companies
  - Export variant mappings for frontend use
- **Dependencies**: `pip install rapidfuzz`
- **Output**: `reports/12-variant-building-progress.json`
- **Usage**: `cd production && python3 12-build-company-variants.py`

### 13-run-build-indexes.sh
- **Purpose**: Wrapper script to run 06-build-indexes.py with logging
- **Features**:
  - Runs index building with timestamped log files
  - Saves logs to `/Users/xuling/code/Stanse/logs/fec-data/`
  - Outputs to both terminal and log file (tee)
- **Usage**: `cd production && ./13-run-build-indexes.sh`

## Verification Scripts (`verification/`)

### Data Verification Scripts (verify-*.py)

#### verify-01-deep-all-companies.py
- **Purpose**: Comprehensive 6-layer data chain validation
- **Test Companies**: 9 verified companies
- **Validation Layers**:
  1. Committee information
  2. Contribution records (with duplicate detection)
  3. Candidate and party validation
  4. Party aggregation
  5. Data integrity checks
  6. Sample record traceability
- **Output**: `reports/deep_verification_full_report.txt`
- **Usage**: `cd verification && python3 verify-01-deep-all-companies.py`

#### verify-02-basic-company.py
- **Purpose**: Quick company data verification
- **Features**: Basic party aggregation validation
- **Test Companies**: 10 companies
- **Usage**: `cd verification && python3 verify-02-basic-company.py`

#### verify-03-detailed-company.py
- **Purpose**: Detailed company verification
- **Features**: Extended validation beyond basic checks
- **Usage**: `cd verification && python3 verify-03-detailed-company.py`

#### verify-04-batch-companies.py
- **Purpose**: Batch verification of multiple companies
- **Use case**: Performance testing, bulk validation
- **Usage**: `cd verification && python3 verify-04-batch-companies.py`

#### verify-05-firebase-data.py
- **Purpose**: Direct Firestore data validation
- **Features**: Collection integrity checks
- **Usage**: `cd verification && python3 verify-05-firebase-data.py`

#### verify-06-find-valid.py
- **Purpose**: Find companies with valid FEC data
- **Use case**: Identify good test candidates
- **Usage**: `cd verification && python3 verify-06-find-valid.py`

#### verify-07-company-name-variants.py
- **Purpose**: Test company name variant matching for frontend integration
- **Features**:
  - Tests normalization consistency across different company name forms
  - Validates stock ticker mapping (e.g., JPM → JPMorgan Chase)
  - Checks company short names (e.g., Goldman → Goldman Sachs)
  - Verifies parent company mapping (e.g., Alphabet → Google)
- **Test Coverage**: 8 major companies with multiple variants each
- **Output**: Console report showing which variants map correctly and need aliases
- **Usage**: `cd verification && python3 verify-07-company-name-variants.py`
- **Tested Companies**:
  - Google (google, Google Inc, Alphabet)
  - JPMorgan (JPM, JP Morgan, JPMorgan Chase)
  - Microsoft (MSFT, Microsoft Corp)
  - Boeing, Goldman Sachs, AT&T, Lockheed Martin, RTX

#### verify-08-investigate-discrepancies.py
- **Purpose**: Investigate data discrepancies and missing companies
- **Features**:
  - Search Firestore by partial company name
  - Check if company exists in index but missing summary data
  - Identify multiple entities with similar names
- **Usage**: `cd verification && python3 verify-08-investigate-discrepancies.py`
- **Use Cases**:
  - Debug why a company isn't returning data
  - Find the correct normalized name for a company
  - Discover multiple entities (e.g., "goldman" vs "the goldman sachs group")
- **Investigations**: Goldman Sachs, Amazon, Walmart, RTX/Raytheon

### Test Scripts (test-*.py)

#### test-01-data-linking.py
- **Purpose**: Test data linking logic
- **Tests**: Committee → contribution → candidate links, party assignment
- **Usage**: `cd verification && python3 test-01-data-linking.py`

#### test-02-firebase-upload.py
- **Purpose**: Test Firebase upload functionality
- **Features**: Verify upload with small test datasets
- **Usage**: `cd verification && python3 test-02-firebase-upload.py`

#### test-03-query.py
- **Purpose**: Test query performance
- **Features**: Benchmark Firestore queries, test company name searches
- **Usage**: `cd verification && python3 test-03-query.py`

## Configuration Files (`config/`)

### upload_progress.json
- **Purpose**: Track upload progress for resume capability
- **Content**: Last processed line for each collection
- **Format**:
```json
{
  "committees_last_line": 20934,
  "committees_uploaded": 20934,
  "committees_completed": true,
  "candidates_last_line": 9809,
  "candidates_uploaded": 9809,
  "candidates_completed": true,
  "contributions_last_line": 703789,
  "contributions_uploaded": 701559,
  "contributions_completed": true
}
```

### 07-field-mappings.json
- **Purpose**: Map FEC CSV columns to Firestore fields
- **Content**: Field names, types, and descriptions
- **Location**: `scripts/fec-data/reports/07-field-mappings.json`

## Reports (`reports/`)

### Analysis Scripts
Located in `scripts/fec-data/reports/`:

#### analyze_speed.py
- **Purpose**: Analyzes upload speed and estimates completion time
- **Features**:
  - Reads from `01-upload-progress.json`
  - Calculates current upload rate
  - Provides ETA estimates (best, average, worst case)
- **Usage**: `cd reports && python3 analyze_speed.py`

#### progress_report.py
- **Purpose**: Generates detailed progress reports during upload
- **Features**:
  - Session duration tracking
  - Average speed calculation
  - Progress milestones
- **Usage**: `cd reports && python3 progress_report.py`

#### final_progress.py
- **Purpose**: Final progress summary with visual progress bars
- **Features**:
  - Complete session statistics
  - Visual milestone chart
  - Performance metrics
- **Usage**: `cd reports && python3 final_progress.py`

### Output Files
- **01-upload-progress.json**: Real-time upload progress tracking (updated by upload scripts)
- **deep_verification_full_report.txt**: Comprehensive 6-layer verification output
- **company_verification_results.txt**: Company verification summary
- **verification_result.json**: Machine-readable verification results
- **company_verification_report.json**: Detailed company verification data
- **07-field-mappings.json**: FEC CSV field mappings to Firestore

### Upload Logs
Located in `/Users/xuling/code/Stanse/logs/fec-data/`:
- **02-upload-transfers-20241222-171600.log**: Transfers data upload log (completed)
- **02-upload-contributions-20241215-060000.log**: Contributions data upload log
- **06-build-indexes-*.log**: Index building logs (timestamped)

## Verified Test Companies

The following 9 companies have verified complete data chains:

| Company | Donations | Total Amount | DEM % | REP % |
|---------|-----------|--------------|-------|-------|
| JPMorgan Chase | 390 | $715,000 | 52.4% | 46.9% |
| Goldman Sachs | 317 | $463,000 | 44.8% | 54.1% |
| Microsoft | 377 | $802,500 | 45.7% | 53.0% |
| Google | 455 | $727,000 | - | - |
| Amazon | 451 | $801,500 | - | - |
| Apple | 67 | $194,500 | - | - |
| Meta | 1,008 | $2,644,500 | - | - |
| Boeing | 1,268 | $1,591,500 | - | - |
| Lockheed Martin | 1,311 | $1,530,500 | - | - |

**Total**: 5,244 verified contribution records, ~$9.47 million

## Data Flow

```
FEC Bulk Data (CSV)
    ↓
[01-download.py]
    ↓
Local CSV Files
    ↓
[02-upload-incremental.py]
    ↓
Firestore Raw Collections
  - fec_raw_committees
  - fec_raw_candidates
  - fec_raw_contributions_pac_to_candidate
    ↓
[06-build-indexes.py]
    ↓
Indexed Collections
  - fec_company_index
  - fec_company_party_summary
    ↓
[Backend API - to be built]
    ↓
Frontend Display (Sense Tab)
```

## Usage Examples

### Initial Setup
```bash
# Download FEC data
cd /Users/xuling/code/Stanse/scripts/fec-data/production
python3 01-download.py

# Upload to Firestore
python3 02-upload-incremental.py

# Build indexes
python3 06-build-indexes.py
```

### Monitor Progress
```bash
cd /Users/xuling/code/Stanse/scripts/fec-data/production
python3 05-monitor.py
```

### Verify Data Integrity
```bash
cd /Users/xuling/code/Stanse/scripts/fec-data/verification
python3 verify-01-deep-all-companies.py > ../reports/deep_verification_full_report.txt
```

## Firestore Collections

### Raw Data Collections (public read-only)
- **fec_raw_committees**: PAC/committee information (20,934 records)
  - `committee_id`, `committee_name`, `connected_org_name`, `committee_type`, `party`
- **fec_raw_candidates**: Candidate information with party affiliations (9,809 records)
  - `candidate_id`, `candidate_name`, `party_affiliation`, `office_sought`, `state`
- **fec_raw_contributions_pac_to_candidate_24**: Individual contribution records for 2024 (701,709 records)
  - `committee_id`, `candidate_id`, `transaction_amount` (in cents), `transaction_date`
  - Note: Year-specific collection (2024 data only)
- **fec_raw_linkages**: Candidate-committee linkages (8,629 records)
  - `candidate_id`, `committee_id`, `linkage_type`, `data_year`
- **fec_raw_transfers**: Committee-to-committee fund transfers (13,824,909 records)
  - `committee_id`, `other_committee_id`, `transaction_amount`, `transaction_date`, `data_year`
  - Largest collection in the system

### Indexed Collections (public read-only)
- **fec_company_index**: Company name → committee ID mapping
- **fec_company_party_summary**: Company → party aggregation summary (with `data_year` field for year filtering)

## Data Integrity Notes

- **Amounts**: Stored in cents (integers) to avoid floating-point precision issues
- **Party Codes**: DEM (Democratic), REP (Republican), IND (Independent)
- **Data Source**: FEC 2024 cycle
- **Verification**: All scripts ensure no duplicate counting and accurate party assignment
- **Traceability**: Complete data chain: Company → Committee → Contribution → Candidate → Party

## Next Steps

1. Build backend query API for company political contributions
2. Design UI component for political contribution chart
3. Integrate FEC data into Sense report frontend
4. End-to-end testing with all verified companies

## Related Documentation

- [FEC Data Schema](19_fec_data_schema.md)
- [FEC Data System](20_fec_data_system.md)
- [FEC Firebase Architecture](21_fec_firebase_architecture.md)
- [FEC Firebase Implementation Status](22_fec_firebase_implementation_status.md)
- [FEC Field Verification](23_fec_field_verification.md)
