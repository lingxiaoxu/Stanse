#!/usr/bin/env python3
"""
Fix the 11 missing companies with '/' in their normalized names

These companies exist in PAC data but were skipped during consolidated build
because the document IDs were sanitized (/ replaced with -)
"""

import sys
import os

# Add project root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')))

import firebase_admin
from firebase_admin import credentials, firestore
from collections import defaultdict

# Initialize Firebase
if not firebase_admin._apps:
    cred = credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred, {'projectId': 'stanseproject'})

db = firestore.client()

def merge_party_totals(pt1, pt2):
    """Merge two party_totals dictionaries"""
    merged = defaultdict(lambda: {'total_amount': 0, 'contribution_count': 0})
    for party, data in (pt1 or {}).items():
        merged[party]['total_amount'] += data.get('total_amount', 0)
        merged[party]['contribution_count'] += data.get('contribution_count', 0)
    for party, data in (pt2 or {}).items():
        merged[party]['total_amount'] += data.get('total_amount', 0)
        merged[party]['contribution_count'] += data.get('contribution_count', 0)
    return dict(merged)

def process_company(normalized_name: str, year: int = 2024):
    """Process a single company with / in its name"""
    print(f'\nProcessing: {normalized_name}')

    # Get linkage data (will fail for companies with '/' in name)
    linkage_data = None
    try:
        linkage_doc_id = f'{normalized_name}_{year}'
        linkage_ref = db.collection('fec_company_party_summary').document(linkage_doc_id)
        linkage_snap = linkage_ref.get()
        linkage_data = linkage_snap.to_dict() if linkage_snap.exists else None
    except Exception as e:
        # Document ID contains '/', which is invalid for Firestore
        # This company only exists in PAC collection
        print(f'  ℹ️  Cannot query linkage collection (invalid document ID): {e}')
        linkage_data = None

    # Get PAC data (with sanitized ID)
    pac_doc_id = f'{normalized_name.replace("/", "-")}_{year}'
    pac_ref = db.collection('fec_company_pac_transfers_summary').document(pac_doc_id)
    pac_snap = pac_ref.get()
    pac_data = pac_snap.to_dict() if pac_snap.exists else None

    if not linkage_data and not pac_data:
        print(f'  ❌ No data found in either collection')
        return False

    # Build consolidated record
    company_name = None
    if linkage_data:
        company_name = linkage_data.get('company_name')
    if not company_name and pac_data:
        company_name = pac_data.get('company_name')
    if not company_name:
        company_name = normalized_name.upper()

    linkage_party_totals = linkage_data.get('party_totals', {}) if linkage_data else {}
    pac_party_totals = pac_data.get('party_totals', {}) if pac_data else {}
    merged_party_totals = merge_party_totals(linkage_party_totals, pac_party_totals)

    linkage_total = linkage_data.get('total_contributed', 0) if linkage_data else 0
    pac_total = pac_data.get('total_contributed', 0) if pac_data else 0
    total_contributed = linkage_total + pac_total

    data_sources = []
    if linkage_data:
        data_sources.append('linkage')
    if pac_data:
        data_sources.append('pac_transfers')

    pac_committees = pac_data.get('committees', []) if pac_data else []

    consolidated = {
        'normalized_name': normalized_name,
        'company_name': company_name,
        'data_year': year,
        'total_contributed': total_contributed,
        'party_totals': merged_party_totals,
        'created_at': linkage_data.get('created_at') if linkage_data else firestore.SERVER_TIMESTAMP,
        'last_updated': firestore.SERVER_TIMESTAMP,
        'data_sources': data_sources,
        'linkage_total': linkage_total,
        'pac_transfer_total': pac_total,
        'has_linkage_data': bool(linkage_data),
        'has_pac_data': bool(pac_data),
        'pac_committees': pac_committees,
    }

    # Save with sanitized doc ID
    cons_doc_id = f'{normalized_name.replace("/", "-")}_{year}'
    cons_ref = db.collection('fec_company_consolidated').document(cons_doc_id)
    cons_ref.set(consolidated, merge=False)

    total_usd = total_contributed / 100.0
    print(f'  ✅ Saved: ${total_usd:,.2f} (sources: {", ".join(data_sources)})')
    return True

def main():
    print('=' * 70)
    print('🔧 Fixing Companies with "/" in Normalized Names')
    print('=' * 70)

    # Find all companies with / in their names from both collections
    print('\n📂 Finding companies with "/" in their names...')

    slash_companies = set()

    # Check PAC collection
    pac_query = db.collection('fec_company_pac_transfers_summary').where(
        filter=firestore.FieldFilter('data_year', '==', 2024)
    )
    for doc in pac_query.stream():
        data = doc.to_dict()
        normalized_name = data.get('normalized_name', '')
        if '/' in normalized_name:
            slash_companies.add(normalized_name)

    print(f'  Found {len(slash_companies)} companies with "/" in their names\n')

    # Process each company
    success_count = 0
    for i, company in enumerate(sorted(slash_companies), 1):
        print(f'[{i}/{len(slash_companies)}] {company}')
        try:
            if process_company(company):
                success_count += 1
        except Exception as e:
            print(f'  ❌ Error: {e}')

    print('\n' + '=' * 70)
    print(f'✅ Successfully processed {success_count}/{len(slash_companies)} companies')
    print('=' * 70)

if __name__ == '__main__':
    main()
