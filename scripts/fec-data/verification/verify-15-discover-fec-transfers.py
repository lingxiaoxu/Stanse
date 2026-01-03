#!/usr/bin/env python3
"""
FEC Transfer & Linkage Discovery Script (Phase 1 - Read-Only)

This script discovers PAC committees and transfer data for companies WITHOUT modifying
existing fec_company_index or fec_company_name_variants collections.

Purpose:
    - Query fec_linkage to find committee IDs for tickers
    - Query fec_transfers to get PAC donation data
    - Save discoveries to temporary collection for human review
    - Generate discovery report

Usage:
    python3 05-discover-fec-transfers.py

Collections:
    - Read: fec_linkage, fec_transfers, fec_committee_master
    - Write: fec_discovery_temp (temporary collection for review)
    - No modifications to: fec_company_index, fec_company_name_variants

Test Companies: AAPL, MSFT, GOOGL
"""

import sys
import os
from datetime import datetime
from typing import Dict, List, Any, Optional
from collections import defaultdict
import json

# Add project root to path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(SCRIPT_DIR, '../..'))

# Firebase Admin
import firebase_admin
from firebase_admin import credentials, firestore

# Initialize Firebase
if not firebase_admin._apps:
    cred = credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred, {
        'projectId': 'stanseproject'
    })

db = firestore.client()

# ============================================================================
# Configuration
# ============================================================================

# Test companies for Phase 1 discovery
TEST_TICKERS = ['AAPL', 'MSFT', 'GOOGL']

# Company name variations for matching
COMPANY_VARIATIONS = {
    'AAPL': ['APPLE', 'APPLE INC', 'APPLE COMPUTER'],
    'MSFT': ['MICROSOFT', 'MICROSOFT CORP', 'MICROSOFT CORPORATION'],
    'GOOGL': ['GOOGLE', 'ALPHABET', 'ALPHABET INC', 'GOOGLE INC']
}

# Committee types to include
VALID_COMMITTEE_TYPES = ['Q', 'N']  # Q = PAC, N = Non-party committee

# ============================================================================
# Discovery Engine
# ============================================================================

class FECDiscoveryEngine:
    """Discovers PAC committees and transfer data for companies"""

    def __init__(self):
        self.db = db
        print(f"✅ Firebase initialized (project: stanseproject)")
        print(f"🔍 Discovery mode: READ-ONLY")
        print(f"📦 Collections to query: fec_raw_committees, fec_raw_transfers")
        print(f"💾 Output collection: fec_discovery_temp")

    def normalize_name(self, name: str) -> str:
        """Normalize company/committee name for matching"""
        if not name:
            return ""
        return name.upper().strip().replace('.', '').replace(',', '')

    def find_committees_for_ticker(self, ticker: str) -> List[Dict[str, Any]]:
        """
        Find committee IDs associated with a ticker by searching fec_raw_committees

        Strategy:
            1. Get company name variations for ticker
            2. Query fec_raw_committees for PACs with matching connected_org_name
            3. Filter by committee type (PAC, etc.)
            4. Return list of committees with metadata

        Returns:
            List of committee dictionaries with:
                - cmte_id
                - cmte_nm
                - cmte_type
                - connected_org
                - confidence (matching score)
                - year
        """
        variations = COMPANY_VARIATIONS.get(ticker, [ticker])
        print(f"\n  🔍 Searching committees for: {variations}")

        committees = []
        seen_ids = set()

        for variation in variations:
            normalized_variation = self.normalize_name(variation)

            # Query fec_raw_committees collection
            # connected_org_name field contains the company name
            committee_docs = self.db.collection('fec_raw_committees').where(
                filter=firestore.FieldFilter('connected_org_name', '>=', variation)
            ).where(
                filter=firestore.FieldFilter('connected_org_name', '<=', variation + '\uf8ff')
            ).stream()

            for doc in committee_docs:
                data = doc.to_dict()
                cmte_id = data.get('committee_id', '')
                cmte_type = data.get('committee_type', '')

                # Skip if already seen or not valid type
                if cmte_id in seen_ids or cmte_type not in VALID_COMMITTEE_TYPES:
                    continue

                seen_ids.add(cmte_id)

                # Calculate confidence based on name matching
                connected_org = data.get('connected_org_name', '')
                normalized_org = self.normalize_name(connected_org)

                confidence = 0.0
                if normalized_org == normalized_variation:
                    confidence = 1.0
                elif normalized_variation in normalized_org:
                    confidence = 0.8
                elif any(v in normalized_org for v in [self.normalize_name(v) for v in variations]):
                    confidence = 0.6

                committees.append({
                    'cmte_id': cmte_id,
                    'cmte_nm': data.get('committee_name', ''),
                    'cmte_type': cmte_type,
                    'connected_org': connected_org,
                    'confidence': confidence,
                    'year': data.get('data_year', 2024),
                    'source': 'fec_raw_committees'
                })

        # Sort by confidence descending
        committees.sort(key=lambda x: x['confidence'], reverse=True)

        print(f"  ✅ Found {len(committees)} committees")
        for cmte in committees[:3]:  # Show top 3
            print(f"     - {cmte['cmte_id']}: {cmte['cmte_nm']} (confidence: {cmte['confidence']:.2f})")

        return committees

    def find_transfers_for_committee(self, cmte_id: str) -> Dict[str, Any]:
        """
        Find all transfers from a committee to candidates/parties

        Strategy:
            1. Query fec_transfers where cmte_id = donor committee
            2. Group by recipient party (DEM, REP, IND, OTH)
            3. Sum transaction amounts by party

        Returns:
            Dictionary with:
                - party_totals: {DEM: {...}, REP: {...}}
                - total_usd: total amount
                - transaction_count: number of transactions
        """
        print(f"  🔍 Querying transfers for committee: {cmte_id}")

        party_totals = defaultdict(lambda: {'total_amount': 0, 'count': 0})
        total_amount = 0
        transaction_count = 0

        # Query fec_raw_transfers where this committee is the donor
        transfer_docs = self.db.collection('fec_raw_transfers').where(
            filter=firestore.FieldFilter('cmte_id', '==', cmte_id)
        ).stream()

        for doc in transfer_docs:
            data = doc.to_dict()

            # Get transaction amount
            amt = data.get('transaction_amt', 0)
            if not isinstance(amt, (int, float)):
                continue

            # Get recipient committee ID
            other_id = data.get('other_id', '')

            # Look up recipient party (need to query fec_committee_master or infer)
            # For now, we'll try to infer from transaction type
            # 24K = Direct contribution to candidate
            # 24E = Independent expenditure
            transaction_type = data.get('transaction_tp', '')

            # Simple heuristic: query recipient committee to get party
            party = self._get_committee_party(other_id)

            if party in ['DEM', 'REP', 'IND', 'OTH']:
                party_totals[party]['total_amount'] += amt
                party_totals[party]['count'] += 1
                total_amount += amt
                transaction_count += 1

        print(f"  ✅ Found {transaction_count} transfers totaling ${total_amount:,.0f}")

        return {
            'party_totals': dict(party_totals),
            'total_usd': total_amount,
            'transaction_count': transaction_count,
            'cmte_id': cmte_id
        }

    def _get_committee_party(self, cmte_id: str) -> str:
        """
        Get party affiliation for a committee

        Strategy:
            1. Query fec_committee_master for committee info
            2. Extract party from cmte_pty field
            3. Map to standard party codes (DEM, REP, IND, OTH)

        Note: This is cached in memory for performance
        """
        if not hasattr(self, '_party_cache'):
            self._party_cache = {}

        if cmte_id in self._party_cache:
            return self._party_cache[cmte_id]

        # Query committee master for party info
        try:
            # Try fec_linkage first (faster)
            linkage_doc = self.db.collection('fec_linkage').where(
                filter=firestore.FieldFilter('cmteId', '==', cmte_id)
            ).limit(1).stream()

            for doc in linkage_doc:
                data = doc.to_dict()
                cand_pty = data.get('candPty', '')

                # Map party codes
                party = 'OTH'
                if cand_pty in ['DEM', 'D']:
                    party = 'DEM'
                elif cand_pty in ['REP', 'R']:
                    party = 'REP'
                elif cand_pty in ['IND', 'I']:
                    party = 'IND'

                self._party_cache[cmte_id] = party
                return party

        except Exception as e:
            pass

        # Default to OTH if not found
        self._party_cache[cmte_id] = 'OTH'
        return 'OTH'

    def discover_ticker(self, ticker: str) -> Dict[str, Any]:
        """
        Run complete discovery for a single ticker

        Returns:
            Discovery result with committees and transfer data
        """
        print(f"\n{'='*60}")
        print(f"🔍 Discovering: {ticker}")
        print(f"{'='*60}")

        # Step 1: Find committees
        committees = self.find_committees_for_ticker(ticker)

        if not committees:
            print(f"  ⚠️  No committees found for {ticker}")
            return {
                'ticker': ticker,
                'status': 'no_committees_found',
                'committees': [],
                'pac_transfers': None,
                'discovered_at': datetime.now().isoformat()
            }

        # Step 2: Get transfers for each committee
        all_transfers = []
        combined_party_totals = defaultdict(lambda: {'total_amount': 0, 'count': 0})
        combined_total = 0

        for cmte in committees:
            if cmte['confidence'] >= 0.6:  # Only high-confidence matches
                transfers = self.find_transfers_for_committee(cmte['cmte_id'])

                if transfers['transaction_count'] > 0:
                    all_transfers.append(transfers)

                    # Aggregate party totals
                    for party, data in transfers['party_totals'].items():
                        combined_party_totals[party]['total_amount'] += data['total_amount']
                        combined_party_totals[party]['count'] += data['count']
                        combined_total += data['total_amount']

        # Step 3: Build discovery result
        result = {
            'ticker': ticker,
            'status': 'discovered',
            'committees': committees,
            'pac_transfers': {
                'party_totals': dict(combined_party_totals),
                'total_usd': combined_total,
                'transaction_count': sum(t['transaction_count'] for t in all_transfers),
                'committee_count': len(all_transfers)
            },
            'discovered_variants': [c['cmte_nm'] for c in committees],
            'discovered_at': datetime.now().isoformat()
        }

        print(f"\n  📊 Discovery Summary:")
        print(f"     Committees found: {len(committees)}")
        print(f"     PAC transfers: ${combined_total:,.0f}")
        if combined_party_totals:
            print(f"     DEM: ${combined_party_totals.get('DEM', {}).get('total_amount', 0):,.0f}")
            print(f"     REP: ${combined_party_totals.get('REP', {}).get('total_amount', 0):,.0f}")

        return result

    def save_discovery(self, ticker: str, discovery: Dict[str, Any]):
        """
        Save discovery results to fec_discovery_temp collection

        This is a TEMPORARY collection for human review.
        Does NOT modify production collections.
        """
        doc_ref = self.db.collection('fec_discovery_temp').document(ticker)
        doc_ref.set(discovery)
        print(f"  💾 Saved to fec_discovery_temp/{ticker}")

    def run(self):
        """Run discovery for all test tickers"""
        start_time = datetime.now()

        print(f"\n{'='*60}")
        print(f"🧪 FEC Transfer & Linkage Discovery - Phase 1")
        print(f"{'='*60}")
        print(f"📦 Test tickers: {', '.join(TEST_TICKERS)}")
        print(f"🔒 Mode: READ-ONLY (no production data modified)")
        print(f"🕒 Started at: {start_time.strftime('%Y-%m-%d %H:%M:%S')}")

        discoveries = {}

        for ticker in TEST_TICKERS:
            try:
                discovery = self.discover_ticker(ticker)
                self.save_discovery(ticker, discovery)
                discoveries[ticker] = discovery

            except Exception as e:
                print(f"\n  ❌ Error discovering {ticker}: {str(e)}")
                import traceback
                traceback.print_exc()

        # Generate discovery report
        self.generate_report(discoveries)

        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()

        print(f"\n{'='*60}")
        print(f"✅ Discovery Complete")
        print(f"{'='*60}")
        print(f"🕒 Duration: {duration:.1f} seconds")
        print(f"📊 Results saved to: fec_discovery_temp collection")
        print(f"📄 Report saved to: ../reports/16-fec-discovery-report.json")
        print(f"\n⚠️  NEXT STEP: Human review of discoveries before Phase 2")
        print(f"{'='*60}\n")

    def generate_report(self, discoveries: Dict[str, Any]):
        """Generate human-readable discovery report"""
        report = {
            'generated_at': datetime.now().isoformat(),
            'phase': 'Phase 1 - Discovery',
            'test_tickers': TEST_TICKERS,
            'summary': {
                'total_tickers': len(TEST_TICKERS),
                'found_committees': sum(1 for d in discoveries.values() if d.get('committees')),
                'found_transfers': sum(1 for d in discoveries.values() if d.get('pac_transfers') and d.get('pac_transfers').get('transaction_count', 0) > 0)
            },
            'discoveries': discoveries,
            'next_steps': [
                "Review fec_discovery_temp collection in Firebase console",
                "Validate committee → ticker mappings",
                "Check for conflicts with existing fec_company_index",
                "Approve verified mappings for Phase 2"
            ]
        }

        # Save to file
        report_path = os.path.join(os.path.dirname(SCRIPT_DIR), 'reports', '16-fec-discovery-report.json')
        with open(report_path, 'w') as f:
            json.dump(report, f, indent=2)

        print(f"\n📄 Discovery Report:")
        print(f"   Tickers processed: {report['summary']['total_tickers']}")
        print(f"   Committees found: {report['summary']['found_committees']}")
        print(f"   Transfers found: {report['summary']['found_transfers']}")
        print(f"\n   Saved to: {report_path}")


# ============================================================================
# Main
# ============================================================================

def main():
    engine = FECDiscoveryEngine()
    engine.run()


if __name__ == "__main__":
    main()
