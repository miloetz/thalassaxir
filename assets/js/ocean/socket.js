import { Socket } from "phoenix"

/**
 * Connect to the ocean channel and set up event handlers
 * @param {string} sessionId - The session ID from the LiveView
 * @param {object} callbacks - Event callbacks
 */
export function connectToOcean(sessionId, callbacks) {
  const {
    onParticleSpawned,
    onParticleDied,
    onParticleStormed,
    onParticleRepairing,
    onSync
  } = callbacks

  const socket = new Socket("/socket", {})
  socket.connect()

  console.log("Connecting to ocean with session:", sessionId)

  const channel = socket.channel("ocean:lobby", { session_id: sessionId })

  // Handle incoming events from server
  channel.on("particle_spawned", data => {
    onParticleSpawned?.(data)
  })

  channel.on("particle_died", data => {
    onParticleDied?.(data)
  })

  channel.on("particle_stormed", data => {
    onParticleStormed?.(data)
  })

  channel.on("particle_repairing", data => {
    onParticleRepairing?.(data)
  })

  // Join the channel
  channel.join()
    .receive("ok", ({ particles, session_id }) => {
      console.log("Joined ocean channel, session:", session_id, "syncing", particles.length, "particles")
      onSync?.(particles)
    })
    .receive("error", ({ reason }) => {
      console.error("Failed to join ocean channel:", reason)
    })

  return channel
}
