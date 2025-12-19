#!/usr/bin/env python3
"""
Extract all FEC ZIP files with year-suffixed names

This script extracts all ZIP files in the raw_data directory and renames
the extracted TXT files to include the year suffix. This prevents naming
conflicts when extracting multiple years of data.

For example:
- cm24.zip extracts to cm.txt, which is renamed to cm24.txt
- cn20.zip extracts to cn.txt, which is renamed to cn20.txt
- pas216.zip extracts to itpas2.txt, which is renamed to itpas216.txt
"""

import zipfile
import os
from pathlib import Path

# Configuration
DATA_DIR = Path(__file__).parent.parent / 'raw_data'

def extract_file_with_suffix(zip_path: Path, category_dir: Path):
    """
    Extract a ZIP file and rename the extracted file with year suffix

    Args:
        zip_path: Path to the ZIP file (e.g., cm24.zip)
        category_dir: Directory containing the ZIP file

    Returns:
        bool: True if successful, False otherwise
    """
    # Get the year suffix from the ZIP filename
    # e.g., cm24.zip -> 24, pas216.zip -> 16
    zip_name = zip_path.stem  # e.g., 'cm24', 'pas216'

    # Determine the file type and year suffix
    if zip_name.startswith('cm'):
        file_type = 'cm'
        year_suffix = zip_name[2:]  # '24'
        expected_txt = 'cm.txt'
    elif zip_name.startswith('cn'):
        file_type = 'cn'
        year_suffix = zip_name[2:]  # '24'
        expected_txt = 'cn.txt'
    elif zip_name.startswith('pas2'):
        file_type = 'pas2'
        year_suffix = zip_name[4:]  # '24'
        expected_txt = 'itpas2.txt'
    elif zip_name.startswith('ccl'):
        file_type = 'ccl'
        year_suffix = zip_name[3:]  # '24'
        expected_txt = 'ccl.txt'
    elif zip_name.startswith('oth'):
        file_type = 'oth'
        year_suffix = zip_name[3:]  # '24'
        expected_txt = 'itoth.txt'
    else:
        print(f'⊘ Unknown file type: {zip_name}')
        return False

    # Construct the target filename with year suffix
    if file_type == 'pas2':
        target_name = f'itpas2{year_suffix}.txt'
    elif file_type == 'oth':
        target_name = f'itoth{year_suffix}.txt'
    elif file_type == 'ccl':
        target_name = f'ccl{year_suffix}.txt'
    else:
        target_name = f'{file_type}{year_suffix}.txt'

    target_path = category_dir / target_name

    print(f'\n📦 Extracting: {zip_path.name}')

    try:
        # Extract the ZIP file
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            # List all files in the ZIP
            file_list = zip_ref.namelist()

            # Find the TXT file (should be only one)
            txt_files = [f for f in file_list if f.lower().endswith('.txt')]

            if not txt_files:
                print(f'✗ No TXT file found in {zip_path.name}')
                return False

            if len(txt_files) > 1:
                print(f'⚠  Multiple TXT files found in {zip_path.name}, using first: {txt_files[0]}')

            txt_file = txt_files[0]

            # Extract to temporary location
            extracted_path = category_dir / txt_file
            zip_ref.extract(txt_file, category_dir)

            # Rename to include year suffix
            if extracted_path.exists():
                # Remove target if it already exists (overwrite)
                if target_path.exists():
                    target_path.unlink()
                    print(f'   Overwriting existing: {target_name}')

                extracted_path.rename(target_path)

                file_size_mb = target_path.stat().st_size / (1024 * 1024)
                print(f'✓ Extracted: {target_name} ({file_size_mb:.2f} MB)')
                return True
            else:
                print(f'✗ Failed to extract {txt_file} from {zip_path.name}')
                return False

    except zipfile.BadZipFile:
        print(f'✗ Corrupted ZIP file: {zip_path.name}')
        return False
    except Exception as e:
        print(f'✗ Error extracting {zip_path.name}: {e}')
        return False

def extract_all_zips():
    """Extract all ZIP files in raw_data directory"""
    print('\n' + '='*60)
    print('📦 FEC Data ZIP Extractor')
    print('='*60 + '\n')

    categories = ['committees', 'candidates', 'contributions', 'linkages', 'transfers']

    total_extracted = 0
    total_failed = 0
    total_skipped = 0

    for category in categories:
        category_dir = DATA_DIR / category

        if not category_dir.exists():
            print(f'⊘ Directory not found: {category}')
            continue

        # Find all ZIP files in this category
        zip_files = sorted(category_dir.glob('*.zip'))

        if not zip_files:
            print(f'⊘ No ZIP files found in: {category}')
            continue

        print(f'\n📁 Processing: {category.upper()} ({len(zip_files)} files)')
        print('-' * 60)

        for zip_path in zip_files:
            if extract_file_with_suffix(zip_path, category_dir):
                total_extracted += 1
            else:
                total_failed += 1

    # Print summary
    print('\n' + '='*60)
    print('📊 Extraction Summary')
    print('='*60)
    print(f'✓ Extracted: {total_extracted}')
    print(f'✗ Failed:    {total_failed}')
    print(f'\n📁 Files saved to: {DATA_DIR}')
    print('='*60 + '\n')

    return 0 if total_failed == 0 else 1

if __name__ == '__main__':
    import sys
    sys.exit(extract_all_zips())
