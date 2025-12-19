#!/usr/bin/env python3
"""
FEC Data Downloader

Downloads bulk data files from the Federal Election Commission (FEC) website.
Data source: https://www.fec.gov/data/browse-data/?tab=bulk-data

This script downloads:
- Committee Master files (cm) - PAC information and company connections
- Candidate Master files (cn) - candidate party affiliations
- Committee-to-Candidate contributions (pas2) - PAC contributions to candidates
- Candidate-Committee Linkages (ccl) - Maps candidates to ALL their committees
- Committee-to-Committee transactions (oth) - Indirect donation paths
- Header/description files for each category
"""

import os
import sys
import time
import requests
from pathlib import Path
from typing import List, Dict

# Configuration
BASE_URL = 'https://www.fec.gov/files/bulk-downloads'
DATA_DIR = Path(__file__).parent.parent / 'raw_data'

# Years to download (FEC uses even year of cycle)
# Format: (folder_year, file_suffix, description)
YEARS_TO_DOWNLOAD = [
    ('2024', '24', '2023-2024'),
    ('2022', '22', '2021-2022'),
    ('2020', '20', '2019-2020'),
    ('2018', '18', '2017-2018'),
    ('2016', '16', '2015-2016'),
]

# File definitions
class DataFile:
    def __init__(self, category: str, filename: str, url: str, description: str = ''):
        self.category = category
        self.filename = filename
        self.url = url
        self.description = description

def get_files_to_download() -> List[DataFile]:
    """Generate list of all files to download"""
    files = []

    # Committee Master files - Contains PAC information and company connections
    for folder, suffix, desc in YEARS_TO_DOWNLOAD:
        files.append(DataFile(
            category='committees',
            filename=f'cm{suffix}.zip',
            url=f'{BASE_URL}/{folder}/cm{suffix}.zip',
            description=f'Committee Master data for {desc}'
        ))

    # Candidate Master files - Contains candidate party affiliations
    for folder, suffix, desc in YEARS_TO_DOWNLOAD:
        files.append(DataFile(
            category='candidates',
            filename=f'cn{suffix}.zip',
            url=f'{BASE_URL}/{folder}/cn{suffix}.zip',
            description=f'Candidate Master data for {desc}'
        ))

    # Committee to Candidate Contributions - PAC contributions to candidates
    for folder, suffix, desc in YEARS_TO_DOWNLOAD:
        files.append(DataFile(
            category='contributions',
            filename=f'pas2{suffix}.zip',
            url=f'{BASE_URL}/{folder}/pas2{suffix}.zip',
            description=f'Committee-to-Candidate contributions for {desc}'
        ))

    # Candidate-Committee Linkages - Maps candidates to ALL their committees
    for folder, suffix, desc in YEARS_TO_DOWNLOAD:
        files.append(DataFile(
            category='linkages',
            filename=f'ccl{suffix}.zip',
            url=f'{BASE_URL}/{folder}/ccl{suffix}.zip',
            description=f'Candidate-Committee linkages for {desc}'
        ))

    # Committee-to-Committee transactions - Indirect donation paths
    for folder, suffix, desc in YEARS_TO_DOWNLOAD:
        files.append(DataFile(
            category='transfers',
            filename=f'oth{suffix}.zip',
            url=f'{BASE_URL}/{folder}/oth{suffix}.zip',
            description=f'Committee-to-Committee transactions for {desc}'
        ))

    # Description/header files (located in data_dictionaries subdirectory)
    dict_base_url = f'{BASE_URL}/data_dictionaries'
    files.extend([
        DataFile(
            category='descriptions',
            filename='cm_header_file.csv',
            url=f'{dict_base_url}/cm_header_file.csv',
            description='Committee Master data dictionary'
        ),
        DataFile(
            category='descriptions',
            filename='cn_header_file.csv',
            url=f'{dict_base_url}/cn_header_file.csv',
            description='Candidate Master data dictionary'
        ),
        DataFile(
            category='descriptions',
            filename='pas2_header_file.csv',
            url=f'{dict_base_url}/pas2_header_file.csv',
            description='Contributions data dictionary'
        ),
        DataFile(
            category='descriptions',
            filename='ccl_header_file.csv',
            url=f'{dict_base_url}/ccl_header_file.csv',
            description='Candidate-Committee linkages data dictionary'
        ),
        DataFile(
            category='descriptions',
            filename='oth_header_file.csv',
            url=f'{dict_base_url}/oth_header_file.csv',
            description='Committee-to-Committee transactions data dictionary'
        ),
    ])

    return files

def create_directories():
    """Create necessary directories for data storage"""
    categories = ['committees', 'candidates', 'contributions', 'linkages', 'transfers', 'descriptions']

    # Create main data directory
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # Create category subdirectories
    for category in categories:
        category_dir = DATA_DIR / category
        category_dir.mkdir(exist_ok=True)

    print(f'📁 Data directory: {DATA_DIR}')

def download_file(file: DataFile) -> bool:
    """
    Download a single file from FEC website

    Args:
        file: DataFile object containing download information

    Returns:
        bool: True if download successful, False otherwise
    """
    dest_path = DATA_DIR / file.category / file.filename

    # Skip if file already exists
    if dest_path.exists():
        print(f'⊘ Skipping (already exists): {file.filename}')
        return True

    print(f'⬇️  Downloading: {file.filename}')
    print(f'   URL: {file.url}')

    try:
        # Download with streaming to handle large files
        response = requests.get(file.url, stream=True, timeout=30)
        response.raise_for_status()

        # Get file size if available
        total_size = int(response.headers.get('content-length', 0))

        # Write to file
        with open(dest_path, 'wb') as f:
            downloaded = 0
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)

                    # Show progress for large files
                    if total_size > 0:
                        progress = (downloaded / total_size) * 100
                        print(f'\r   Progress: {progress:.1f}%', end='', flush=True)

        if total_size > 0:
            print()  # New line after progress

        file_size_mb = dest_path.stat().st_size / (1024 * 1024)
        print(f'✓ Downloaded: {file.filename} ({file_size_mb:.2f} MB)')
        return True

    except requests.exceptions.RequestException as e:
        print(f'✗ Error downloading {file.filename}: {e}')
        # Clean up partial download
        if dest_path.exists():
            dest_path.unlink()
        return False
    except Exception as e:
        print(f'✗ Unexpected error downloading {file.filename}: {e}')
        if dest_path.exists():
            dest_path.unlink()
        return False

def main():
    """Main download function"""
    print('\n' + '='*60)
    print('📥 FEC Data Downloader')
    print('='*60 + '\n')

    # Create directory structure
    create_directories()

    # Get list of files to download
    files = get_files_to_download()

    print(f'\n📋 Total files to download: {len(files)}\n')

    # Download all files
    success_count = 0
    error_count = 0

    for i, file in enumerate(files, 1):
        print(f'\n[{i}/{len(files)}] {file.category.upper()}')

        if download_file(file):
            success_count += 1
        else:
            error_count += 1

        # Add delay to avoid overwhelming the server
        if i < len(files):  # Don't delay after last file
            time.sleep(1)

    # Print summary
    print('\n' + '='*60)
    print('📊 Download Summary')
    print('='*60)
    print(f'✓ Success: {success_count}/{len(files)}')
    print(f'✗ Errors:  {error_count}')
    print(f'\n📁 Data saved to: {DATA_DIR}')
    print('='*60 + '\n')

    # Return exit code
    return 0 if error_count == 0 else 1

if __name__ == '__main__':
    sys.exit(main())
