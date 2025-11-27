/// P2P 网络模块 - 基于 libp2p
///
/// 提供去中心化网络功能：节点发现、区块广播、数据同步

use libp2p::{
    gossipsub, identify, kad,
    mdns,
    noise,
    swarm::SwarmEvent,
    tcp, yamux, Multiaddr, PeerId, Swarm,
};
// 导入 NetworkBehaviour 宏
use libp2p::swarm::NetworkBehaviour;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use tokio::sync::mpsc;

/// P2P 消息类型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum P2PMessage {
    /// 新区块广播
    NewBlock {
        shard_id: String,
        block_index: u64,
        block_hash: String,
        block_data: Vec<u8>,
    },
    /// 新行动广播
    NewAction {
        shard_id: String,
        action_id: String,
        action_data: Vec<u8>,
    },
    /// 节点心跳
    Heartbeat {
        node_id: String,
        online_since: i64,
        active_shards: Vec<String>,
    },
    /// 请求同步
    SyncRequest {
        shard_id: String,
        from_block: u64,
        to_block: u64,
    },
    /// 同步响应
    SyncResponse {
        shard_id: String,
        blocks: Vec<Vec<u8>>,
    },
}

/// 网络行为组合
#[derive(NetworkBehaviour)]
pub struct PolisBehaviour {
    /// Gossipsub - 用于消息广播
    pub gossipsub: gossipsub::Behaviour,
    /// mDNS - 用于本地网络节点发现
    pub mdns: mdns::tokio::Behaviour,
    /// Kademlia - 用于分布式哈希表和节点发现
    pub kad: kad::Behaviour<kad::store::MemoryStore>,
    /// Identify - 用于节点身份识别
    pub identify: identify::Behaviour,
}

/// P2P 节点配置
#[derive(Clone)]
pub struct P2PConfig {
    pub listen_address: String,
    pub bootstrap_peers: Vec<Multiaddr>,
    pub enable_mdns: bool,
}

impl Default for P2PConfig {
    fn default() -> Self {
        Self {
            listen_address: "/ip4/0.0.0.0/tcp/0".to_string(),
            bootstrap_peers: Vec::new(),
            enable_mdns: true,
        }
    }
}

/// P2P 节点
pub struct P2PNode {
    pub swarm: Swarm<PolisBehaviour>,
    pub peer_id: PeerId,
    pub known_peers: HashMap<PeerId, PeerInfo>,
    message_tx: mpsc::UnboundedSender<P2PMessage>,
    message_rx: mpsc::UnboundedReceiver<P2PMessage>,
}

/// 对等节点信息
#[derive(Debug, Clone)]
pub struct PeerInfo {
    pub peer_id: PeerId,
    pub addresses: Vec<Multiaddr>,
    pub last_seen: i64,
    pub active_shards: Vec<String>,
}

impl P2PNode {
    /// 创建新的 P2P 节点
    pub async fn new(config: P2PConfig) -> Result<Self, Box<dyn std::error::Error>> {
        // 生成密钥对
        let local_key = libp2p::identity::Keypair::generate_ed25519();
        let peer_id = PeerId::from(local_key.public());

        println!("🌐 Local peer ID: {}", peer_id);

        // 配置 Gossipsub
        let gossipsub_config = gossipsub::ConfigBuilder::default()
            .heartbeat_interval(Duration::from_secs(1))
            .validation_mode(gossipsub::ValidationMode::Strict)
            .build()
            .map_err(|e| format!("Invalid gossipsub config: {}", e))?;

        let mut gossipsub = gossipsub::Behaviour::new(
            gossipsub::MessageAuthenticity::Signed(local_key.clone()),
            gossipsub_config,
        )?;

        // 订阅主题
        let topic = gossipsub::IdentTopic::new("polis-protocol");
        gossipsub.subscribe(&topic)?;

        // 配置 mDNS
        let mdns = if config.enable_mdns {
            mdns::tokio::Behaviour::new(mdns::Config::default(), peer_id)?
        } else {
            mdns::tokio::Behaviour::new(
                mdns::Config {
                    ttl: Duration::from_secs(600),
                    query_interval: Duration::from_secs(60),
                    enable_ipv6: false,
                },
                peer_id,
            )?
        };

        // 配置 Kademlia
        let kad_store = kad::store::MemoryStore::new(peer_id);
        let kad = kad::Behaviour::new(peer_id, kad_store);

        // 配置 Identify
        let identify = identify::Behaviour::new(identify::Config::new(
            "/polis/1.0.0".to_string(),
            local_key.public(),
        ));

        // 组合行为
        let behaviour = PolisBehaviour {
            gossipsub,
            mdns,
            kad,
            identify,
        };

        // 使用 SwarmBuilder 创建 Swarm
        let mut swarm = libp2p::SwarmBuilder::with_existing_identity(local_key)
            .with_tokio()
            .with_tcp(
                tcp::Config::default(),
                noise::Config::new,
                yamux::Config::default,
            )?
            .with_behaviour(|_key| behaviour)?
            .with_swarm_config(|cfg| cfg.with_idle_connection_timeout(Duration::from_secs(60)))
            .build();

        // 监听地址
        let listen_addr: Multiaddr = config.listen_address.parse()?;
        swarm.listen_on(listen_addr)?;

        // 连接到引导节点
        for addr in config.bootstrap_peers {
            swarm.dial(addr)?;
        }

        let (message_tx, message_rx) = mpsc::unbounded_channel();

        Ok(Self {
            swarm,
            peer_id,
            known_peers: HashMap::new(),
            message_tx,
            message_rx,
        })
    }

    /// 广播消息到网络
    pub fn broadcast(&mut self, message: P2PMessage) -> Result<(), Box<dyn std::error::Error>> {
        let topic = gossipsub::IdentTopic::new("polis-protocol");
        let serialized = serde_json::to_vec(&message)?;
        self.swarm.behaviour_mut().gossipsub.publish(topic, serialized)?;
        Ok(())
    }

    /// 发送消息给特定节点
    pub fn send_to_peer(
        &mut self,
        _peer_id: PeerId,
        message: P2PMessage,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // 在生产环境中，这里会使用 request-response 协议
        // 目前我们通过 gossipsub 广播
        self.broadcast(message)
    }

    /// 处理网络事件
    pub async fn handle_event(&mut self, event: SwarmEvent<PolisBehaviourEvent>) {
        match event {
            SwarmEvent::Behaviour(PolisBehaviourEvent::Gossipsub(gossipsub::Event::Message {
                message,
                ..
            })) => {
                // 解析并处理消息
                if let Ok(p2p_message) = serde_json::from_slice::<P2PMessage>(&message.data) {
                    let _ = self.message_tx.send(p2p_message);
                }
            }
            SwarmEvent::Behaviour(PolisBehaviourEvent::Mdns(mdns::Event::Discovered(peers))) => {
                // 发现新节点
                for (peer_id, addr) in peers {
                    println!("🔍 Discovered peer: {} at {}", peer_id, addr);
                    self.swarm
                        .behaviour_mut()
                        .gossipsub
                        .add_explicit_peer(&peer_id);

                    let info = PeerInfo {
                        peer_id,
                        addresses: vec![addr],
                        last_seen: chrono::Utc::now().timestamp(),
                        active_shards: Vec::new(),
                    };
                    self.known_peers.insert(peer_id, info);
                }
            }
            SwarmEvent::Behaviour(PolisBehaviourEvent::Mdns(mdns::Event::Expired(peers))) => {
                // 节点离线
                for (peer_id, _) in peers {
                    println!("👋 Peer expired: {}", peer_id);
                    self.known_peers.remove(&peer_id);
                }
            }
            SwarmEvent::NewListenAddr { address, .. } => {
                println!("📡 Listening on {}", address);
            }
            SwarmEvent::ConnectionEstablished { peer_id, .. } => {
                println!("🤝 Connected to peer: {}", peer_id);
            }
            SwarmEvent::ConnectionClosed { peer_id, .. } => {
                println!("👋 Disconnected from peer: {}", peer_id);
            }
            _ => {}
        }
    }

    /// 运行节点事件循环
    pub async fn run(&mut self) {
        use futures::StreamExt;

        loop {
            tokio::select! {
                event = self.swarm.select_next_some() => {
                    self.handle_event(event).await;
                }
                Some(message) = self.message_rx.recv() => {
                    // 处理内部消息
                    println!("📩 Received internal message: {:?}", message);
                }
            }
        }
    }

    /// 获取已连接的节点数量
    pub fn connected_peers_count(&self) -> usize {
        self.known_peers.len()
    }

    /// 获取所有已知节点
    pub fn get_known_peers(&self) -> Vec<PeerInfo> {
        self.known_peers.values().cloned().collect()
    }
}

/// P2P 节点管理器 - 简化接口
pub struct P2PManager {
    node: Option<P2PNode>,
    config: P2PConfig,
}

impl P2PManager {
    pub fn new(config: P2PConfig) -> Self {
        Self { node: None, config }
    }

    /// 启动 P2P 节点
    pub async fn start(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        let node = P2PNode::new(self.config.clone()).await?;
        self.node = Some(node);
        Ok(())
    }

    /// 广播新区块
    pub fn broadcast_block(
        &mut self,
        shard_id: String,
        block_index: u64,
        block_hash: String,
        block_data: Vec<u8>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(node) = &mut self.node {
            node.broadcast(P2PMessage::NewBlock {
                shard_id,
                block_index,
                block_hash,
                block_data,
            })?;
        }
        Ok(())
    }

    /// 广播新行动
    pub fn broadcast_action(
        &mut self,
        shard_id: String,
        action_id: String,
        action_data: Vec<u8>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(node) = &mut self.node {
            node.broadcast(P2PMessage::NewAction {
                shard_id,
                action_id,
                action_data,
            })?;
        }
        Ok(())
    }

    /// 获取连接的节点数
    pub fn connected_peers(&self) -> usize {
        self.node.as_ref().map(|n| n.connected_peers_count()).unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_p2p_node_creation() {
        let config = P2PConfig::default();
        let result = P2PNode::new(config).await;
        assert!(result.is_ok());
    }

    #[test]
    fn test_p2p_message_serialization() {
        let msg = P2PMessage::Heartbeat {
            node_id: "test".to_string(),
            online_since: 123456,
            active_shards: vec!["shard1".to_string()],
        };

        let serialized = serde_json::to_vec(&msg).unwrap();
        let deserialized: P2PMessage = serde_json::from_slice(&serialized).unwrap();

        match deserialized {
            P2PMessage::Heartbeat { node_id, .. } => assert_eq!(node_id, "test"),
            _ => panic!("Wrong message type"),
        }
    }
}
