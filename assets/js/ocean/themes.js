/**
 * Theme configurations for Thalassaxir
 *
 * Pirate: Warm, wooden, old-world sailing
 * Modern: Dark, sleek, neon/wireframe
 */

export const THEMES = {
  modern: {
    name: 'modern',

    // Ocean visuals
    ocean: {
      backgroundColor: 0x000000,
      fogColor: 0x000000,
      fogDensity: 0.008,
      wireframeColor: 0x0a0f14,
      pointColor: { r: 0.08, g: 0.1, b: 0.12 },
      waterStyle: 'wireframe'
    },

    // Ship styling
    ship: {
      hullColor: '#ffffff',
      glowColor: '#ffffff',
      glowIntensity: 0.4
    },

    // UI styling
    ui: {
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      primaryColor: '#ffffff',
      accentColor: '#00ffff',
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      borderColor: 'rgba(255, 255, 255, 0.1)',
      textColor: 'rgba(255, 255, 255, 0.8)'
    },

    // Animation styles
    animations: {
      deathType: 'pixelate',
      repairType: 'reassemble'
    }
  },

  pirate: {
    name: 'pirate',

    // Ocean visuals - warm parchment/cream
    ocean: {
      backgroundColor: 0xf5f0e6,
      fogColor: 0xf5f0e6,
      fogDensity: 0.003,
      wireframeColor: 0x8b7355,
      pointColor: { r: 0.55, g: 0.45, b: 0.35 },
      waterStyle: 'solid',
      waterColor: 0x5a8a9a,
      waterOpacity: 0.95
    },

    // Ship styling - wooden/warm
    ship: {
      hullColor: '#d4a574',  // warm wood
      glowColor: '#ffcc88',
      glowIntensity: 0.3
    },

    // UI styling - parchment/map feel
    ui: {
      // TODO: User will add their own fonts
      fontFamily: "'Georgia', serif",
      primaryColor: '#d4a574',
      accentColor: '#ffcc88',
      backgroundColor: 'rgba(20, 15, 10, 0.8)',
      borderColor: 'rgba(212, 165, 116, 0.3)',
      textColor: 'rgba(245, 222, 179, 0.9)'
    },

    // Animation styles
    animations: {
      deathType: 'sink',
      repairType: 'ghostRise'
    }
  }
}

export function getTheme(name) {
  return THEMES[name] || THEMES.modern
}
