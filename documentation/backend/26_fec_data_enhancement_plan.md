# FEC数据增强实施计划

## 背景

当前系统已实现：
- Committee Master (cm) - PAC和公司关联
- Candidate Master (cn) - 候选人政党信息
- PAC-to-Candidate (pas2) - PAC对候选人的直接捐款

**缺失维度：**
1. 候选人的多委员会关系
2. 委员会间接转账路径

## 新增数据源

### 1. Candidate-Committee Linkages (CCL文件)

**文件格式：** `ccl{year}.zip`
**数据结构：**
```
CAND_ID|CAND_ELECTION_YR|FEC_ELECTION_YR|CMTE_ID|CMTE_TP|CMTE_DSGN|LINKAGE_ID
H0AK00105|2020|2024|C00607515|H|P|248736
```

**解决的问题：**
- 一个候选人可能有多个委员会（principal campaign, joint fundraising, leadership PAC）
- 当前系统只能追踪到一个委员会的捐款，可能遗漏大量资金

**Firebase集合结构：**
```typescript
// Collection: fec_candidate_committees
{
  // Document ID: {CAND_ID}_{FEC_ELECTION_YR}
  "H0AK00105_2024": {
    candidate_id: "H0AK00105",
    candidate_election_year: 2020,
    fec_election_year: 2024,
    committees: [
      {
        committee_id: "C00607515",
        committee_type: "H",
        committee_designation: "P", // P=Principal, J=Joint, U=Unauthorized
        linkage_id: "248736"
      }
    ],
    committee_count: 1,
    updated_at: timestamp
  }
}
```

**Committee Designation说明：**
- `P` = Principal campaign committee（主要竞选委员会）
- `A` = Authorized by candidate（候选人授权）
- `J` = Joint fundraising representative（联合筹款代表）
- `U` = Unauthorized（未授权）

**优势：**
- ✅ 完整追踪候选人所有资金来源
- ✅ 识别joint fundraising（多候选人联合筹款）
- ✅ 数据量小，易于实施

### 2. Committee-to-Committee Transactions (ITOTH文件)

**文件格式：** `itoth{year}.zip`
**数据结构：**
```
CMTE_ID|AMNDT_IND|RPT_TP|TRANSACTION_PGI|IMAGE_NUM|TRANSACTION_TP|ENTITY_TP|NAME|CITY|STATE|ZIP_CODE|EMPLOYER|OCCUPATION|TRANSACTION_DT|TRANSACTION_AMT|OTHER_ID|TRAN_ID|FILE_NUM|MEMO_CD|MEMO_TEXT|SUB_ID
C00161067|N|M9|P|202309209597255650|10J|ORG|VINSON & ELKINS TEXAS PAC|HOUSTON|TX|770026736|||06052023|10000||4686767|1726509|||4092520231802878119
```

**关键字段：**
- `CMTE_ID`: 接收方委员会
- `TRANSACTION_TP`: 交易类型（10J=委员会间转账）
- `ENTITY_TP`: 实体类型（ORG/PAC/IND）
- `NAME`: 捐赠者名称
- `TRANSACTION_AMT`: 金额
- `OTHER_ID`: 其他委员会ID（用于委员会间转账）

**解决的问题：**
追踪间接捐款路径：
```
Company PAC → Party Committee → Candidate Committee
```

当前系统只能看到：
- Company PAC → Candidate (pas2文件)

无法看到：
- Company PAC → Party Committee (itoth文件)
- Party Committee → Candidate (itoth文件)

**Firebase集合结构：**
```typescript
// Collection: fec_committee_transfers
{
  // Document ID: {SUB_ID}
  "4092520231802878119": {
    recipient_committee_id: "C00161067",
    donor_committee_id: "C00161067", // 从OTHER_ID或NAME解析
    donor_name: "VINSON & ELKINS TEXAS PAC",
    entity_type: "ORG",
    transaction_type: "10J",
    transaction_date: "2023-06-05",
    amount_cents: 10000,
    city: "HOUSTON",
    state: "TX",
    memo_text: "",
    image_num: "202309209597255650",
    transaction_id: "4686767",
    file_num: "1726509"
  }
}

// 索引查询
// Index by recipient: fec_committee_transfers where recipient_committee_id
// Index by donor: fec_committee_transfers where donor_committee_id
```

**优势：**
- ✅ 追踪间接影响力网络
- ✅ 发现隐藏的资金流向
- ✅ 识别"洗钱"式多层转账

**挑战：**
- ⚠️ 数据量可能很大
- ⚠️ 需要解析NAME字段来识别捐赠者委员会
- ⚠️ 需要构建图结构来追踪多跳路径

## 实施优先级

### Phase 1: Candidate-Committee Linkages（高优先级）

**为什么优先：**
1. 直接提升现有功能的数据完整性
2. 实施简单，数据结构清晰
3. 数据量小，不会影响性能
4. 立即解决"遗漏候选人其他委员会"问题

**实施步骤：**

#### 1.1 下载数据
修改 `01-download.py` 添加CCL文件：
```python
# Candidate-Committee Linkages - Maps candidates to all their committees
for folder, suffix, desc in YEARS_TO_DOWNLOAD:
    files.append(DataFile(
        category='candidate_committees',
        filename=f'ccl{suffix}.zip',
        url=f'{BASE_URL}/{folder}/ccl{suffix}.zip',
        description=f'Candidate-Committee Linkages for {desc}'
    ))

# Header file
files.append(DataFile(
    category='descriptions',
    filename='ccl_header_file.csv',
    url=f'{dict_base_url}/ccl_header_file.csv',
    description='Candidate-Committee Linkages data dictionary'
))
```

#### 1.2 上传到Firebase
创建 `02b-upload-candidate-committees.py`：
```python
def parse_ccl_line(line: str) -> dict:
    """Parse CCL file line"""
    parts = line.strip().split('|')
    return {
        'candidate_id': parts[0],
        'candidate_election_year': int(parts[1]) if parts[1] else None,
        'fec_election_year': int(parts[2]) if parts[2] else None,
        'committee_id': parts[3],
        'committee_type': parts[4],
        'committee_designation': parts[5],
        'linkage_id': parts[6]
    }

def upload_candidate_committees(year: str):
    """Upload candidate-committee linkages to Firebase"""
    db = init_firestore()
    collection = db.collection('fec_candidate_committees')

    # Group by candidate
    candidate_committees = {}

    for line in read_file(f'ccl{year}.txt'):
        data = parse_ccl_line(line)
        cand_id = data['candidate_id']
        fec_year = data['fec_election_year']
        doc_id = f"{cand_id}_{fec_year}"

        if doc_id not in candidate_committees:
            candidate_committees[doc_id] = {
                'candidate_id': cand_id,
                'fec_election_year': fec_year,
                'committees': []
            }

        candidate_committees[doc_id]['committees'].append({
            'committee_id': data['committee_id'],
            'committee_type': data['committee_type'],
            'committee_designation': data['committee_designation'],
            'linkage_id': data['linkage_id']
        })

    # Upload to Firebase
    batch = db.batch()
    count = 0

    for doc_id, data in candidate_committees.items():
        doc_ref = collection.document(doc_id)
        data['committee_count'] = len(data['committees'])
        data['updated_at'] = firestore.SERVER_TIMESTAMP
        batch.set(doc_ref, data)
        count += 1

        if count % 500 == 0:
            batch.commit()
            batch = db.batch()

    batch.commit()
```

#### 1.3 更新Frontend Service
修改 `fecService.ts` 使用候选人所有委员会：

```typescript
// 新增函数：获取候选人所有委员会
async function getCandidateCommittees(candidateId: string, year: number = 2024): Promise<string[]> {
  const docId = `${candidateId}_${year}`;
  const doc = await db.collection('fec_candidate_committees').doc(docId).get();

  if (!doc.exists) {
    return []; // 候选人没有额外委员会
  }

  const data = doc.data();
  return data?.committees?.map((c: any) => c.committee_id) || [];
}

// 修改现有函数：聚合候选人所有委员会的捐款
async function aggregateByParty(contributions: any[]): Promise<PartyAggregation> {
  const partyTotals: { [party: string]: number } = {};
  const candidateCache: { [candidateId: string]: any } = {};

  for (const contrib of contributions) {
    const candidateId = contrib.candidate_id;

    if (!candidateCache[candidateId]) {
      candidateCache[candidateId] = await getCandidateInfo(candidateId);
    }

    const candidate = candidateCache[candidateId];
    if (candidate?.party) {
      partyTotals[candidate.party] = (partyTotals[candidate.party] || 0) + contrib.amount_cents;
    }
  }

  // 现在可以追踪候选人的所有委员会接收的捐款
  // TODO: 在未来版本中，聚合候选人所有委员会的捐款

  return partyTotals;
}
```

#### 1.4 更新Firestore Rules
```javascript
match /fec_candidate_committees/{docId} {
  allow read: if true;
  allow write: if false;
}
```

### Phase 2: Committee-to-Committee Transfers（中优先级）

**实施时机：** Phase 1完成后，如果需要追踪间接捐款路径

**实施步骤：**

#### 2.1 下载数据
修改 `01-download.py` 添加ITOTH文件：
```python
# Committee-to-Committee Transactions
for folder, suffix, desc in YEARS_TO_DOWNLOAD:
    files.append(DataFile(
        category='committee_transfers',
        filename=f'itoth{suffix}.zip',
        url=f'{BASE_URL}/{folder}/itoth{suffix}.zip',
        description=f'Committee-to-Committee Transactions for {desc}'
    ))

files.append(DataFile(
    category='descriptions',
    filename='itoth_header_file.csv',
    url=f'{dict_base_url}/itoth_header_file.csv',
    description='Committee-to-Committee Transactions data dictionary'
))
```

#### 2.2 数据处理策略
由于ITOTH文件可能非常大，需要**选择性上传**：

**策略A：只上传公司PAC相关的转账**
- 查询ITOTH文件中NAME字段包含我们追踪的公司名称
- 只上传这些相关的转账记录
- 大幅减少数据量

**策略B：建立完整的转账图**
- 上传所有委员会间转账
- 允许追踪任意多跳路径
- 数据量巨大，可能需要BigQuery

**推荐：策略A（选择性上传）**

#### 2.3 Frontend展示
在公司捐款页面添加"间接影响力"部分：
```typescript
interface IndirectInfluence {
  path: string; // "Company PAC → Party Committee → Candidate"
  amount: number;
  intermediaries: string[]; // 中间委员会列表
}

// 展示：
// Direct Donations: $500,000
// Indirect Influence (via Party Committees): $200,000
```

## 数据量估算

### CCL (Candidate-Committee Linkages)
- 估计：~50,000条记录/年（每个候选人平均1-3个委员会）
- 5年数据：~250,000条记录
- Firebase文档：~100,000个文档（按候选人聚合）
- **评估：完全可行**

### ITOTH (Committee-to-Committee)
- 估计：数百万条记录/年
- **评估：需要选择性上传或使用BigQuery**

## 推荐实施路径

### 立即实施（本次迭代）
✅ **Phase 1: Candidate-Committee Linkages**
- 修改01-download.py添加CCL文件下载
- 创建02b-upload-candidate-committees.py
- 更新firestore.rules
- 验证数据完整性

### 未来增强（下次迭代）
🔄 **Phase 2: Committee-to-Committee Transfers**
- 只在用户明确需要"间接影响力分析"时实施
- 采用选择性上传策略

## 测试计划

### Phase 1测试
1. 下载2024年CCL文件
2. 验证数据解析正确性
3. 上传到Firebase测试环境
4. 查询验证：候选人是否正确关联到所有委员会
5. 前端展示：是否显示完整的捐款金额

### 预期改进
- 捐款金额完整性提升：估计10-30%（某些有多个委员会的候选人）
- 数据准确性：识别joint fundraising committees

## 结论

**Phase 1 (CCL)应该立即实施**，因为：
1. 解决现有数据的完整性问题
2. 实施简单，风险低
3. 数据量可控
4. 立即可见的价值提升

**Phase 2 (ITOTH)可以推迟**，除非：
1. 用户明确要求追踪间接影响力
2. 需要分析"政治资金洗钱"路径
3. 研究政党委员会的资金流向
