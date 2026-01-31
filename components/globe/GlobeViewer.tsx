import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

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

// 地球组件 - 使用TopoJSON真实数据
function EarthWithBorders({ topoData }: { topoData: any }) {
  const earthRef = useRef<THREE.Mesh>(null);

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

  useFrame(() => {
    if (earthRef.current) {
      earthRef.current.rotation.y += 0.003;
    }
  });

  if (!earthTexture) {
    return null;
  }

  return (
    <group>
      <mesh ref={earthRef}>
        <sphereGeometry args={[1, 128, 128]} />
        <meshStandardMaterial map={earthTexture} />
      </mesh>
    </group>
  );
}

// 主组件
export function GlobeViewer() {
  const [topoData, setTopoData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

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

        <EarthWithBorders topoData={topoData} />

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
