import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { GlobeMarker } from '../../services/globeService';

// 解码TopoJSON
function decodeTopoJSON(topology: any) {
  const { transform, arcs } = topology;
  const scale = transform.scale;
  const translate = transform.translate;

  return arcs.map((arc: number[][]) => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]: number[]) => {
      x += dx;
      y += dy;
      return [
        x * scale[0] + translate[0],
        y * scale[1] + translate[1]
      ];
    });
  });
}

// Convert lat/lng to 3D coordinates on sphere
function latLngToVector3(lat: number, lng: number, radius: number = 1): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);

  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);

  return new THREE.Vector3(x, y, z);
}

// Marker colors by type
const MARKER_COLORS: Record<string, string> = {
  NEWS: '#3b82f6',      // blue
  BREAKING: '#ef4444',  // red
  CONFLICT: '#dc2626',  // dark red
  USER_BIRTH: '#10b981', // green
  USER_CURRENT: '#8b5cf6', // purple
  SEARCH_RESULT: '#f59e0b', // orange
};

// 单个弹窗卡片组件
function MarkerPopupCard({
  marker,
  showConnector = true,
}: {
  marker: GlobeMarker;
  showConnector?: boolean;
}) {
  const color = MARKER_COLORS[marker.type] || '#6b7280';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    }}>
      {/* 弹窗内容 */}
      <div
        className="relative bg-black text-white border border-white"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          width: '182px',
          padding: '6px 8px',
        }}
      >
        {/* Pixel corner decorations */}
        <div className="absolute -top-[2px] -left-[2px] w-1 h-1 bg-white" />
        <div className="absolute -top-[2px] -right-[2px] w-1 h-1 bg-white" />
        <div className="absolute -bottom-[2px] -left-[2px] w-1 h-1 bg-white" />
        <div className="absolute -bottom-[2px] -right-[2px] w-1 h-1 bg-white" />

        {/* Marker type badge */}
        <div
          className="text-[8px] uppercase tracking-wide mb-1 px-1 inline-block text-black font-bold"
          style={{ backgroundColor: color }}
        >
          {marker.type.replace('_', ' ')}
        </div>

        {/* Title - 最多2行 */}
        <div className="font-bold text-[9px] leading-tight mb-1" style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}>
          {marker.title}
        </div>

        {/* Summary/Location - 显示更多信息，最多3行 */}
        {marker.summary && (
          <div className="text-[8px] leading-tight opacity-80" style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
          }}>
            {marker.summary}
          </div>
        )}
      </div>

      {/* 连接线 - 只有最后一个卡片显示 */}
      {showConnector && (
        <div style={{
          width: '1.5px',
          height: '20px',
          backgroundColor: 'black',
        }} />
      )}
    </div>
  );
}

// Marker component
function Marker({
  marker,
  onClick,
  onHoverChange,
  hoveredMarkerId,
  onHoverMarker,
  isFocused,
  focusBlinkEndTime,
}: {
  marker: GlobeMarker;
  onClick: () => void;
  onHoverChange: (hovered: boolean) => void;
  hoveredMarkerId: string | null;
  onHoverMarker: (markerId: string | null) => void;
  isFocused?: boolean;
  focusBlinkEndTime?: number;
}) {
  const markerRef = useRef<THREE.Mesh>(null);

  const position = latLngToVector3(
    marker.coordinates.latitude,
    marker.coordinates.longitude,
    1.0 // Directly on earth surface
  );

  const color = MARKER_COLORS[marker.type] || '#6b7280';

  // 获取要显示的标记列表（聚合或单个）
  const markersToShow = marker.clusteredMarkers || [marker];

  // 检查当前标记是否应该显示弹窗
  // 1. 自己被悬停时显示
  // 2. 如果有其他标记被悬停，且自己在那个标记的 clusteredMarkers 里，则不显示（让那个标记统一显示）
  // 3. 如果是聚焦的搜索结果，自动显示弹窗
  const isHovered = hoveredMarkerId === marker.id;
  const isInOtherCluster = hoveredMarkerId !== null &&
    hoveredMarkerId !== marker.id &&
    marker.clusteredMarkers?.some(m => m.id === hoveredMarkerId);
  const shouldShowPopup = (isHovered || isFocused) && !isInOtherCluster;

  // Pulsing/blinking animation
  useFrame(({ clock }) => {
    if (markerRef.current) {
      const now = Date.now();
      const isBlinking = isFocused && focusBlinkEndTime && now < focusBlinkEndTime;

      if (isBlinking) {
        // 搜索结果闪烁动画 - 更快更明显的闪烁
        const blink = Math.sin(clock.elapsedTime * 8) * 0.5 + 0.5;
        const scale = 1 + blink * 0.5;
        markerRef.current.scale.setScalar(scale);
        // 更新材质亮度
        const material = markerRef.current.material as THREE.MeshStandardMaterial;
        if (material) {
          material.emissiveIntensity = 0.5 + blink * 0.5;
        }
      } else if (marker.type === 'BREAKING' || marker.type === 'CONFLICT') {
        // Breaking/conflict 脉冲动画
        const scale = 1 + Math.sin(clock.elapsedTime * 2) * 0.2;
        markerRef.current.scale.setScalar(scale);
      } else {
        // 恢复正常
        markerRef.current.scale.setScalar(1);
      }
    }
  });

  const handlePointerOver = () => {
    onHoverMarker(marker.id);
    onHoverChange(true);
  };

  const handlePointerOut = () => {
    // 如果是聚焦的标记，不清除悬停状态
    if (!isFocused) {
      onHoverMarker(null);
      onHoverChange(false);
    }
  };

  return (
    <mesh
      ref={markerRef}
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <sphereGeometry args={[0.02, 16, 16]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={isHovered || isFocused ? 0.8 : 0.4}
      />

      {/* Pixel-style popup on hover - 支持多条新闻上下并排 */}
      {shouldShowPopup && (
        <Html
          position={[0, 0.03, 0]}
          style={{
            transform: 'translate(-50%, -100%) scale(1.25)',
            transformOrigin: 'bottom center',
            pointerEvents: 'none',
          }}
        >
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
          }}>
            {/* 渲染所有标记卡片，只有最后一个显示连接线 */}
            {markersToShow.map((m, index) => (
              <MarkerPopupCard
                key={m.id}
                marker={m}
                showConnector={index === markersToShow.length - 1}
              />
            ))}
          </div>
        </Html>
      )}
    </mesh>
  );
}

// 地球组件 - 使用TopoJSON真实数据
function EarthWithBorders({
  topoData,
  markers,
  onMarkerClick,
  isPaused,
  onHoverChange,
  focusedMarkerId,
  focusBlinkEndTime,
  targetRotation,
}: {
  topoData: any;
  markers: GlobeMarker[];
  onMarkerClick: (marker: GlobeMarker) => void;
  isPaused: boolean;
  onHoverChange: (hovered: boolean) => void;
  focusedMarkerId?: string | null;
  focusBlinkEndTime?: number;
  targetRotation?: number | null; // 目标旋转角度 (Y轴)
}) {
  const groupRef = useRef<THREE.Group>(null); // 整个组（地球+标记）一起旋转
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);
  const [isAnimatingToTarget, setIsAnimatingToTarget] = useState(false);
  const animationStartRotation = useRef<number>(0);
  const animationStartTime = useRef<number>(0);

  // 解码arcs
  const decodedArcs = useMemo(() => {
    if (!topoData) return [];
    return decodeTopoJSON(topoData);
  }, [topoData]);

  // 生成地球纹理 - 使用正确的等距圆柱投影
  const earthTexture = useMemo(() => {
    if (!topoData || decodedArcs.length === 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;

    // 黑色海洋背景
    ctx.fillStyle = '#0f0f23';
    ctx.fillRect(0, 0, 2048, 1024);

    // 等距圆柱投影 (Equirectangular)
    const project = (lng: number, lat: number) => {
      const x = ((lng + 180) / 360) * 2048;
      const y = ((90 - lat) / 180) * 1024;
      return [x, y];
    };

    // 绘制陆地 + 边界
    ctx.fillStyle = '#c9d1d9'; // 浅灰色陆地
    ctx.strokeStyle = '#111111'; // 黑色边界
    ctx.lineWidth = 1.5;

    const countries = topoData.objects.countries.geometries;
    countries.forEach((country: any) => {
      if (country.arcs) {
        const polygons = country.type === 'Polygon' ? [country.arcs] : country.arcs;

        polygons.forEach((polygon: any) => {
          polygon.forEach((ring: number[]) => {
            ctx.beginPath();
            const pathCoords: number[][] = [];

            ring.forEach((arcIndex: number) => {
              const isReversed = arcIndex < 0;
              const index = isReversed ? ~arcIndex : arcIndex;
              const arc = decodedArcs[index];

              if (arc) {
                const coords = isReversed ? [...arc].reverse() : arc;
                coords.forEach(([lng, lat]: number[]) => {
                  pathCoords.push([lng, lat]);
                });
              }
            });

            // 绘制路径 (处理跨越180°的情况)
            let prevLng: number | null = null;
            pathCoords.forEach(([lng, lat], i) => {
              const [x, y] = project(lng, lat);

              // 检测是否跨越日期变更线
              if (prevLng !== null && Math.abs(lng - prevLng) > 180) {
                // 跨越了，需要分段绘制
                ctx.stroke();
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(x, y);
              } else {
                if (i === 0) {
                  ctx.moveTo(x, y);
                } else {
                  ctx.lineTo(x, y);
                }
              }

              prevLng = lng;
            });

            ctx.closePath();
            ctx.fill();
            ctx.stroke(); // 绘制边界
          });
        });
      }
    });

    // 填充南极区域（避免黑洞）
    // 使用简单的圆形填充覆盖南极点周围区域
    ctx.fillStyle = '#c9d1d9'; // 与陆地相同的颜色

    // 南极点在纹理上的位置是底部中心
    // 绘制一个填充南极的圆形区域
    const antarcticaY = 1024; // 纹理底部
    const antarcticaRadius = 36; // 覆盖南极点周围的小区域

    ctx.beginPath();
    ctx.ellipse(
      1024, // 中心X（纹理宽度的一半）
      antarcticaY, // 中心Y（底部）
      2048, // 水平半径（覆盖整个宽度）
      antarcticaRadius, // 垂直半径
      0, // 旋转
      Math.PI, // 起始角度（下半圆）
      2 * Math.PI // 结束角度
    );
    ctx.fill();

    // 从land对象中提取南极洲并填充（补充细节）
    if (topoData.objects.land) {
      const landArcs = topoData.objects.land.arcs;
      landArcs.forEach((landPolygon: any) => {
        landPolygon.forEach((ring: number[]) => {
          // 收集这个ring的所有坐标
          const ringCoords: number[][] = [];

          ring.forEach((arcIndex: number) => {
            const isReversed = arcIndex < 0;
            const index = isReversed ? ~arcIndex : arcIndex;
            const arc = decodedArcs[index];

            if (arc) {
              const coords = isReversed ? [...arc].reverse() : arc;
              coords.forEach(([lng, lat]: number[]) => {
                ringCoords.push([lng, lat]);
              });
            }
          });

          // 检查这个ring是否在南极区域（大部分点纬度 < -60）
          const southernPoints = ringCoords.filter(([, lat]) => lat < -60);
          const isAntarctica = southernPoints.length > ringCoords.length * 0.5;

          if (isAntarctica) {
            // 这是南极洲相关的多边形，绘制它
            ctx.beginPath();
            let prevLng: number | null = null;

            ringCoords.forEach(([lng, lat], i) => {
              const [x, y] = project(lng, lat);

              if (prevLng !== null && Math.abs(lng - prevLng) > 180) {
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(x, y);
              } else {
                if (i === 0) {
                  ctx.moveTo(x, y);
                } else {
                  ctx.lineTo(x, y);
                }
              }

              prevLng = lng;
            });

            ctx.closePath();
            ctx.fill();
          }
        });
      });
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.RepeatWrapping; // 水平重复，处理边缘
    return tex;
  }, [topoData, decodedArcs]);

  // 不使用3D线条绘制边界，边界已经在纹理上绘制了

  // 当有新的目标旋转时，开始动画
  useEffect(() => {
    if (targetRotation !== null && targetRotation !== undefined && groupRef.current) {
      animationStartRotation.current = groupRef.current.rotation.y;
      animationStartTime.current = Date.now();
      setIsAnimatingToTarget(true);
    }
  }, [targetRotation]);

  useFrame(() => {
    if (!groupRef.current) return;

    // 如果正在动画到目标位置
    if (isAnimatingToTarget && targetRotation !== null && targetRotation !== undefined) {
      const elapsed = Date.now() - animationStartTime.current;
      const duration = 1000; // 1秒动画
      const progress = Math.min(elapsed / duration, 1);

      // 使用 easeOutCubic 缓动函数
      const eased = 1 - Math.pow(1 - progress, 3);

      // 计算最短路径旋转
      let diff = targetRotation - animationStartRotation.current;
      // 确保旋转方向是最短的
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;

      groupRef.current.rotation.y = animationStartRotation.current + diff * eased;

      if (progress >= 1) {
        setIsAnimatingToTarget(false);
      }
      return;
    }

    // 正常自动旋转
    if (!isPaused) {
      groupRef.current.rotation.y += 0.003;
    }
  });

  if (!earthTexture) {
    return null;
  }

  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[1, 128, 128]} />
        <meshStandardMaterial map={earthTexture} />
      </mesh>

      {/* Render markers - 作为group的子元素，会随地球一起旋转 */}
      {markers.map(marker => (
        <Marker
          key={marker.id}
          marker={marker}
          onClick={() => onMarkerClick(marker)}
          onHoverChange={onHoverChange}
          hoveredMarkerId={hoveredMarkerId}
          onHoverMarker={setHoveredMarkerId}
          isFocused={focusedMarkerId === marker.id}
          focusBlinkEndTime={focusedMarkerId === marker.id ? focusBlinkEndTime : undefined}
        />
      ))}
    </group>
  );
}

// 主组件
interface GlobeViewerProps {
  markers?: GlobeMarker[];
  onMarkerClick?: (marker: GlobeMarker) => void;
  paused?: boolean; // 外部控制暂停
  onPausedChange?: (paused: boolean) => void; // 通知外部暂停状态变化
  focusedMarkerId?: string | null; // 聚焦的标记ID（搜索结果）
  onFocusClear?: () => void; // 清除聚焦
}

export function GlobeViewer({
  markers = [],
  onMarkerClick,
  paused = false,
  onPausedChange,
  focusedMarkerId,
  onFocusClear
}: GlobeViewerProps) {
  const [topoData, setTopoData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [internalPaused, setInternalPaused] = useState(false);
  const [focusBlinkEndTime, setFocusBlinkEndTime] = useState<number | undefined>();
  const [targetRotation, setTargetRotation] = useState<number | null>(null);

  // 合并外部和内部的暂停状态
  const isPaused = paused || internalPaused;

  // 当有新的聚焦标记时，计算目标旋转角度并开始闪烁
  useEffect(() => {
    if (focusedMarkerId) {
      const focusedMarker = markers.find(m => m.id === focusedMarkerId);
      if (focusedMarker) {
        // 设置闪烁结束时间（10秒后）
        setFocusBlinkEndTime(Date.now() + 10000);

        // 计算目标旋转角度，使标记位于地球正中心
        // 经度转换为Y轴旋转角度
        const lng = focusedMarker.coordinates.longitude;
        // 目标旋转角度：使经度对应的位置朝向相机
        const targetY = -((lng + 90) * Math.PI / 180);
        setTargetRotation(targetY);

        // 暂停自动旋转
        setInternalPaused(true);
        onPausedChange?.(true);

        // 10秒后取消聚焦状态
        const timer = setTimeout(() => {
          setFocusBlinkEndTime(undefined);
          onFocusClear?.();
        }, 10000);

        return () => clearTimeout(timer);
      }
    }
  }, [focusedMarkerId, markers, onPausedChange, onFocusClear]);

  const handleMarkerClick = (marker: GlobeMarker) => {
    console.log('Marker clicked:', marker);
    setInternalPaused(true); // 点击标记时暂停旋转
    onPausedChange?.(true);
    onMarkerClick?.(marker);
  };

  const handleHoverChange = (hovered: boolean) => {
    setInternalPaused(hovered); // 悬停时暂停旋转
  };

  useEffect(() => {
    // 检测是否为手机竖屏
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    fetch('/world-110m.json')
      .then(res => res.json())
      .then(data => {
        console.log('✅ Loaded TopoJSON data');
        setTopoData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('❌ Failed to load TopoJSON:', err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.875rem',
        color: '#888888'
      }}>
        Loading globe data...
      </div>
    );
  }

  if (!topoData) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.875rem',
        color: '#ff3333'
      }}>
        Failed to load globe data
      </div>
    );
  }

  // 手机端使用更远的相机距离
  const cameraDistance = isMobile ? 3.5 : 3.0;
  const minZoom = isMobile ? 2.5 : 2.0;
  const maxZoom = isMobile ? 4.5 : 4.0;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        camera={{ position: [0, 0, cameraDistance], fov: 45 }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={1.2} />
        <directionalLight position={[5, 3, 5]} intensity={1.0} />

        <EarthWithBorders
          topoData={topoData}
          markers={markers}
          onMarkerClick={handleMarkerClick}
          isPaused={isPaused}
          onHoverChange={handleHoverChange}
          focusedMarkerId={focusedMarkerId}
          focusBlinkEndTime={focusBlinkEndTime}
          targetRotation={targetRotation}
        />

        <OrbitControls
          enablePan={false}
          enableZoom={true}
          minDistance={minZoom}
          maxDistance={maxZoom}
          rotateSpeed={0.5}
          zoomSpeed={0.8}
        />
      </Canvas>
    </div>
  );
}
