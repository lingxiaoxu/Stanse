#!/usr/bin/env python3
"""
FEC Linkage Feasibility Verification

Tests whether CCL (Candidate-Committee Linkages) and ITOTH (Committee-to-Committee)
data can actually connect with existing Firebase data and improve donation accuracy.

This script verifies:
1. CCL data connectivity - Can we link candidates to multiple committees?
2. Multi-committee phenomenon - Do candidates actually have 2-3+ committees?
3. Data completeness improvement - How much missing donation data can we recover?
4. ITOTH name matching - Can we match committee names for indirect donations?

Firebase collections used:
- fec_raw_committees (cm data)
- fec_raw_candidates (cn data)
- fec_raw_contributions_pac_to_candidate (pas2 data)
"""

DATA_YEAR = '24'  # 可选: '16', '18', '20', '22', '24'

import os
import sys
import json
from pathlib import Path
from typing import Dict, List, Set, Tuple
from collections import defaultdict
import re

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    from google.cloud.firestore_v1.base_query import FieldFilter
except ImportError:
    print("❌ Error: firebase_admin not installed")
    print("Run: pip install firebase-admin")
    sys.exit(1)

# Initialize Firebase
def initialize_firebase():
    """Initialize Firebase Admin SDK"""
    if not firebase_admin._apps:
        # Use default credentials from environment
        cred = credentials.ApplicationDefault()
        firebase_admin.initialize_app(cred, {
            'projectId': 'stanse-21f36',
        })
    return firestore.client()

# Sample CCL data from user
CCL_SAMPLE = {
    'CAND_ID': 'H0AK00105',
    'CAND_ELECTION_YR': '2020',
    'FEC_ELECTION_YR': '2024',
    'CMTE_ID': 'C00607515',
    'CMTE_TP': 'H',
    'CMTE_DSGN': 'P',
    'LINKAGE_ID': '248736'
}

# Sample ITOTH data from user
ITOTH_SAMPLE = {
    'CMTE_ID': 'C00161067',
    'TRANSACTION_TP': '10J',
    'ENTITY_TP': 'ORG',
    'NAME': 'VINSON & ELKINS TEXAS PAC',
    'CITY': 'HOUSTON',
    'STATE': 'TX',
    'TRANSACTION_AMT': '10000'
}

def test_ccl_connectivity(db) -> Dict:
    """
    Test CCL data connectivity with Firebase

    Returns:
        Dict with connectivity test results
    """
    print("\n" + "="*70)
    print("🔗 TEST 1: CCL Data Connectivity")
    print("="*70)

    results = {
        'candidate_exists': False,
        'committee_exists': False,
        'contributions_exist': False,
        'candidate_data': None,
        'committee_data': None,
        'contribution_count': 0,
        'doable': False
    }

    cand_id = CCL_SAMPLE['CAND_ID']
    cmte_id = CCL_SAMPLE['CMTE_ID']

    # Test 1: Check if candidate exists in Firebase
    print(f"\n📋 Checking candidate {cand_id} in fec_raw_candidates...")
    candidates_ref = db.collection('fec_raw_candidates')
    candidate_query = candidates_ref.where(filter=FieldFilter('CAND_ID', '==', cand_id)).limit(1)
    candidate_docs = list(candidate_query.stream())

    if candidate_docs:
        results['candidate_exists'] = True
        results['candidate_data'] = candidate_docs[0].to_dict()
        print(f"✅ Candidate found: {results['candidate_data'].get('CAND_NAME', 'N/A')}")
        print(f"   Party: {results['candidate_data'].get('CAND_PTY_AFFILIATION', 'N/A')}")
        print(f"   Office: {results['candidate_data'].get('CAND_OFFICE', 'N/A')}")
    else:
        print(f"❌ Candidate {cand_id} not found in Firebase")

    # Test 2: Check if committee exists in Firebase
    print(f"\n📋 Checking committee {cmte_id} in fec_raw_committees...")
    committees_ref = db.collection('fec_raw_committees')
    committee_query = committees_ref.where(filter=FieldFilter('CMTE_ID', '==', cmte_id)).limit(1)
    committee_docs = list(committee_query.stream())

    if committee_docs:
        results['committee_exists'] = True
        results['committee_data'] = committee_docs[0].to_dict()
        print(f"✅ Committee found: {results['committee_data'].get('CMTE_NM', 'N/A')}")
        print(f"   Type: {results['committee_data'].get('CMTE_TP', 'N/A')}")
        print(f"   Connected org: {results['committee_data'].get('CONNECTED_ORG_NM', 'N/A')}")
    else:
        print(f"❌ Committee {cmte_id} not found in Firebase")

    # Test 3: Check if this committee has contribution records
    print(f"\n📋 Checking contributions from {cmte_id} in fec_raw_contributions_pac_to_candidate...")
    contributions_ref = db.collection(f'fec_raw_contributions_pac_to_candidate_{DATA_YEAR}')
    contributions_query = contributions_ref.where(filter=FieldFilter('CMTE_ID', '==', cmte_id)).limit(100)
    contribution_docs = list(contributions_query.stream())

    if contribution_docs:
        results['contributions_exist'] = True
        results['contribution_count'] = len(contribution_docs)
        print(f"✅ Found {len(contribution_docs)} contribution records from this committee")

        # Sample some contributions
        total_amount = 0
        unique_candidates = set()
        for doc in contribution_docs[:5]:
            data = doc.to_dict()
            total_amount += float(data.get('TRANSACTION_AMT', 0))
            unique_candidates.add(data.get('CAND_ID'))

        print(f"   Sample size: {min(5, len(contribution_docs))} records")
        print(f"   Total amount (sample): ${total_amount:,.2f}")
        print(f"   Unique candidates in sample: {len(unique_candidates)}")
    else:
        print(f"⚠️  No contribution records found for this committee")

    # Determine if CCL is doable
    results['doable'] = results['candidate_exists'] and results['committee_exists']

    print(f"\n🎯 CCL Connectivity Result: {'✅ DOABLE' if results['doable'] else '❌ NOT DOABLE'}")
    if results['doable']:
        print("   We can link candidates to committees using CCL data")

    return results

def test_multi_committee_phenomenon(db) -> Dict:
    """
    Test if candidates actually have multiple committees

    Returns:
        Dict with multi-committee analysis results
    """
    print("\n" + "="*70)
    print("🔍 TEST 2: Multi-Committee Phenomenon")
    print("="*70)

    results = {
        'candidates_tested': 0,
        'candidates_with_multiple_committees': 0,
        'max_committees_per_candidate': 0,
        'average_committees_per_candidate': 0,
        'sample_multi_committee_candidates': [],
        'doable': False
    }

    print("\n📋 Analyzing candidate-committee relationships in pas2 data...")
    print("   (Sampling first 1000 contribution records)")

    # Query contributions to find candidate-committee relationships
    contributions_ref = db.collection(f'fec_raw_contributions_pac_to_candidate_{DATA_YEAR}')
    contributions_query = contributions_ref.limit(1000)
    contribution_docs = list(contributions_query.stream())

    if not contribution_docs:
        print("❌ No contribution data found in Firebase")
        return results

    print(f"✅ Retrieved {len(contribution_docs)} contribution records")

    # Build candidate -> committees mapping
    candidate_committees = defaultdict(set)
    for doc in contribution_docs:
        data = doc.to_dict()
        cand_id = data.get('CAND_ID')
        cmte_id = data.get('CMTE_ID')
        if cand_id and cmte_id:
            candidate_committees[cand_id].add(cmte_id)

    results['candidates_tested'] = len(candidate_committees)

    # Analyze multi-committee phenomenon
    committee_counts = []
    for cand_id, committees in candidate_committees.items():
        num_committees = len(committees)
        committee_counts.append(num_committees)

        if num_committees > 1:
            results['candidates_with_multiple_committees'] += 1
            if len(results['sample_multi_committee_candidates']) < 5:
                results['sample_multi_committee_candidates'].append({
                    'cand_id': cand_id,
                    'num_committees': num_committees,
                    'committees': list(committees)
                })

    if committee_counts:
        results['max_committees_per_candidate'] = max(committee_counts)
        results['average_committees_per_candidate'] = sum(committee_counts) / len(committee_counts)

    # Calculate percentage
    if results['candidates_tested'] > 0:
        multi_committee_pct = (results['candidates_with_multiple_committees'] / results['candidates_tested']) * 100

        print(f"\n📊 Analysis Results:")
        print(f"   Total candidates analyzed: {results['candidates_tested']}")
        print(f"   Candidates with multiple committees: {results['candidates_with_multiple_committees']} ({multi_committee_pct:.1f}%)")
        print(f"   Max committees per candidate: {results['max_committees_per_candidate']}")
        print(f"   Average committees per candidate: {results['average_committees_per_candidate']:.2f}")

        # Show examples
        if results['sample_multi_committee_candidates']:
            print(f"\n📌 Sample Multi-Committee Candidates:")
            for example in results['sample_multi_committee_candidates'][:3]:
                print(f"   • {example['cand_id']}: {example['num_committees']} committees")
                for cmte_id in example['committees'][:3]:
                    print(f"     - {cmte_id}")

        # Determine if phenomenon exists
        results['doable'] = multi_committee_pct > 5  # If >5% have multiple committees, it's significant

        print(f"\n🎯 Multi-Committee Phenomenon: {'✅ CONFIRMED' if results['doable'] else '⚠️  LOW IMPACT'}")
        if results['doable']:
            print(f"   {multi_committee_pct:.1f}% of candidates have multiple committees")
            print("   CCL data will significantly improve donation tracking")
        else:
            print("   Multi-committee phenomenon is rare in current data sample")

    return results

def estimate_data_improvement(db, ccl_results: Dict, multi_committee_results: Dict) -> Dict:
    """
    Estimate how much CCL data improves donation completeness

    Returns:
        Dict with improvement estimates
    """
    print("\n" + "="*70)
    print("📈 TEST 3: Data Completeness Improvement Estimate")
    print("="*70)

    results = {
        'current_coverage': 0,
        'estimated_new_coverage': 0,
        'improvement_percentage': 0,
        'estimated_missing_donations': 0,
        'doable': False
    }

    if not multi_committee_results['candidates_tested']:
        print("❌ No multi-committee data to estimate improvement")
        return results

    # Calculate current vs potential coverage
    total_candidates = multi_committee_results['candidates_tested']
    multi_committee_candidates = multi_committee_results['candidates_with_multiple_committees']

    # Assume current system tracks 1 committee per candidate
    # CCL would track ALL committees per candidate
    current_coverage = 100  # We track 100% of candidates (but only 1 committee each)

    # Estimate additional donations we could capture
    avg_committees = multi_committee_results['average_committees_per_candidate']
    potential_coverage = current_coverage * avg_committees

    improvement = potential_coverage - current_coverage

    results['current_coverage'] = current_coverage
    results['estimated_new_coverage'] = potential_coverage
    results['improvement_percentage'] = improvement

    print(f"\n📊 Coverage Analysis:")
    print(f"   Current system: Tracks 1 committee per candidate (100% candidate coverage)")
    print(f"   With CCL data: Track {avg_committees:.2f} committees per candidate on average")
    print(f"   Estimated improvement: +{improvement:.1f}% more donation data")

    # Estimate missing donations based on sample
    if multi_committee_candidates > 0:
        missing_donation_rate = multi_committee_candidates / total_candidates
        results['estimated_missing_donations'] = int(missing_donation_rate * 100)

        print(f"\n💰 Missing Donations Estimate:")
        print(f"   {missing_donation_rate*100:.1f}% of candidates have donations we're missing")
        print(f"   Estimated {results['estimated_missing_donations']}% increase in tracked donations")

    results['doable'] = improvement > 10  # If we can improve by >10%, it's worth it

    print(f"\n🎯 Data Improvement: {'✅ SIGNIFICANT' if results['doable'] else '⚠️  MARGINAL'}")
    if results['doable']:
        print(f"   CCL implementation will capture {improvement:.1f}% more donation data")

    return results

def test_itoth_name_matching(db) -> Dict:
    """
    Test if ITOTH NAME field can match committee names in Firebase

    Returns:
        Dict with name matching feasibility results
    """
    print("\n" + "="*70)
    print("🔤 TEST 4: ITOTH Name Matching Feasibility")
    print("="*70)

    results = {
        'sample_name': ITOTH_SAMPLE['NAME'],
        'exact_match_found': False,
        'fuzzy_matches_found': 0,
        'matched_committees': [],
        'doable': False
    }

    sample_name = ITOTH_SAMPLE['NAME']
    print(f"\n📋 Testing name matching for: '{sample_name}'")

    # Normalize name for matching
    def normalize_name(name: str) -> str:
        """Normalize committee name for fuzzy matching"""
        if not name:
            return ""
        # Remove common suffixes/prefixes
        name = re.sub(r'\b(PAC|COMMITTEE|FUND|INC|LLC|CORP)\b', '', name, flags=re.IGNORECASE)
        # Remove special characters
        name = re.sub(r'[^\w\s]', '', name)
        # Normalize whitespace
        name = ' '.join(name.split())
        return name.upper()

    normalized_sample = normalize_name(sample_name)
    print(f"   Normalized: '{normalized_sample}'")

    # Query committees from Firebase
    print(f"\n📋 Querying fec_raw_committees for matching names...")
    committees_ref = db.collection('fec_raw_committees')

    # Try exact match first
    exact_query = committees_ref.where(filter=FieldFilter('CMTE_NM', '==', sample_name)).limit(5)
    exact_docs = list(exact_query.stream())

    if exact_docs:
        results['exact_match_found'] = True
        print(f"✅ Found {len(exact_docs)} exact matches!")
        for doc in exact_docs:
            data = doc.to_dict()
            results['matched_committees'].append({
                'cmte_id': data.get('CMTE_ID'),
                'name': data.get('CMTE_NM'),
                'match_type': 'exact'
            })
            print(f"   • {data.get('CMTE_ID')}: {data.get('CMTE_NM')}")
    else:
        print(f"⚠️  No exact matches found")

    # Try fuzzy matching on a sample of committees
    print(f"\n📋 Testing fuzzy matching (sampling 100 committees)...")
    sample_query = committees_ref.limit(100)
    sample_docs = list(sample_query.stream())

    fuzzy_matches = []
    for doc in sample_docs:
        data = doc.to_dict()
        cmte_name = data.get('CMTE_NM', '')
        normalized_cmte = normalize_name(cmte_name)

        # Check if normalized names contain each other
        if normalized_sample and normalized_cmte:
            if normalized_sample in normalized_cmte or normalized_cmte in normalized_sample:
                fuzzy_matches.append({
                    'cmte_id': data.get('CMTE_ID'),
                    'name': cmte_name,
                    'normalized': normalized_cmte,
                    'match_type': 'fuzzy'
                })

    results['fuzzy_matches_found'] = len(fuzzy_matches)
    results['matched_committees'].extend(fuzzy_matches[:3])

    if fuzzy_matches:
        print(f"✅ Found {len(fuzzy_matches)} fuzzy matches in sample")
        for match in fuzzy_matches[:3]:
            print(f"   • {match['cmte_id']}: {match['name']}")
            print(f"     Normalized: '{match['normalized']}'")
    else:
        print(f"⚠️  No fuzzy matches found in sample")

    # Determine feasibility
    results['doable'] = results['exact_match_found'] or results['fuzzy_matches_found'] > 0

    print(f"\n🎯 ITOTH Name Matching: {'✅ FEASIBLE' if results['doable'] else '❌ CHALLENGING'}")
    if results['doable']:
        if results['exact_match_found']:
            print("   Exact matching is possible")
        else:
            print("   Fuzzy matching is feasible with normalization")
        print("   ITOTH implementation can track indirect donations")
    else:
        print("   Name matching may require additional data sources")
        print("   Consider using OTHER_ID field for direct committee linkage")

    return results

def main():
    """Main verification function"""
    print("\n" + "="*70)
    print("🔍 FEC Linkage Feasibility Verification")
    print("="*70)
    print("\nTesting if CCL and ITOTH data can improve donation tracking accuracy")
    print("Using real Firebase data: cm, cn, pas2 collections")

    # Initialize Firebase
    try:
        db = initialize_firebase()
        print("\n✅ Connected to Firebase")
    except Exception as e:
        print(f"\n❌ Firebase connection failed: {e}")
        print("Ensure GOOGLE_APPLICATION_CREDENTIALS is set")
        return 1

    # Run all tests
    try:
        # Test 1: CCL Connectivity
        ccl_results = test_ccl_connectivity(db)

        # Test 2: Multi-Committee Phenomenon
        multi_committee_results = test_multi_committee_phenomenon(db)

        # Test 3: Data Improvement Estimate
        improvement_results = estimate_data_improvement(db, ccl_results, multi_committee_results)

        # Test 4: ITOTH Name Matching
        itoth_results = test_itoth_name_matching(db)

        # Final summary
        print("\n" + "="*70)
        print("📋 FINAL VERDICT")
        print("="*70)

        ccl_doable = ccl_results['doable'] and multi_committee_results['doable'] and improvement_results['doable']
        itoth_doable = itoth_results['doable']

        print(f"\n🎯 CCL Implementation: {'✅ DOABLE & RECOMMENDED' if ccl_doable else '⚠️  LIMITED VALUE'}")
        if ccl_doable:
            print(f"   • Can link candidates to multiple committees")
            print(f"   • {multi_committee_results['candidates_with_multiple_committees']} / {multi_committee_results['candidates_tested']} candidates have multiple committees")
            print(f"   • Estimated {improvement_results['improvement_percentage']:.1f}% improvement in donation coverage")
            print(f"   • High priority implementation")

        print(f"\n🎯 ITOTH Implementation: {'✅ FEASIBLE' if itoth_doable else '⚠️  CHALLENGING'}")
        if itoth_doable:
            print(f"   • Name matching is {'exact' if itoth_results['exact_match_found'] else 'fuzzy'}")
            print(f"   • Can track indirect donation paths")
            print(f"   • Medium priority implementation")
        else:
            print(f"   • Name matching requires additional work")
            print(f"   • Consider alternative approaches (OTHER_ID field)")

        print("\n" + "="*70)

        # Detailed recommendations
        print(f"\n📌 RECOMMENDATIONS:")
        print(f"\n1. CCL Implementation:")
        if ccl_doable:
            print(f"   ✅ START IMMEDIATELY - High impact on data completeness")
            print(f"   • Download CCL files for years 2016-2024")
            print(f"   • Create fec_raw_candidate_committee_linkages collection")
            print(f"   • Update donation tracking to check ALL linked committees")
        else:
            print(f"   ⚠️  WAIT - Need more data analysis")

        print(f"\n2. ITOTH Implementation:")
        if itoth_doable:
            print(f"   ✅ PLAN FOR PHASE 2 - Adds indirect donation tracking")
            print(f"   • Develop robust name matching algorithm")
            print(f"   • Test with real committee transfers")
            print(f"   • Implement after CCL is working")
        else:
            print(f"   ⚠️  RESEARCH NEEDED - Explore alternative linking methods")

        print("\n" + "="*70 + "\n")

        return 0

    except Exception as e:
        print(f"\n❌ Verification failed: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == '__main__':
    sys.exit(main())
