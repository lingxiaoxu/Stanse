#!/usr/bin/env python3
"""
调查测试中发现的数据差异问题：
1. Goldman Sachs: 为什么只找到$19,500而不是预期的~$463,000？
2. Amazon: 为什么完全找不到数据？
3. Walmart: 为什么有index但没有party_summary？
4. RTX: 真实的公司名称是什么？
"""

import sys
import os
import subprocess
from pathlib import Path

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    print('❌ Firebase库未安装')
    sys.exit(1)

PROJECT_ID = 'stanseproject'
db = None

def init_firestore():
    """初始化Firestore"""
    global db
    print('🔧 初始化Firestore连接...')

    try:
        if not firebase_admin._apps:
            result = subprocess.run(
                ['gcloud', 'auth', 'print-access-token'],
                capture_output=True, text=True, check=True
            )
            access_token = result.stdout.strip()

            from google.oauth2 import credentials as oauth_creds
            cred = oauth_creds.Credentials(access_token)
            firebase_admin.initialize_app(cred, options={'projectId': PROJECT_ID})

        db = firestore.client()
        print(f'✅ Firestore已连接 (项目: {PROJECT_ID})')
        return db
    except Exception as e:
        print(f'❌ 失败: {e}')
        sys.exit(1)

def search_company_index_by_pattern(pattern):
    """搜索公司索引中包含特定模式的所有公司"""
    print(f'\n🔍 在fec_company_index中搜索包含 "{pattern}" 的公司...')

    # Firestore不支持直接的通配符搜索，需要获取所有文档然后过滤
    index_ref = db.collection('fec_company_index')
    all_docs = index_ref.stream()

    matches = []
    for doc in all_docs:
        doc_id = doc.id
        if pattern.lower() in doc_id.lower():
            data = doc.to_dict()
            matches.append({
                'normalized_name': doc_id,
                'display_name': data.get('company_name', 'N/A'),
                'committee_count': len(data.get('committees', []))
            })

    if matches:
        print(f'  ✅ 找到 {len(matches)} 个匹配:')
        for match in matches:
            print(f'     - "{match["normalized_name"]}" → {match["display_name"]} ({match["committee_count"]} 委员会)')
    else:
        print(f'  ❌ 未找到包含 "{pattern}" 的公司')

    return matches

def check_party_summary_for_company(normalized_name):
    """检查某个公司是否有party_summary数据"""
    print(f'\n🔍 检查 "{normalized_name}" 的party_summary数据...')

    summaries_ref = db.collection('fec_company_party_summary')
    summaries = summaries_ref.where('normalized_name', '==', normalized_name).stream()

    summaries_list = list(summaries)

    if summaries_list:
        print(f'  ✅ 找到 {len(summaries_list)} 条party_summary记录:')
        total = 0
        for summary_doc in summaries_list:
            summary = summary_doc.to_dict()
            year = summary.get('data_year', 'N/A')
            contributed = summary.get('total_contributed', 0) / 100.0
            total += contributed
            print(f'     - {year}年: ${contributed:,.2f}')
        print(f'  总计: ${total:,.2f}')
        return summaries_list
    else:
        print(f'  ❌ 未找到party_summary数据')
        return []

def investigate_goldman_sachs():
    """调查Goldman Sachs数据"""
    print('\n' + '='*80)
    print('🔬 调查 1: Goldman Sachs 数据差异')
    print('='*80)

    # 搜索所有包含goldman的公司
    matches = search_company_index_by_pattern('goldman')

    # 检查每个匹配的party_summary
    for match in matches:
        check_party_summary_for_company(match['normalized_name'])

def investigate_amazon():
    """调查Amazon数据"""
    print('\n' + '='*80)
    print('🔬 调查 2: Amazon 数据')
    print('='*80)

    # 搜索所有包含amazon的公司
    matches = search_company_index_by_pattern('amazon')

    # 检查每个匹配的party_summary
    for match in matches:
        check_party_summary_for_company(match['normalized_name'])

def investigate_walmart():
    """调查Walmart数据"""
    print('\n' + '='*80)
    print('🔬 调查 3: Walmart 数据')
    print('='*80)

    # 搜索所有包含walmart的公司
    matches = search_company_index_by_pattern('walmart')

    # 检查每个匹配的party_summary
    for match in matches:
        check_party_summary_for_company(match['normalized_name'])

def investigate_rtx():
    """调查RTX/Raytheon数据"""
    print('\n' + '='*80)
    print('🔬 调查 4: RTX/Raytheon 数据')
    print('='*80)

    print('\n检查 RTX 相关名称:')
    for pattern in ['rtx', 'raytheon', 'united tech']:
        matches = search_company_index_by_pattern(pattern)
        for match in matches:
            check_party_summary_for_company(match['normalized_name'])

def main():
    """主函数"""
    print('\n' + '='*80)
    print('🔍 FEC数据差异调查')
    print('='*80)

    init_firestore()

    investigate_goldman_sachs()
    investigate_amazon()
    investigate_walmart()
    investigate_rtx()

    print('\n')

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\n\n⚠️  用户中断')
        sys.exit(0)
    except Exception as e:
        print(f'\n❌ 错误: {e}')
        import traceback
        traceback.print_exc()
        sys.exit(1)
