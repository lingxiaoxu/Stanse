/// 加密安全模块 - 数字签名和密钥管理
///
/// 提供 Ed25519 数字签名、密钥生成和验证功能
/// 增强区块和行动的安全性

use ed25519_dalek::{SigningKey, VerifyingKey, Signature, Signer, Verifier};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// 密钥对包装器 - 用于签名
#[derive(Clone)]
pub struct PolisKeypair {
    pub signing_key: SigningKey,
}

impl PolisKeypair {
    /// 生成新的密钥对
    pub fn generate() -> Self {
        let signing_key = SigningKey::from_bytes(&rand::random());
        Self { signing_key }
    }

    /// 从字节加载密钥对
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, String> {
        if bytes.len() != 32 {
            return Err("Invalid signing key bytes length".to_string());
        }
        let signing_key = SigningKey::from_bytes(bytes.try_into().unwrap());
        Ok(Self { signing_key })
    }

    /// 导出密钥对字节
    pub fn to_bytes(&self) -> Vec<u8> {
        self.signing_key.to_bytes().to_vec()
    }

    /// 获取公钥
    pub fn public_key(&self) -> VerifyingKey {
        self.signing_key.verifying_key()
    }

    /// 获取公钥字节
    pub fn public_key_bytes(&self) -> Vec<u8> {
        self.signing_key.verifying_key().to_bytes().to_vec()
    }

    /// 签名数据
    pub fn sign(&self, data: &[u8]) -> Vec<u8> {
        let signature: Signature = self.signing_key.sign(data);
        signature.to_bytes().to_vec()
    }

    /// 签名消息（先哈希）
    pub fn sign_message(&self, message: &str) -> Vec<u8> {
        let hash = Sha256::digest(message.as_bytes());
        self.sign(&hash)
    }
}

/// 公钥包装器 - 用于验证
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct PolisPublicKey {
    pub bytes: Vec<u8>,
}

impl PolisPublicKey {
    /// 从字节创建公钥
    pub fn from_bytes(bytes: Vec<u8>) -> Result<Self, String> {
        if bytes.len() != 32 {
            return Err("Invalid public key length".to_string());
        }
        Ok(Self { bytes })
    }

    /// 转换为 Ed25519 公钥
    fn to_ed25519(&self) -> Result<VerifyingKey, String> {
        let mut bytes = [0u8; 32];
        bytes.copy_from_slice(&self.bytes);
        VerifyingKey::from_bytes(&bytes)
            .map_err(|e| format!("Invalid public key: {}", e))
    }

    /// 验证签名
    pub fn verify(&self, data: &[u8], signature_bytes: &[u8]) -> bool {
        let verifying_key = match self.to_ed25519() {
            Ok(pk) => pk,
            Err(_) => return false,
        };

        if signature_bytes.len() != 64 {
            return false;
        }

        let mut sig_bytes = [0u8; 64];
        sig_bytes.copy_from_slice(signature_bytes);

        match Signature::try_from(&sig_bytes[..]) {
            Ok(signature) => verifying_key.verify(data, &signature).is_ok(),
            Err(_) => false,
        }
    }

    /// 验证消息签名（先哈希）
    pub fn verify_message(&self, message: &str, signature_bytes: &[u8]) -> bool {
        let hash = Sha256::digest(message.as_bytes());
        self.verify(&hash, signature_bytes)
    }

    /// 转换为十六进制字符串
    pub fn to_hex(&self) -> String {
        hex::encode(&self.bytes)
    }

    /// 从十六进制字符串创建
    pub fn from_hex(hex_str: &str) -> Result<Self, String> {
        let bytes = hex::decode(hex_str)
            .map_err(|e| format!("Invalid hex: {}", e))?;
        Self::from_bytes(bytes)
    }
}

/// 可签名的行动 - 增强安全性
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SignedAction {
    pub action_data: String,           // JSON序列化的行动数据
    pub signature: Vec<u8>,            // Ed25519签名
    pub public_key: PolisPublicKey,    // 签名者公钥
    pub timestamp: i64,                // 签名时间戳
}

impl SignedAction {
    /// 创建签名行动
    pub fn new(action_data: &str, keypair: &PolisKeypair) -> Self {
        let signature = keypair.sign_message(action_data);
        let public_key = PolisPublicKey::from_bytes(keypair.public_key_bytes()).unwrap();
        let timestamp = chrono::Utc::now().timestamp();

        Self {
            action_data: action_data.to_string(),
            signature,
            public_key,
            timestamp,
        }
    }

    /// 验证签名
    pub fn verify(&self) -> bool {
        self.public_key.verify_message(&self.action_data, &self.signature)
    }

    /// 检查签名是否在有效期内（5分钟）
    pub fn is_fresh(&self) -> bool {
        let now = chrono::Utc::now().timestamp();
        let age = now - self.timestamp;
        age < 300 // 5分钟内有效
    }

    /// 完整验证（签名 + 时间）
    pub fn is_valid(&self) -> bool {
        self.verify() && self.is_fresh()
    }
}

/// 区块签名 - 验证者签名区块
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct BlockSignature {
    pub block_hash: String,
    pub signature: Vec<u8>,
    pub validator_public_key: PolisPublicKey,
    pub signed_at: i64,
}

impl BlockSignature {
    /// 创建区块签名
    pub fn new(block_hash: &str, validator_keypair: &PolisKeypair) -> Self {
        let signature = validator_keypair.sign_message(block_hash);
        let validator_public_key = PolisPublicKey::from_bytes(
            validator_keypair.public_key_bytes()
        ).unwrap();
        let signed_at = chrono::Utc::now().timestamp();

        Self {
            block_hash: block_hash.to_string(),
            signature,
            validator_public_key,
            signed_at,
        }
    }

    /// 验证区块签名
    pub fn verify(&self) -> bool {
        self.validator_public_key.verify_message(&self.block_hash, &self.signature)
    }
}

/// DID (去中心化身份) 生成器
pub struct DIDGenerator;

impl DIDGenerator {
    /// 从公钥生成 DID
    pub fn from_public_key(public_key: &PolisPublicKey) -> String {
        format!("did:polis:{}", &public_key.to_hex()[..16])
    }

    /// 从密钥对生成 DID
    pub fn from_keypair(keypair: &PolisKeypair) -> String {
        let public_key = PolisPublicKey::from_bytes(keypair.public_key_bytes()).unwrap();
        Self::from_public_key(&public_key)
    }

    /// 验证 DID 格式
    pub fn is_valid_format(did: &str) -> bool {
        did.starts_with("did:polis:") && did.len() == 26 // "did:polis:" + 16 hex chars
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keypair_generation() {
        let keypair = PolisKeypair::generate();
        assert_eq!(keypair.public_key_bytes().len(), 32);
    }

    #[test]
    fn test_sign_and_verify() {
        let keypair = PolisKeypair::generate();
        let message = "Hello, Polis Protocol!";

        let signature = keypair.sign_message(message);
        let public_key = PolisPublicKey::from_bytes(keypair.public_key_bytes()).unwrap();

        assert!(public_key.verify_message(message, &signature));
    }

    #[test]
    fn test_invalid_signature() {
        let keypair = PolisKeypair::generate();
        let message = "Hello, Polis Protocol!";
        let wrong_message = "Wrong message";

        let signature = keypair.sign_message(message);
        let public_key = PolisPublicKey::from_bytes(keypair.public_key_bytes()).unwrap();

        assert!(!public_key.verify_message(wrong_message, &signature));
    }

    #[test]
    fn test_signed_action() {
        let keypair = PolisKeypair::generate();
        let action_data = r#"{"user":"test","action":"boycott"}"#;

        let signed_action = SignedAction::new(action_data, &keypair);
        assert!(signed_action.verify());
        assert!(signed_action.is_fresh());
        assert!(signed_action.is_valid());
    }

    #[test]
    fn test_did_generation() {
        let keypair = PolisKeypair::generate();
        let did = DIDGenerator::from_keypair(&keypair);

        assert!(did.starts_with("did:polis:"));
        assert!(DIDGenerator::is_valid_format(&did));
    }

    #[test]
    fn test_block_signature() {
        let keypair = PolisKeypair::generate();
        let block_hash = "abc123def456";

        let block_sig = BlockSignature::new(block_hash, &keypair);
        assert!(block_sig.verify());
    }
}