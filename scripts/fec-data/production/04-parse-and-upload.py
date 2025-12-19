#!/usr/bin/env python3
"""
FEC Data Parser and Firebase Uploader

Parses FEC bulk data files and uploads to Firebase Firestore.
Implements the schema defined in SCHEMA.md.

This script:
1. Extracts ZIP files to get pipe-delimited TXT files
2. Parses committee, candidate, and contribution data
3. Builds a company index for fuzzy matching
4. Uploads everything to Firestore in batches
"""

import os
import sys
import json
import zipfile
import re
from pathlib import Path
from typing import List, Dict, Set, Optional
from datetime import datetime
from collections import defaultdict

import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1.batch import WriteBatch

# Configuration
DATA_DIR = Path(__file__).parent.parent / 'raw_data'

# Firestore batch size limit
BATCH_SIZE = 500

# Global Firebase DB instance
db = None

# Firebase project ID (same as in services/firebase.ts)
FIREBASE_PROJECT_ID = 'stanseproject'

# FEC file field positions (based on FEC data dictionaries)
# Committee Master (cm) fields
CM_FIELDS = {
    'committee_id': 0,
    'committee_name': 1,
    'treasurer_name': 2,
    'street_1': 3,
    'street_2': 4,
    'city': 5,
    'state': 6,
    'zip': 7,
    'designation': 8,
    'committee_type': 9,
    'party': 10,
    'filing_frequency': 11,
    'interest_group_category': 12,
    'connected_org_name': 13,
    'candidate_id': 14,
}

# Candidate Master (cn) fields
CN_FIELDS = {
    'candidate_id': 0,
    'candidate_name': 1,
    'party_affiliation': 2,
    'election_year': 3,
    'office_sought': 4,
    'state': 5,
    'district': 6,
    'incumbent_challenger_status': 7,
    'candidate_status': 8,
    'principal_committee_id': 9,
    'street_1': 10,
    'street_2': 11,
    'city': 12,
    'state_full': 13,
    'zip': 14,
}

# Contributions (pas2) fields
PAS2_FIELDS = {
    'committee_id': 0,
    'amendment_indicator': 1,
    'report_type': 2,
    'primary_general_indicator': 3,
    'image_number': 4,
    'transaction_type': 5,
    'entity_type': 6,
    'contributor_name': 7,
    'city': 8,
    'state': 9,
    'zip': 10,
    'employer': 11,
    'occupation': 12,
    'transaction_date': 13,
    'transaction_amount': 14,
    'other_id': 15,
    'candidate_id': 16,
    'transaction_id': 17,
    'file_number': 18,
    'memo_code': 19,
    'memo_text': 20,
    'fec_record_number': 21,
}

def initialize_firebase():
    """
    Initialize Firebase Admin SDK using Application Default Credentials

    使用gcloud认证，无需额外的credentials文件
    """
    global db

    print('🔧 Initializing Firebase...')

    # Check if already initialized
    if firebase_admin._apps:
        db = firestore.client()
        print('✓ Firebase already initialized')
        return

    try:
        # 使用Application Default Credentials (通过gcloud auth application-default login)
        # 或者如果在GCP环境中运行，会自动使用服务账号
        cred = credentials.ApplicationDefault()
        firebase_admin.initialize_app(cred, {
            'projectId': FIREBASE_PROJECT_ID
        })
        db = firestore.client()
        print(f'✓ Firebase initialized (project: {FIREBASE_PROJECT_ID})')
    except Exception as e:
        print(f'✗ Failed to initialize Firebase: {e}')
        print('\n请运行以下命令设置认证:')
        print('  gcloud auth application-default login')
        print('  gcloud config set project stanseproject')
        sys.exit(1)

def normalize_company_name(name: str) -> str:
    """
    Normalize company name for indexing

    Examples:
        "ExxonMobil Corporation" -> "exxonmobil"
        "McDonald's Corp." -> "mcdonalds"
        "AT&T Inc." -> "att"
    """
    if not name:
        return ''

    # Convert to lowercase
    normalized = name.lower()

    # Remove common suffixes
    suffixes = [
        'corporation', 'corp', 'inc', 'incorporated',
        'company', 'co', 'llc', 'lp', 'ltd', 'limited',
        'political action committee', 'pac', 'political committee'
    ]
    for suffix in suffixes:
        normalized = re.sub(rf'\b{suffix}\b\.?', '', normalized)

    # Remove punctuation and extra spaces
    normalized = re.sub(r'[^\w\s]', '', normalized)
    normalized = re.sub(r'\s+', '', normalized)

    return normalized.strip()

def extract_search_keywords(company_name: str) -> List[str]:
    """
    Extract search keywords from company name for fuzzy matching

    Examples:
        "ExxonMobil" -> ["exxon", "mobil", "exxonmobil"]
        "AT&T" -> ["att"]
    """
    normalized = normalize_company_name(company_name)
    keywords = set([normalized])

    # Split camelCase
    parts = re.findall(r'[A-Z]?[a-z]+|[A-Z]+(?=[A-Z][a-z]|\d|\W|$)|\d+', company_name)
    for part in parts:
        keyword = normalize_company_name(part)
        if keyword and len(keyword) > 2:  # Skip very short keywords
            keywords.add(keyword)

    return sorted(list(keywords))

def extract_zip_files():
    """Extract all ZIP files in raw_data directory"""
    print('\n📦 Extracting ZIP files...')

    categories = ['committees', 'candidates', 'contributions']
    extracted_count = 0

    for category in categories:
        category_dir = DATA_DIR / category
        if not category_dir.exists():
            continue

        for zip_path in category_dir.glob('*.zip'):
            txt_path = zip_path.with_suffix('.txt')

            # Skip if already extracted
            if txt_path.exists():
                print(f'⊘ Already extracted: {zip_path.name}')
                continue

            print(f'📂 Extracting: {zip_path.name}')
            try:
                with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                    # FEC ZIP files contain a single TXT file with the same base name
                    zip_ref.extractall(category_dir)
                    extracted_count += 1
                    print(f'✓ Extracted: {zip_path.name}')
            except Exception as e:
                print(f'✗ Error extracting {zip_path.name}: {e}')

    print(f'\n✓ Extracted {extracted_count} files')

def parse_committee_file(file_path: Path) -> tuple[List[Dict], Dict[str, Set[str]]]:
    """
    Parse committee master file

    Returns:
        - List of committee documents for Firestore
        - Dictionary mapping normalized company names to committee IDs
    """
    print(f'\n📄 Parsing: {file_path.name}')

    committees = []
    company_index = defaultdict(set)
    line_count = 0

    try:
        with open(file_path, 'r', encoding='latin-1') as f:
            for line in f:
                line_count += 1
                fields = line.strip().split('|')

                # Skip invalid lines
                if len(fields) < max(CM_FIELDS.values()) + 1:
                    continue

                committee_id = fields[CM_FIELDS['committee_id']].strip()
                committee_name = fields[CM_FIELDS['committee_name']].strip()
                connected_org = fields[CM_FIELDS['connected_org_name']].strip()

                # Build committee document
                committee_doc = {
                    'committee_id': committee_id,
                    'committee_name': committee_name,
                    'committee_type': fields[CM_FIELDS['committee_type']].strip(),
                    'connected_org_name': connected_org,
                    'treasurer_name': fields[CM_FIELDS['treasurer_name']].strip(),
                    'street_1': fields[CM_FIELDS['street_1']].strip(),
                    'street_2': fields[CM_FIELDS['street_2']].strip(),
                    'city': fields[CM_FIELDS['city']].strip(),
                    'state': fields[CM_FIELDS['state']].strip(),
                    'zip': fields[CM_FIELDS['zip']].strip(),
                    'designation': fields[CM_FIELDS['designation']].strip(),
                    'party': fields[CM_FIELDS['party']].strip(),
                    'filing_frequency': fields[CM_FIELDS['filing_frequency']].strip(),
                    'interest_group_category': fields[CM_FIELDS['interest_group_category']].strip(),
                    'created_at': firestore.SERVER_TIMESTAMP,
                    'updated_at': firestore.SERVER_TIMESTAMP,
                }

                committees.append(committee_doc)

                # Build company index
                if connected_org:
                    normalized = normalize_company_name(connected_org)
                    if normalized:
                        company_index[normalized].add(committee_id)

                # Also index by committee name (some PACs include company name)
                if 'pac' in committee_name.lower() or 'political' in committee_name.lower():
                    normalized = normalize_company_name(committee_name)
                    if normalized:
                        company_index[normalized].add(committee_id)

        print(f'✓ Parsed {len(committees)} committees from {line_count} lines')
        print(f'✓ Built index for {len(company_index)} companies')

    except Exception as e:
        print(f'✗ Error parsing {file_path.name}: {e}')

    return committees, dict(company_index)

def parse_candidate_file(file_path: Path) -> List[Dict]:
    """Parse candidate master file"""
    print(f'\n📄 Parsing: {file_path.name}')

    candidates = []
    line_count = 0

    try:
        with open(file_path, 'r', encoding='latin-1') as f:
            for line in f:
                line_count += 1
                fields = line.strip().split('|')

                # Skip invalid lines
                if len(fields) < max(CN_FIELDS.values()) + 1:
                    continue

                candidate_id = fields[CN_FIELDS['candidate_id']].strip()
                election_year_str = fields[CN_FIELDS['election_year']].strip()

                # Parse election year
                try:
                    election_year = int(election_year_str) if election_year_str else 0
                except ValueError:
                    election_year = 0

                # Build candidate document
                candidate_doc = {
                    'candidate_id': candidate_id,
                    'candidate_name': fields[CN_FIELDS['candidate_name']].strip(),
                    'party_affiliation': fields[CN_FIELDS['party_affiliation']].strip(),
                    'election_year': election_year,
                    'office_sought': fields[CN_FIELDS['office_sought']].strip(),
                    'state': fields[CN_FIELDS['state']].strip(),
                    'district': fields[CN_FIELDS['district']].strip(),
                    'incumbent_challenger_status': fields[CN_FIELDS['incumbent_challenger_status']].strip(),
                    'candidate_status': fields[CN_FIELDS['candidate_status']].strip(),
                    'principal_committee_id': fields[CN_FIELDS['principal_committee_id']].strip(),
                    'street_1': fields[CN_FIELDS['street_1']].strip(),
                    'street_2': fields[CN_FIELDS['street_2']].strip(),
                    'city': fields[CN_FIELDS['city']].strip(),
                    'zip': fields[CN_FIELDS['zip']].strip(),
                    'created_at': firestore.SERVER_TIMESTAMP,
                    'updated_at': firestore.SERVER_TIMESTAMP,
                }

                candidates.append(candidate_doc)

        print(f'✓ Parsed {len(candidates)} candidates from {line_count} lines')

    except Exception as e:
        print(f'✗ Error parsing {file_path.name}: {e}')

    return candidates

def parse_contribution_file(file_path: Path) -> List[Dict]:
    """Parse contributions file"""
    print(f'\n📄 Parsing: {file_path.name}')

    contributions = []
    line_count = 0

    try:
        with open(file_path, 'r', encoding='latin-1') as f:
            for line in f:
                line_count += 1
                fields = line.strip().split('|')

                # Skip invalid lines
                if len(fields) < max(PAS2_FIELDS.values()) + 1:
                    continue

                committee_id = fields[PAS2_FIELDS['committee_id']].strip()
                candidate_id = fields[PAS2_FIELDS['candidate_id']].strip()
                amount_str = fields[PAS2_FIELDS['transaction_amount']].strip()

                # Parse amount (convert to cents for precision)
                try:
                    amount = int(float(amount_str) * 100) if amount_str else 0
                except ValueError:
                    amount = 0

                # Build contribution document
                contribution_doc = {
                    'committee_id': committee_id,
                    'candidate_id': candidate_id,
                    'amendment_indicator': fields[PAS2_FIELDS['amendment_indicator']].strip(),
                    'report_type': fields[PAS2_FIELDS['report_type']].strip(),
                    'primary_general_indicator': fields[PAS2_FIELDS['primary_general_indicator']].strip(),
                    'image_number': fields[PAS2_FIELDS['image_number']].strip(),
                    'transaction_type': fields[PAS2_FIELDS['transaction_type']].strip(),
                    'entity_type': fields[PAS2_FIELDS['entity_type']].strip(),
                    'contributor_name': fields[PAS2_FIELDS['contributor_name']].strip(),
                    'city': fields[PAS2_FIELDS['city']].strip(),
                    'state': fields[PAS2_FIELDS['state']].strip(),
                    'zip': fields[PAS2_FIELDS['zip']].strip(),
                    'employer': fields[PAS2_FIELDS['employer']].strip(),
                    'occupation': fields[PAS2_FIELDS['occupation']].strip(),
                    'transaction_date': fields[PAS2_FIELDS['transaction_date']].strip(),
                    'transaction_amount': amount,
                    'other_id': fields[PAS2_FIELDS['other_id']].strip(),
                    'transaction_id': fields[PAS2_FIELDS['transaction_id']].strip(),
                    'file_number': fields[PAS2_FIELDS['file_number']].strip(),
                    'memo_code': fields[PAS2_FIELDS['memo_code']].strip(),
                    'memo_text': fields[PAS2_FIELDS['memo_text']].strip(),
                    'fec_record_number': fields[PAS2_FIELDS['fec_record_number']].strip(),
                    'created_at': firestore.SERVER_TIMESTAMP,
                }

                contributions.append(contribution_doc)

                # Log progress for large files
                if line_count % 10000 == 0:
                    print(f'  Processed {line_count} lines...')

        print(f'✓ Parsed {len(contributions)} contributions from {line_count} lines')

    except Exception as e:
        print(f'✗ Error parsing {file_path.name}: {e}')

    return contributions

def upload_to_firestore_batch(collection_name: str, documents: List[Dict], id_field: str):
    """
    Upload documents to Firestore in batches

    Args:
        collection_name: Name of the Firestore collection
        documents: List of document dictionaries
        id_field: Field name to use as document ID (None for auto-generated IDs)
    """
    print(f'\n📤 Uploading to {collection_name}...')

    if not documents:
        print('⊘ No documents to upload')
        return

    collection_ref = db.collection(collection_name)
    total_docs = len(documents)
    uploaded = 0

    # Process in batches
    for i in range(0, total_docs, BATCH_SIZE):
        batch = db.batch()
        batch_docs = documents[i:i + BATCH_SIZE]

        for doc in batch_docs:
            if id_field and id_field in doc:
                # Use specified field as document ID
                doc_id = doc[id_field]
                doc_ref = collection_ref.document(doc_id)
            else:
                # Auto-generate document ID
                doc_ref = collection_ref.document()

            batch.set(doc_ref, doc)

        # Commit batch
        try:
            batch.commit()
            uploaded += len(batch_docs)
            progress = (uploaded / total_docs) * 100
            print(f'  Progress: {uploaded}/{total_docs} ({progress:.1f}%)')
        except Exception as e:
            print(f'✗ Error uploading batch: {e}')

    print(f'✓ Uploaded {uploaded} documents to {collection_name}')

def build_company_index(company_to_committees: Dict[str, Set[str]]):
    """
    Build and upload company index for fuzzy matching

    Args:
        company_to_committees: Dictionary mapping normalized company names to committee IDs
    """
    print('\n🔍 Building company index...')

    index_docs = []

    for normalized_name, committee_ids in company_to_committees.items():
        search_keywords = extract_search_keywords(normalized_name)

        index_doc = {
            'normalized_name': normalized_name,
            'original_names': [normalized_name],  # Can be enhanced with variations
            'committee_ids': list(committee_ids),
            'search_keywords': search_keywords,
            'total_committees': len(committee_ids),
            'created_at': firestore.SERVER_TIMESTAMP,
            'updated_at': firestore.SERVER_TIMESTAMP,
        }

        index_docs.append(index_doc)

    print(f'✓ Built index for {len(index_docs)} companies')

    # Upload to Firestore
    upload_to_firestore_batch('fec_company_index', index_docs, 'normalized_name')

def main():
    """Main processing function"""
    print('\n' + '='*60)
    print('🔄 FEC Data Parser and Firebase Uploader')
    print('='*60 + '\n')

    # Initialize Firebase
    initialize_firebase()

    # Extract ZIP files
    extract_zip_files()

    # Parse all data files
    all_committees = []
    all_candidates = []
    all_contributions = []
    company_index = {}

    # Process committees
    for cm_file in sorted((DATA_DIR / 'committees').glob('cm*.txt')):
        committees, index = parse_committee_file(cm_file)
        all_committees.extend(committees)

        # Merge company indexes
        for company, committee_ids in index.items():
            if company in company_index:
                company_index[company].update(committee_ids)
            else:
                company_index[company] = committee_ids

    # Process candidates
    for cn_file in sorted((DATA_DIR / 'candidates').glob('cn*.txt')):
        candidates = parse_candidate_file(cn_file)
        all_candidates.extend(candidates)

    # Process contributions
    for pas2_file in sorted((DATA_DIR / 'contributions').glob('pas2*.txt')):
        contributions = parse_contribution_file(pas2_file)
        all_contributions.extend(contributions)

    # Upload to Firestore
    print('\n' + '='*60)
    print('📤 Uploading to Firebase Firestore')
    print('='*60)

    upload_to_firestore_batch('fec_committees', all_committees, 'committee_id')
    upload_to_firestore_batch('fec_candidates', all_candidates, 'candidate_id')
    upload_to_firestore_batch('fec_contributions', all_contributions, None)  # Auto-generate IDs
    build_company_index(company_index)

    # Print summary
    print('\n' + '='*60)
    print('✅ Upload Complete!')
    print('='*60)
    print(f'Committees:    {len(all_committees)}')
    print(f'Candidates:    {len(all_candidates)}')
    print(f'Contributions: {len(all_contributions)}')
    print(f'Companies:     {len(company_index)}')
    print('='*60 + '\n')

if __name__ == '__main__':
    main()
