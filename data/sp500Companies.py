#!/usr/bin/env python3
"""
SP500 Companies Data - Single Source of Truth

This module loads SP500 company data from sp500Data.json to ensure
consistency between TypeScript and Python code.

Usage:
    from data.sp500Companies import SP500_TICKERS, TICKER_TO_SECTOR, get_company_sector

Author: Claude Code
Date: 2026-01-02
"""

import json
import os
from typing import List, Dict, Optional

# ============================================================================
# LOAD DATA FROM JSON
# ============================================================================

# Get the directory where this script is located
_current_dir = os.path.dirname(os.path.abspath(__file__))
_data_file = os.path.join(_current_dir, 'sp500Data.json')

# Load SP500 data
try:
    with open(_data_file, 'r', encoding='utf-8') as f:
        _sp500_data = json.load(f)
except FileNotFoundError:
    raise FileNotFoundError(
        f"sp500Data.json not found at {_data_file}. "
        "Please ensure the file exists in the data/ directory."
    )
except json.JSONDecodeError as e:
    raise ValueError(f"Invalid JSON in sp500Data.json: {e}")

# ============================================================================
# EXPORTED CONSTANTS
# ============================================================================

# List of all S&P 500 ticker symbols
SP500_TICKERS: List[str] = [c['symbol'] for c in _sp500_data['companies']]

# Mapping from ticker symbol to sector
TICKER_TO_SECTOR: Dict[str, str] = {
    c['symbol']: c['sector']
    for c in _sp500_data['companies']
}

# Mapping from ticker symbol to company name
TICKER_TO_NAME: Dict[str, str] = {
    c['symbol']: c['name']
    for c in _sp500_data['companies']
}

# Full company data (list of dicts with symbol, name, sector)
SP500_COMPANIES: List[Dict[str, str]] = _sp500_data['companies']

# Metadata
__version__ = _sp500_data['version']
__total_count__ = len(SP500_TICKERS)
__last_updated__ = _sp500_data['lastUpdated']

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_company_sector(ticker: str) -> str:
    """
    Get the sector for a given ticker symbol.

    Args:
        ticker: Stock ticker symbol (e.g., 'AAPL')

    Returns:
        Sector name (e.g., 'Technology') or 'Unknown' if not found
    """
    return TICKER_TO_SECTOR.get(ticker, 'Unknown')


def get_company_name(ticker: str) -> Optional[str]:
    """
    Get the company name for a given ticker symbol.

    Args:
        ticker: Stock ticker symbol (e.g., 'AAPL')

    Returns:
        Company name (e.g., 'Apple Inc') or None if not found
    """
    return TICKER_TO_NAME.get(ticker)


def get_company_info(ticker: str) -> Optional[Dict[str, str]]:
    """
    Get complete company information for a given ticker.

    Args:
        ticker: Stock ticker symbol (e.g., 'AAPL')

    Returns:
        Dict with 'symbol', 'name', 'sector' or None if not found
    """
    for company in SP500_COMPANIES:
        if company['symbol'] == ticker:
            return company
    return None


def get_all_tickers() -> List[str]:
    """Get a copy of all ticker symbols."""
    return SP500_TICKERS.copy()


def get_all_sectors() -> List[str]:
    """Get a list of all unique sectors."""
    return list(set(TICKER_TO_SECTOR.values()))


def get_companies_by_sector(sector: str) -> List[Dict[str, str]]:
    """
    Get all companies in a specific sector.

    Args:
        sector: Sector name (e.g., 'Technology')

    Returns:
        List of company dicts matching the sector
    """
    return [c for c in SP500_COMPANIES if c['sector'] == sector]


def is_valid_ticker(ticker: str) -> bool:
    """
    Check if a ticker symbol is in the SP500 list.

    Args:
        ticker: Stock ticker symbol

    Returns:
        True if ticker is valid, False otherwise
    """
    return ticker in TICKER_TO_SECTOR


# ============================================================================
# MODULE INITIALIZATION CHECK
# ============================================================================

if __name__ == '__main__':
    # Self-test when run directly
    print(f"SP500 Companies Data Module")
    print(f"{'='*60}")
    print(f"Version: {__version__}")
    print(f"Last Updated: {__last_updated__}")
    print(f"Total Companies: {__total_count__}")
    print(f"")
    print(f"Sectors:")
    for sector in sorted(get_all_sectors()):
        count = len(get_companies_by_sector(sector))
        print(f"  - {sector}: {count} companies")
    print(f"")
    print(f"Sample companies:")
    for company in SP500_COMPANIES[:5]:
        print(f"  - {company['symbol']}: {company['name']} ({company['sector']})")
    print(f"{'='*60}")
