#!/usr/bin/env python3
"""Deploy Firestore security rules via REST API"""

import subprocess
import sys
import json
import requests

PROJECT_ID = 'stanseproject'

def get_access_token():
    """Get gcloud access token"""
    result = subprocess.run(
        ['gcloud', 'auth', 'print-access-token'],
        capture_output=True, text=True, check=True
    )
    return result.stdout.strip()

def read_rules_file(rules_file):
    """Read rules file content"""
    with open(rules_file, 'r') as f:
        return f.read()

def deploy_rules(rules_content):
    """Deploy rules using REST API"""
    token = get_access_token()

    # Create a release
    url = f'https://firebaserules.googleapis.com/v1/projects/{PROJECT_ID}/releases'

    # First, create a ruleset
    ruleset_url = f'https://firebaserules.googleapis.com/v1/projects/{PROJECT_ID}/rulesets'

    ruleset_data = {
        'source': {
            'files': [
                {
                    'name': 'firestore.rules',
                    'content': rules_content
                }
            ]
        }
    }

    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }

    print('Creating ruleset...')
    response = requests.post(ruleset_url, headers=headers, json=ruleset_data)

    if response.status_code not in [200, 201]:
        print(f'❌ Failed to create ruleset: {response.status_code}')
        print(response.text)
        return False

    ruleset = response.json()
    ruleset_name = ruleset['name']
    print(f'✅ Ruleset created: {ruleset_name}')

    # Now create a release
    release_data = {
        'name': f'projects/{PROJECT_ID}/releases/cloud.firestore',
        'rulesetName': ruleset_name
    }

    print('Creating release...')
    release_url = f'https://firebaserules.googleapis.com/v1/projects/{PROJECT_ID}/releases/cloud.firestore'
    response = requests.patch(release_url, headers=headers, json=release_data)

    if response.status_code in [200, 201]:
        print('✅ Rules deployed successfully!')
        return True
    else:
        print(f'❌ Failed to deploy release: {response.status_code}')
        print(response.text)
        return False

def main():
    rules_file = '/Users/xuling/code/Stanse/firestore.rules'

    print('📋 Reading rules file...')
    rules_content = read_rules_file(rules_file)

    print('🚀 Deploying Firestore security rules...')
    success = deploy_rules(rules_content)

    if success:
        print('\n✅ Deployment complete! Rules are now active.')
        print('   缓存问题已修复，刷新页面即可正常使用。')
    else:
        print('\n❌ Deployment failed. Please deploy manually via Firebase Console:')
        print('   https://console.firebase.google.com/project/stanseproject/firestore/rules')

    sys.exit(0 if success else 1)

if __name__ == '__main__':
    main()
