import { OceanScene } from '../ocean/scene'
import { connectToOcean } from '../ocean/socket'

/**
 * Phoenix LiveView Hook that bridges LiveView with Three.js ocean visualization
 */
export const OceanHook = {
  mounted() {
    console.log("OceanHook mounted")

    // Get session ID and theme from data attributes
    const sessionId = this.el.dataset.sessionId
    const theme = this.el.dataset.theme || 'pirate'
    console.log("Session ID:", sessionId, "Theme:", theme)

    // Initialize Three.js scene
    this.scene = new OceanScene(this.el)

    // Set theme immediately
    this.scene.setTheme(theme)

    // Connect to Phoenix channel with session ID
    this.channel = connectToOcean(sessionId, {
      onParticleSpawned: (data) => {
        console.log("Ship spawned:", data.id, data)
        this.scene.addParticle(data.id, data.position, data.color)
      },

      onParticleDied: (data) => {
        console.log("Ship died:", data.id, data.reason)
        this.scene.playDeathAnimation(data.id, data.position, data.reason)
      },

      onParticleStormed: (data) => {
        console.log("Ship stormed:", data)
        try {
          this.scene.playStormAnimation(data.id)
        } catch (e) {
          console.error("Storm animation error:", e)
        }
      },

      onParticleRepairing: (data) => {
        console.log("Ship repairing:", data.id)
        this.scene.playRepairAnimation(data.id, data.position, data.color)
      },

      onSync: (particles) => {
        console.log("Syncing ships:", particles.length)
        this.scene.syncParticles(particles)
      }
    })

    // Listen for health updates from LiveView
    this.handleEvent("health_update", (data) => {
      this.scene.setHealth(data.health)
    })

    // Listen for theme changes from LiveView
    this.handleEvent("theme_changed", (data) => {
      console.log("Theme event received:", data)
      this.scene.setTheme(data.theme)
    })

    // Handle click on ships (disabled - use buttons instead)
    // this.el.addEventListener('click', (e) => {
    //   const shipId = this.scene.getClickedShipId(e)
    //   if (shipId) {
    //     console.log("Crashing ship:", shipId)
    //     this.channel.push("crash_particle", { id: shipId })
    //   }
    // })
  },

  destroyed() {
    console.log("OceanHook destroyed")
    if (this.channel) {
      this.channel.leave()
    }
    if (this.scene) {
      this.scene.dispose()
    }
  }
}
