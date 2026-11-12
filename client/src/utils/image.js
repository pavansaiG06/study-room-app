/**
 * Compresses and center-crops an uploaded image into a square JPEG data URL
 * so profile pictures store cleanly in SQLite and transmit quickly over Socket.IO.
 */
export function compressAvatarImage(file, size = 256) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Please select a valid image file'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected image'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not decode the selected image'));
      img.onload = () => {
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;

        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);

        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Resizes and compresses a wide banner/cover image (for Room covers & Profile banners).
 */
export function compressBannerImage(file, maxWidth = 960, maxHeight = 360) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Please select a valid image file'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected image'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not decode the selected image'));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width, maxHeight / img.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Built-in vector/gradient cover presets for "Choose from your covers"
export const PRESET_COVERS = [
  {
    id: 'lofi-desk',
    label: 'Lofi Midnight Desk',
    url: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 300"><defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1e1b4b"/><stop offset="50%" stop-color="#312e81"/><stop offset="100%" stop-color="#0f172a"/></linearGradient><radialGradient id="glow" cx="70%" cy="30%" r="50%"><stop offset="0%" stop-color="#ec4899" stop-opacity="0.35"/><stop offset="100%" stop-color="#ec4899" stop-opacity="0"/></radialGradient></defs><rect width="800" height="300" fill="url(#g1)"/><rect width="800" height="300" fill="url(#glow)"/><circle cx="620" cy="70" r="32" fill="#f472b6" opacity="0.25"/><path d="M0 240 Q200 180 400 220 T800 200 L800 300 L0 300 Z" fill="#090d16" opacity="0.7"/></svg>`)}`
  },
  {
    id: 'aurora-peaks',
    label: 'Aurora Borealis',
    url: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 300"><defs><linearGradient id="g2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#042f2e"/><stop offset="50%" stop-color="#1e1b4b"/><stop offset="100%" stop-color="#2e1065"/></linearGradient></defs><rect width="800" height="300" fill="url(#g2)"/><path d="M0 160 Q220 60 440 150 T800 110 L800 300 L0 300 Z" fill="#06b6d4" opacity="0.2"/><path d="M0 210 Q250 130 500 200 T800 180 L800 300 L0 300 Z" fill="#8b5cf6" opacity="0.25"/></svg>`)}`
  },
  {
    id: 'cyber-grid',
    label: 'Cyber Study Grid',
    url: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 300"><defs><linearGradient id="g3" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#1e1b4b"/></linearGradient></defs><rect width="800" height="300" fill="url(#g3)"/><g stroke="#8b5cf6" stroke-opacity="0.22" stroke-width="1"><line x1="0" y1="60" x2="800" y2="60"/><line x1="0" y1="120" x2="800" y2="120"/><line x1="0" y1="180" x2="800" y2="180"/><line x1="0" y1="240" x2="800" y2="240"/><line x1="160" y1="0" x2="160" y2="300"/><line x1="320" y1="0" x2="320" y2="300"/><line x1="480" y1="0" x2="480" y2="300"/><line x1="640" y1="0" x2="640" y2="300"/></g></svg>`)}`
  },
  {
    id: 'warm-sunset',
    label: 'Cozy Dusk',
    url: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 300"><defs><linearGradient id="g4" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#451a03"/><stop offset="50%" stop-color="#7c2d12"/><stop offset="100%" stop-color="#3b0764"/></linearGradient></defs><rect width="800" height="300" fill="url(#g4)"/><circle cx="400" cy="170" r="85" fill="#fb923c" opacity="0.28"/><path d="M0 240 Q300 200 800 240 L800 300 L0 300 Z" fill="#0b0e14" opacity="0.8"/></svg>`)}`
  }
];
