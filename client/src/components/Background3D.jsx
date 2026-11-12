import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, RotateCcw, X, Upload } from 'lucide-react';
import { useToast } from './Toast';

export function Background3D({ showSettingsModal, onCloseSettings }) {
  const containerRef = useRef(null);
  const [customBg, setCustomBg] = useState(() => localStorage.getItem('studyhub_custom_bg'));
  const { addToast } = useToast();

  // 3D Bioluminescent Aurora Wave + Floating Crystals Effect (lazy-loaded)
  useEffect(() => {
    if (customBg) return; // If custom image is set, skip 3D canvas
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let cleanup = () => {};

    import('three').then(({
      Scene,
      FogExp2,
      PerspectiveCamera,
      WebGLRenderer,
      BufferGeometry,
      Color,
      BufferAttribute,
      PointsMaterial,
      Points,
      IcosahedronGeometry,
      OctahedronGeometry,
      MeshBasicMaterial,
      Mesh,
      AdditiveBlending
    }) => {
      if (cancelled) return;

      const scene = new Scene();
      scene.fog = new FogExp2(0x0b0e14, 0.0022);

      const camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 1500);
      camera.position.set(0, 55, 220);
      camera.lookAt(0, 10, 0);

      const renderer = new WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.innerHTML = '';
      container.appendChild(renderer.domElement);

      // ---- Layer 1: Undulating Bioluminescent Aurora Particle Wave ----
      const cols = 56;
      const rows = 40;
      const spacing = 18;
      const waveCount = cols * rows;
      const waveGeometry = new BufferGeometry();
      const wavePositions = new Float32Array(waveCount * 3);
      const waveColors = new Float32Array(waveCount * 3);

      const cCyan = new Color(0x06b6d4);
      const cPurple = new Color(0x8b5cf6);
      const cPink = new Color(0xec4899);
      const tmpColor = new Color();

      let ptr = 0;
      for (let ix = 0; ix < cols; ix++) {
        for (let iz = 0; iz < rows; iz++) {
          const x = (ix - cols / 2) * spacing;
          const z = (iz - rows / 2) * spacing;
          wavePositions[ptr * 3] = x;
          wavePositions[ptr * 3 + 1] = -35;
          wavePositions[ptr * 3 + 2] = z;

          const t = ix / cols;
          if (t < 0.5) {
            tmpColor.copy(cCyan).lerp(cPurple, t * 2);
          } else {
            tmpColor.copy(cPurple).lerp(cPink, (t - 0.5) * 2);
          }
          waveColors[ptr * 3] = tmpColor.r;
          waveColors[ptr * 3 + 1] = tmpColor.g;
          waveColors[ptr * 3 + 2] = tmpColor.b;
          ptr++;
        }
      }

      waveGeometry.setAttribute('position', new BufferAttribute(wavePositions, 3));
      waveGeometry.setAttribute('color', new BufferAttribute(waveColors, 3));

      const waveMaterial = new PointsMaterial({
        size: 2.6,
        vertexColors: true,
        transparent: true,
        opacity: 0.72,
        blending: AdditiveBlending,
        depthWrite: false
      });

      const auroraWave = new Points(waveGeometry, waveMaterial);
      scene.add(auroraWave);

      // ---- Layer 2: Floating Wireframe Polyhedral Crystals ----
      const crystalConfigs = [
        { type: 'ico', radius: 22, color: 0x8b5cf6, x: -130, y: 55, z: -40, speed: 0.4 },
        { type: 'oct', radius: 16, color: 0x06b6d4, x: 140, y: 70, z: -80, speed: 0.55 },
        { type: 'ico', radius: 28, color: 0xec4899, x: 95, y: 15, z: -150, speed: 0.3 },
        { type: 'oct', radius: 14, color: 0x3b82f6, x: -75, y: 85, z: -130, speed: 0.5 },
        { type: 'ico', radius: 18, color: 0x22d3ee, x: 0, y: 110, z: -190, speed: 0.35 }
      ];

      const crystals = crystalConfigs.map((cfg, idx) => {
        const geo = cfg.type === 'ico'
          ? new IcosahedronGeometry(cfg.radius, 0)
          : new OctahedronGeometry(cfg.radius, 0);
        const mat = new MeshBasicMaterial({
          color: cfg.color,
          wireframe: true,
          transparent: true,
          opacity: 0.22
        });
        const mesh = new Mesh(geo, mat);
        mesh.position.set(cfg.x, cfg.y, cfg.z);
        scene.add(mesh);
        return { mesh, geo, mat, baseY: cfg.y, speed: cfg.speed, phase: idx * 1.4 };
      });

      // ---- Layer 3: Rising Ambient Starlight Fireflies ----
      const dustCount = 350;
      const dustGeometry = new BufferGeometry();
      const dustPositions = new Float32Array(dustCount * 3);
      const dustColors = new Float32Array(dustCount * 3);
      const dustPalette = [cCyan, cPurple, cPink, new Color(0xe2e8f0)];

      for (let i = 0; i < dustCount; i++) {
        dustPositions[i * 3] = (Math.random() - 0.5) * 650;
        dustPositions[i * 3 + 1] = Math.random() * 320 - 60;
        dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 500 - 40;
        const c = dustPalette[Math.floor(Math.random() * dustPalette.length)];
        dustColors[i * 3] = c.r;
        dustColors[i * 3 + 1] = c.g;
        dustColors[i * 3 + 2] = c.b;
      }

      dustGeometry.setAttribute('position', new BufferAttribute(dustPositions, 3));
      dustGeometry.setAttribute('color', new BufferAttribute(dustColors, 3));

      const dustMaterial = new PointsMaterial({
        size: 2.0,
        vertexColors: true,
        transparent: true,
        opacity: 0.65,
        blending: AdditiveBlending,
        depthWrite: false
      });

      const fireflies = new Points(dustGeometry, dustMaterial);
      scene.add(fireflies);

      let animationFrameId;
      let targetCamX = 0;
      let targetCamY = 55;
      let time = 0;

      const onMouseMove = (e) => {
        const nx = (e.clientX / window.innerWidth - 0.5) * 2;
        const ny = (e.clientY / window.innerHeight - 0.5) * 2;
        targetCamX = nx * 28;
        targetCamY = 55 - ny * 18;
      };
      window.addEventListener('mousemove', onMouseMove);

      const onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener('resize', onResize);

      const animate = () => {
        animationFrameId = requestAnimationFrame(animate);
        time += 0.018;

        // Smooth camera parallax
        camera.position.x += (targetCamX - camera.position.x) * 0.04;
        camera.position.y += (targetCamY - camera.position.y) * 0.04;
        camera.lookAt(0, 10, 0);

        // Animate aurora wave ripples
        const posArr = waveGeometry.attributes.position.array;
        let idx = 0;
        for (let ix = 0; ix < cols; ix++) {
          for (let iz = 0; iz < rows; iz++) {
            posArr[idx * 3 + 1] =
              -32 +
              Math.sin((ix + time * 1.4) * 0.24) * 14 +
              Math.cos((iz + time * 1.1) * 0.28) * 12;
            idx++;
          }
        }
        waveGeometry.attributes.position.needsUpdate = true;

        // Animate floating wireframe crystals
        crystals.forEach((c) => {
          c.mesh.rotation.x += 0.003 * c.speed;
          c.mesh.rotation.y += 0.005 * c.speed;
          c.mesh.position.y = c.baseY + Math.sin(time * 0.8 + c.phase) * 8;
        });

        // Animate rising fireflies
        const dustArr = dustGeometry.attributes.position.array;
        for (let i = 0; i < dustCount; i++) {
          dustArr[i * 3 + 1] += 0.14;
          if (dustArr[i * 3 + 1] > 260) {
            dustArr[i * 3 + 1] = -60;
          }
        }
        dustGeometry.attributes.position.needsUpdate = true;

        renderer.render(scene, camera);
      };
      animate();

      cleanup = () => {
        cancelAnimationFrame(animationFrameId);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('resize', onResize);
        if (renderer.domElement && container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
        waveGeometry.dispose();
        waveMaterial.dispose();
        dustGeometry.dispose();
        dustMaterial.dispose();
        crystals.forEach((c) => {
          c.geo.dispose();
          c.mat.dispose();
        });
        renderer.dispose();
      };
    });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [customBg]);

  const handleImageUpload = (file) => {
    if (!file || !file.type.startsWith('image/')) {
      addToast('Please choose an image file', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Downscale image to max 1920px to fit in storage safely
        const scale = Math.min(1, 1920 / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        try {
          localStorage.setItem('studyhub_custom_bg', dataUrl);
          setCustomBg(dataUrl);
          addToast('Custom background updated!', 'success');
          onCloseSettings();
        } catch (err) {
          addToast('Image too large for browser storage', 'error');
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleReset = () => {
    localStorage.removeItem('studyhub_custom_bg');
    setCustomBg(null);
    addToast('Reset to 3D Aurora & Crystals theme', 'info');
    onCloseSettings();
  };

  return (
    <>
      {/* Background container */}
      {customBg ? (
        <div
          className="fixed inset-0 z-0 bg-cover bg-center transition-all duration-700 pointer-events-none"
          style={{ backgroundImage: `url(${customBg})` }}
        >
          <div className="absolute inset-0 bg-dark-900/75 backdrop-blur-[2px]" />
        </div>
      ) : (
        <div ref={containerRef} className="fixed inset-0 z-0 pointer-events-none" />
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm modal-backdrop-enter">
          <div className="glass-panel modal-panel-enter w-full max-w-md max-h-[90dvh] overflow-y-auto p-5 sm:p-6 rounded-2xl shadow-2xl relative">
            <button
              onClick={onCloseSettings}
              className="touch-control btn-tactile absolute top-3.5 right-3.5 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-brand-purple" />
              Customize Workspace Background
            </h3>
            <p className="text-sm text-slate-400 mb-6">
              Pick a photo from your computer for your private workspace or reset to the 3D Aurora Wave &amp; Crystals theme.
            </p>

            <label className="flex flex-col items-center justify-center border-2 border-dashed border-white/20 hover:border-brand-purple/60 rounded-xl p-8 cursor-pointer transition-colors bg-dark-900/40 mb-4 group">
              <Upload className="w-10 h-10 text-slate-400 group-hover:text-brand-purple transition-colors mb-2" />
              <span className="text-sm font-medium text-slate-300">Choose photo or drag and drop</span>
              <span className="text-xs text-slate-500 mt-1">PNG, JPG up to 10MB</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
              />
            </label>

            {customBg && (
              <button
                onClick={handleReset}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-white/10 hover:bg-white/5 text-slate-300 text-sm font-medium transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Reset to 3D Aurora Theme
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
