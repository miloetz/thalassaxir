import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js'
import { getTheme } from './themes'

/**
 * OceanScene - Enhanced ocean visualization with ships representing processes
 */
export class OceanScene {
  constructor(container) {
    this.container = container
    this.particles = new Map()
    this.gridSize = 80
    this.segmentSize = 1.5
    this.clock = new THREE.Clock()
    this.mouse = new THREE.Vector2()
    this.raycaster = new THREE.Raycaster()
    this.hoveredParticle = null

    // Shared ship geometry (created once, reused for all ships)
    this.shipGeometry = null
    this.shipMaterial = null

    // Active animations
    this.activeAnimations = new Map()

    // Theme (modern or pirate)
    this.currentTheme = 'pirate'

    // Tooltip element
    this.tooltip = null
    this.createTooltip()

    this.init()
    this.createShipGeometry()
    this.setupMouseEvents()
    this.animate()
  }

  createTooltip() {
    this.tooltip = document.createElement('div')
    this.tooltip.className = 'particle-tooltip'
    this.tooltip.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 1000;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 11px;
      color: #ffffff;
      opacity: 0;
      transition: opacity 0.15s ease;
      transform: translate(-50%, -100%);
      margin-top: -15px;
      white-space: nowrap;
      text-shadow: 0 1px 3px rgba(0,0,0,0.8), 0 0 10px rgba(0,0,0,0.5);
    `
    document.body.appendChild(this.tooltip)
  }

  showTooltip(data, x, y) {
    if (!this.tooltip) return
    
    const uptime = this.formatUptime(data.uptime_ms)
    const pid = data.pid || 'unknown'
    const id = data.id || 'unknown'
    
    this.tooltip.innerHTML = `
      <span style="font-weight: 600;">${id.slice(0, 12)}</span>
      <span style="color: #888;"> · </span>
      <span style="color: #aaa;">${pid.slice(-10)}</span>
      <span style="color: #666;"> · </span>
      <span style="color: #ccc;">${uptime}</span>
    `
    
    this.tooltip.style.left = x + 'px'
    this.tooltip.style.top = y + 'px'
    this.tooltip.style.opacity = '1'
  }

  hideTooltip() {
    if (this.tooltip) {
      this.tooltip.style.opacity = '0'
    }
  }

  hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  formatUptime(ms) {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    const mins = Math.floor(ms / 60000)
    const secs = Math.floor((ms % 60000) / 1000)
    return `${mins}m ${secs}s`
  }

  init() {
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x000000)
    this.scene.fog = new THREE.FogExp2(0x000000, 0.008)

    const aspect = this.container.clientWidth / this.container.clientHeight
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000)
    this.camera.position.set(0, 80, 100)
    this.camera.lookAt(0, 0, 0)

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.localClippingEnabled = true
    this.container.appendChild(this.renderer.domElement)

    // Ocean boundary with clipping walls
    this.oceanBound = 60
    this.fadeStart = 42
    this.clippingPlanes = [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), this.oceanBound),
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), this.oceanBound),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), this.oceanBound),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), this.oceanBound),
    ]

    // Add lights for GLB models - adjust based on theme
    const ambientIntensity = this.currentTheme === 'pirate' ? 0.15 : 0.5
    const directionalIntensity = this.currentTheme === 'pirate' ? 0.2 : 1.0
    
    const ambientLight = new THREE.AmbientLight(0xffffff, ambientIntensity)
    this.scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, directionalIntensity)
    directionalLight.position.set(50, 100, 50)
    this.scene.add(directionalLight)

    this.createOceanGrid()
    this.createHealthOrb()
    this.createParticleSystem()

    // Apply initial theme (pirate = cream bg + solid water)
    this.applyTheme(this.currentTheme)

    this.boundResize = () => this.onResize()
    window.addEventListener('resize', this.boundResize)
  }

  applyTheme(themeName) {
    const theme = getTheme(themeName)

    // Background and fog
    this.scene.background = new THREE.Color(theme.ocean.backgroundColor)
    this.scene.fog.color = new THREE.Color(theme.ocean.fogColor)
    this.scene.fog.density = theme.ocean.fogDensity

    // Ocean style
    if (theme.ocean.waterStyle === 'solid') {
      this.oceanMesh.visible = false
      this.oceanPoints.visible = false
      this.oceanWater.visible = true
      if (theme.ocean.waterColor) {
        this.oceanWater.material.uniforms.waterColor.value = new THREE.Color(theme.ocean.waterColor)
      }
    } else {
      this.oceanMesh.visible = true
      this.oceanPoints.visible = true
      this.oceanWater.visible = false
    }

    // Lighting - brighter for pirate mode so ships are visible
    this.scene.traverse((child) => {
      if (child.isAmbientLight) {
        child.intensity = themeName === 'pirate' ? 0.6 : 0.5
      }
      if (child.isDirectionalLight) {
        child.intensity = themeName === 'pirate' ? 0.8 : 1.0
      }
    })
  }

  setupMouseEvents() {
    this.onMouseMove = (e) => {
      const rect = this.container.getBoundingClientRect()
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    }
    
    this.onMouseLeave = () => {
      this.hideTooltip()
      if (this.hoveredParticle) {
        this.setShipHover(this.hoveredParticle, 0)
        this.restoreShipScale(this.hoveredParticle)
        this.hoveredParticle = null
      }
    }
    
    this.container.addEventListener('mousemove', this.onMouseMove)
    this.container.addEventListener('mouseleave', this.onMouseLeave)
  }

  createShipGeometry() {
    // Load GLB and OBJ ship models
    const gltfLoader = new GLTFLoader()
    const objLoader = new OBJLoader()
    const mtlLoader = new MTLLoader()
    
    this.shipModels = {}
    this.modelsLoaded = 0
    this.totalModels = 2
    
    // Load pirate ship OBJ with MTL for 1726 mode
    console.log('Starting to load pirate ship...')
    mtlLoader.load('/models/pirate_ship.mtl', (materials) => {
      console.log('MTL loaded, loading OBJ...')
      materials.preload()
      objLoader.setMaterials(materials)
      objLoader.load('/models/pirate_ship.obj', (model) => {
        console.log('Pirate OBJ loaded successfully')
        model.traverse((child) => {
          if (child.isMesh) {
            // Keep original texture but slightly darker
            const origColor = child.material?.color
            child.material = new THREE.MeshStandardMaterial({
              color: origColor ? origColor : 0x8b5a2b,
              roughness: 0.85,
              metalness: 0.05,
              side: THREE.DoubleSide
            })
            // Make back faces (inside) render as black
            child.material.onBeforeCompile = (shader) => {
              shader.fragmentShader = shader.fragmentShader.replace(
                '#include <output_fragment>',
                `#include <output_fragment>
                if (!gl_FrontFacing) {
                  gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                }`
              )
            }
          }
        })
        this.shipModels.pirate = model
        this.modelsLoaded++
        console.log('Pirate ship model ready, modelsLoaded:', this.modelsLoaded)
      }, undefined, (err) => {
        console.error('Error loading pirate ship OBJ:', err)
        this.modelsLoaded++
      })
    }, undefined, (err) => {
      console.error('Error loading MTL:', err)
      this.modelsLoaded++
    })
    
    // Load frigate GLB for modern mode
    console.log('Starting to load frigate...')
    gltfLoader.load('/models/frigate.glb', (gltf) => {
      console.log('Frigate GLB loaded successfully')
      const model = gltf.scene
      let meshCount = 0
      model.traverse((child) => {
        if (child.isMesh) {
          meshCount++
          // Bright glowing ship for modern mode
          child.material = new THREE.MeshStandardMaterial({
            color: 0x88ccff,
            roughness: 0.3,
            metalness: 0.6,
            emissive: 0x88ccff,
            emissiveIntensity: 0.8,
            side: THREE.DoubleSide
          })
          // Make back faces (inside) render as black
          child.material.onBeforeCompile = (shader) => {
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <output_fragment>',
              `#include <output_fragment>
              if (!gl_FrontFacing) {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
              }`
            )
          }
        }
      })
      console.log('Frigate total meshes:', meshCount)
      this.shipModels.modern = model
      this.modelsLoaded++
      console.log('Frigate model ready, modelsLoaded:', this.modelsLoaded)
    }, undefined, (err) => {
      console.error('Error loading frigate:', err)
      this.modelsLoaded++
    })
  }

  createParticleSystem() {
    // Create individual ship meshes that we can raycast against
    this.particleGroup = new THREE.Group()
    this.scene.add(this.particleGroup)
  }

  addParticle(id, position, color) {
    if (this.particles.has(id)) return

    console.log("addParticle called:", id, position, color)

    // Parse position
    const x = position?.x || 0
    const y = position?.y || 0
    const z = position?.z || 0

    console.log("Ship position:", x, y, z)

    // Use theme color if no specific color provided
    const theme = getTheme(this.currentTheme)
    const shipColor = color || theme.ship.hullColor

    // Create ship group
    const shipGroup = new THREE.Group()

    // Use model if it exists, regardless of load count
    const themeKey = this.currentTheme === 'pirate' ? 'pirate' : 'modern'
    const model = this.shipModels[themeKey]

    // Use GLB model if loaded
    if (model) {
      const shipMesh = model.clone()
      if (themeKey === 'pirate') {
        shipMesh.scale.setScalar(1.5)
      } else {
        // Frigate: much bigger
        shipMesh.scale.set(0.15, 0.25, 0.15)
      }
      // Apply clipping planes and black interior to all materials
      shipMesh.traverse((child) => {
        if (child.material) {
          child.material = child.material.clone()
          child.material.clippingPlanes = this.clippingPlanes
          child.material.clipShadows = true
          child.material.side = THREE.DoubleSide
          // Make back faces (inside) render as black
          child.material.onBeforeCompile = (shader) => {
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <output_fragment>',
              `#include <output_fragment>
              if (!gl_FrontFacing) {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
              }`
            )
          }
          child.material.needsUpdate = true
        }
      })
      shipGroup.add(shipMesh)

      shipGroup.userData = {
        id,
        position: { x, y: y + 3, z },
        color: shipColor,
        velocity: {
          x: (Math.random() - 0.5) * 0.15,
          y: 0,
          z: (Math.random() - 0.5) * 0.15
        },
        heading: Math.random() * Math.PI * 2,
        baseY: y + 3,
        isGLB: true,
        themeKey: themeKey
      }
    } else {
      // Fallback to procedural ship
      const hullMaterial = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          shipColor: { value: new THREE.Color(shipColor) },
          hover: { value: 0 },
          fadeStart: { value: this.fadeStart },
          fadeEnd: { value: this.oceanBound }
        },
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying vec3 vWorldPos;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vPosition = position;
            vec4 worldPos = modelMatrix * vec4(position, 1.0);
            vWorldPos = worldPos.xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float time;
          uniform vec3 shipColor;
          uniform float hover;
          uniform float fadeStart;
          uniform float fadeEnd;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying vec3 vWorldPos;
          void main() {
            float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 1.8);
            float pulse = sin(time * 2.0) * 0.1 + 0.9;
            vec3 col = shipColor * 0.7 * pulse;
            col += shipColor * fresnel * 0.5;
            col += vec3(1.0) * hover * 0.3;

            // Edge fade
            float distX = abs(vWorldPos.x);
            float distZ = abs(vWorldPos.z);
            float maxDist = max(distX, distZ);
            float edgeFade = 1.0 - smoothstep(fadeStart, fadeEnd, maxDist);

            if (!gl_FrontFacing) {
              gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
            } else {
              gl_FragColor = vec4(col, 0.95 * edgeFade);
            }
          }
        `,
        transparent: true,
        side: THREE.DoubleSide,
        clippingPlanes: this.clippingPlanes
      })

      const hullShape = new THREE.Shape()
      hullShape.moveTo(0, -1.5)
      hullShape.lineTo(0.6, -0.5)
      hullShape.lineTo(0.7, 0.8)
      hullShape.lineTo(0.5, 1.2)
      hullShape.lineTo(-0.5, 1.2)
      hullShape.lineTo(-0.7, 0.8)
      hullShape.lineTo(-0.6, -0.5)
      hullShape.closePath()

      const hullGeometry = new THREE.ExtrudeGeometry(hullShape, { depth: 0.6, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 2 })
      hullGeometry.rotateX(Math.PI / 2)
      hullGeometry.translate(0, 0.3, 0)

      const mastGeometry = new THREE.CylinderGeometry(0.08, 0.1, 2.5, 8)
      mastGeometry.translate(0, 1.25, 0)

      const sailShape = new THREE.Shape()
      sailShape.moveTo(0, 0)
      sailShape.lineTo(1.2, 0.3)
      sailShape.lineTo(0, 2)
      sailShape.closePath()
      const sailGeometry = new THREE.ShapeGeometry(sailShape)
      sailGeometry.translate(0.1, 0.5, 0)

      const mastMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(shipColor).multiplyScalar(0.4),
        transparent: true,
        opacity: 0.9,
        clippingPlanes: this.clippingPlanes
      })

      const sailMaterial = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          shipColor: { value: new THREE.Color(shipColor) },
          hover: { value: 0 },
          fadeStart: { value: this.fadeStart },
          fadeEnd: { value: this.oceanBound }
        },
        vertexShader: `
          varying vec2 vUv;
          varying vec3 vNormal;
          varying vec3 vWorldPos;
          void main() {
            vUv = uv;
            vNormal = normalize(normalMatrix * normal);
            vec4 worldPos = modelMatrix * vec4(position, 1.0);
            vWorldPos = worldPos.xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float time;
          uniform vec3 shipColor;
          uniform float hover;
          uniform float fadeStart;
          uniform float fadeEnd;
          varying vec2 vUv;
          varying vec3 vNormal;
          varying vec3 vWorldPos;
          void main() {
            float wave = sin(vUv.y * 6.0 + time * 3.0) * 0.1 + 0.9;
            vec3 col = shipColor * wave + vec3(1.0) * hover * 0.2;

            // Edge fade
            float distX = abs(vWorldPos.x);
            float distZ = abs(vWorldPos.z);
            float maxDist = max(distX, distZ);
            float edgeFade = 1.0 - smoothstep(fadeStart, fadeEnd, maxDist);

            if (!gl_FrontFacing) {
              gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
            } else {
              gl_FragColor = vec4(col, (0.85 + vUv.y * 0.1) * edgeFade);
            }
          }
        `,
        transparent: true,
        side: THREE.DoubleSide,
        clippingPlanes: this.clippingPlanes
      })

      const hull = new THREE.Mesh(hullGeometry.clone(), hullMaterial)
      const mast = new THREE.Mesh(mastGeometry.clone(), mastMaterial)
      const sail = new THREE.Mesh(sailGeometry.clone(), sailMaterial)

      shipGroup.add(hull)
      shipGroup.add(mast)
      shipGroup.add(sail)

      shipGroup.scale.setScalar(1.5)

      shipGroup.userData = {
        id,
        position: { x, y: y + 3, z },
        color: shipColor,
        velocity: { x: (Math.random() - 0.5) * 0.15, y: 0, z: (Math.random() - 0.5) * 0.15 },
        heading: Math.random() * Math.PI * 2,
        baseY: y + 3,
        hullMaterial,
        sailMaterial,
        isGLB: false
      }
    }

    shipGroup.position.set(x, y + 3, z)
    shipGroup.rotation.y = shipGroup.userData.heading

    // Add glow underneath
    const glowMaterial = new THREE.SpriteMaterial({
      map: this.createGlowTexture(shipColor),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.4
    })
    // Note: SpriteMaterial doesn't support clipping planes directly
    const glow = new THREE.Sprite(glowMaterial)
    glow.scale.setScalar(5)
    glow.position.y = -0.5
    shipGroup.add(glow)
    shipGroup.userData.glow = glow

    this.particleGroup.add(shipGroup)
    this.particles.set(id, shipGroup)
  }

  createGlowTexture(color) {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
    gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)')
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)')
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
    
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 64, 64)
    
    const texture = new THREE.CanvasTexture(canvas)
    return texture
  }

  removeParticle(id) {
    console.log("removeParticle called:", id)
    const ship = this.particles.get(id)
    if (ship) {
      console.log("Removing ship from scene:", id)
      // Remove mirror if it exists
      const data = ship.userData
      if (data.mirror) {
        this.particleGroup.remove(data.mirror)
        data.mirror.traverse((child) => {
          if (child.geometry) child.geometry.dispose()
          if (child.material) {
            if (child.material.map) child.material.map.dispose()
            child.material.dispose()
          }
        })
      }

      this.particleGroup.remove(ship)
      // Dispose all children geometries and materials
      ship.traverse((child) => {
        if (child.geometry) child.geometry.dispose()
        if (child.material) {
          if (child.material.map) child.material.map.dispose()
          child.material.dispose()
        }
      })
      this.particles.delete(id)
      console.log("Ship removed, remaining particles:", this.particles.size)
    } else {
      console.log("Ship not found for removal:", id)
    }
  }

  syncParticles(particles) {
    // Clear existing ships
    this.particles.forEach((ship, id) => {
      this.particleGroup.remove(ship)
      ship.traverse((child) => {
        if (child.geometry) child.geometry.dispose()
        if (child.material) {
          if (child.material.map) child.material.map.dispose()
          child.material.dispose()
        }
      })
    })
    this.particles.clear()

    // Add all ships
    particles.forEach(p => {
      this.addParticle(p.id, p.position, p.color)
    })
  }

  checkHover(time) {
    this.raycaster.setFromCamera(this.mouse, this.camera)

    // Check intersections with all ship children (hull, mast, sail)
    const intersects = this.raycaster.intersectObjects(this.particleGroup.children, true)

    if (intersects.length > 0) {
      // Get the ship group (parent of the hit mesh)
      let ship = intersects[0].object
      while (ship.parent && ship.parent !== this.particleGroup) {
        ship = ship.parent
      }

      const userData = ship.userData

      if (this.hoveredParticle !== ship) {
        // Unhover previous
        if (this.hoveredParticle) {
          this.setShipHover(this.hoveredParticle, 0)
          this.restoreShipScale(this.hoveredParticle)
        }

        // Hover new
        this.hoveredParticle = ship
        this.setShipHover(ship, 1)
        this.enlargeShipScale(ship)

        // Show tooltip
        const screenPos = this.getScreenPosition(ship)
        this.showTooltip(userData, screenPos.x, screenPos.y)
      } else {
        // Update tooltip position
        const screenPos = this.getScreenPosition(ship)
        this.showTooltip(userData, screenPos.x, screenPos.y)
      }
    } else {
      if (this.hoveredParticle) {
        this.setShipHover(this.hoveredParticle, 0)
        this.restoreShipScale(this.hoveredParticle)
        this.hoveredParticle = null
        this.hideTooltip()
      }
    }
  }

  setShipHover(ship, value) {
    const data = ship.userData
    if (data.hullMaterial) {
      data.hullMaterial.uniforms.hover.value = value
    }
    if (data.sailMaterial) {
      data.sailMaterial.uniforms.hover.value = value
    }
  }

  enlargeShipScale(ship) {
    const data = ship.userData
    const targetMesh = data.isGLB && ship.children[0] ? ship.children[0] : ship
    targetMesh.scale.multiplyScalar(1.1)
  }

  restoreShipScale(ship) {
    const data = ship.userData
    const targetMesh = data.isGLB && ship.children[0] ? ship.children[0] : ship
    targetMesh.scale.multiplyScalar(1/1.1)
  }

  updateShipScales(_delta) {
    // No-op - using direct scale changes instead
  }

  getScreenPosition(mesh) {
    const vector = new THREE.Vector3()
    mesh.getWorldPosition(vector)
    vector.y += 2 // Offset above particle
    
    vector.project(this.camera)
    
    const rect = this.container.getBoundingClientRect()
    return {
      x: (vector.x * 0.5 + 0.5) * rect.width + rect.left,
      y: (-vector.y * 0.5 + 0.5) * rect.height + rect.top
    }
  }

  getWaveHeight(x, z, time) {
    // Match the exact wave calculation from updateWaves
    let y = 0

    // Wave 1 - Large rolling swell
    y += Math.sin(x * 0.025 + time * 0.35) * 7
    y += Math.cos(z * 0.02 + time * 0.28) * 5

    // Wave 2 - Cross swell
    y += Math.sin(x * 0.04 + z * 0.03 + time * 0.5) * 4

    // Wave 3 - Medium waves
    y += Math.sin(x * 0.08 - time * 0.6) * 2.5
    y += Math.cos(z * 0.07 + time * 0.45) * 2

    // Wave 4 - Chop
    y += Math.sin(x * 0.15 + z * 0.12 + time * 1.2) * 1.2
    y += Math.cos(x * 0.18 - time * 1.0) * 1

    // Wave 5 - Fine detail
    y += Math.sin(x * 0.3 + time * 2.0) * 0.5
    y += Math.sin(z * 0.28 + time * 1.8) * 0.5

    return y
  }

  updateParticles(time, delta) {
    const bound = this.oceanBound
    const wrapSize = bound * 2  // Total wrap distance

    // Apply collision avoidance between ships
    const minDist = 12      // Start pushing apart at this distance
    const repelStrength = 0.2  // Strong push to prevent overlap

    this.particles.forEach((shipA, idA) => {
      const dataA = shipA.userData

      this.particles.forEach((shipB, idB) => {
        if (idA >= idB) return

        const dataB = shipB.userData
        const dx = dataA.position.x - dataB.position.x
        const dz = dataA.position.z - dataB.position.z
        const dist = Math.sqrt(dx * dx + dz * dz)

        if (dist < minDist && dist > 0) {
          const force = (minDist - dist) / minDist * repelStrength
          const nx = dx / dist
          const nz = dz / dist

          dataA.position.x += nx * force
          dataA.position.z += nz * force
          dataB.position.x -= nx * force
          dataB.position.z -= nz * force
        }
      })
    })

    this.particles.forEach((ship, id) => {
      const data = ship.userData

      // Update shader uniforms
      if (data.hullMaterial) {
        data.hullMaterial.uniforms.time.value = time
      }
      if (data.sailMaterial) {
        data.sailMaterial.uniforms.time.value = time
      }

      // Sailing motion - move in heading direction
      const speed = 0.02
      data.position.x += Math.sin(data.heading) * speed
      data.position.z += Math.cos(data.heading) * speed

      // Wrap position when fully past boundary
      if (data.position.x > bound) data.position.x -= wrapSize
      if (data.position.x < -bound) data.position.x += wrapSize
      if (data.position.z > bound) data.position.z -= wrapSize
      if (data.position.z < -bound) data.position.z += wrapSize

      // Slight random heading changes (wind effect) - reduced
      data.heading += (Math.random() - 0.5) * 0.005

      // Apply position
      ship.position.x = data.position.x
      ship.position.z = data.position.z

      // Float on actual ocean surface
      const waveHeight = this.getWaveHeight(data.position.x, data.position.z, time)
      ship.position.y = waveHeight + 1.5

      // Calculate pitch and roll from wave slope
      const sampleDist = 2
      const heightAhead = this.getWaveHeight(
        data.position.x + Math.sin(data.heading) * sampleDist,
        data.position.z + Math.cos(data.heading) * sampleDist,
        time
      )
      const heightRight = this.getWaveHeight(
        data.position.x + Math.cos(data.heading) * sampleDist,
        data.position.z - Math.sin(data.heading) * sampleDist,
        time
      )

      const pitch = Math.atan2(waveHeight - heightAhead, sampleDist) * 0.5
      const roll = Math.atan2(heightRight - waveHeight, sampleDist) * 0.5

      ship.rotation.y = data.heading
      ship.rotation.x = pitch
      ship.rotation.z = roll

      // --- Mirror rendering for seamless wrapping ---
      // When ship is near edge, show a mirror on the opposite side
      const edgeThreshold = 10  // Start showing mirror when this close to edge
      let mirrorOffsetX = 0
      let mirrorOffsetZ = 0

      if (data.position.x > bound - edgeThreshold) mirrorOffsetX = -wrapSize
      else if (data.position.x < -bound + edgeThreshold) mirrorOffsetX = wrapSize

      if (data.position.z > bound - edgeThreshold) mirrorOffsetZ = -wrapSize
      else if (data.position.z < -bound + edgeThreshold) mirrorOffsetZ = wrapSize

      const needsMirror = mirrorOffsetX !== 0 || mirrorOffsetZ !== 0

      if (needsMirror) {
        // Create mirror if it doesn't exist
        if (!data.mirror) {
          data.mirror = ship.clone()
          // Don't clone the glow sprite (it's the last child typically)
          this.particleGroup.add(data.mirror)
        }

        // Position mirror on opposite side
        const mirrorX = data.position.x + mirrorOffsetX
        const mirrorZ = data.position.z + mirrorOffsetZ
        const mirrorWaveHeight = this.getWaveHeight(mirrorX, mirrorZ, time)

        data.mirror.position.set(mirrorX, mirrorWaveHeight + 1.5, mirrorZ)
        data.mirror.rotation.copy(ship.rotation)
        data.mirror.visible = true
      } else if (data.mirror) {
        // Hide mirror when not near edge
        data.mirror.visible = false
      }

      // Fade glow near edges
      if (data.glow) {
        const distFromEdgeX = bound - Math.abs(data.position.x)
        const distFromEdgeZ = bound - Math.abs(data.position.z)
        const minDistFromEdge = Math.min(distFromEdgeX, distFromEdgeZ)
        const fadeZone = bound - this.fadeStart
        const glowOpacity = Math.min(1.0, Math.max(0.0, minDistFromEdge / fadeZone)) * 0.4
        data.glow.material.opacity = glowOpacity
      }
    })
  }

  createHealthOrb() {
    this.healthOrbGroup = new THREE.Group()
    this.healthOrbGroup.position.set(-50, 40, -30)
    this.healthOrbGroup.visible = false  // Hidden - using text overlay instead
    this.scene.add(this.healthOrbGroup)

    this._healthColor = new THREE.Color(0x00ff00)
    this._healthGlowColor = new THREE.Color(0x00ff00)
    this._lastHealthValue = 1.0

    const blobGeometry = new THREE.IcosahedronGeometry(8, 4)
    
    this.healthBlobMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        health: { value: 1.0 },
        blobColor: { value: new THREE.Color(0x00ff00) },
        glowColor: { value: new THREE.Color(0x00ff00) }
      },
      vertexShader: `
        uniform float time;
        uniform float health;
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying float vDisplacement;
        
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
        
        float snoise(vec3 v) {
          const vec2 C = vec2(1.0/6.0, 1.0/3.0);
          const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
          vec3 i = floor(v + dot(v, C.yyy));
          vec3 x0 = v - i + dot(i, C.xxx);
          vec3 g = step(x0.yzx, x0.xyz);
          vec3 l = 1.0 - g;
          vec3 i1 = min(g.xyz, l.zxy);
          vec3 i2 = max(g.xyz, l.zxy);
          vec3 x1 = x0 - i1 + C.xxx;
          vec3 x2 = x0 - i2 + C.yyy;
          vec3 x3 = x0 - D.yyy;
          i = mod289(i);
          vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
          float n_ = 0.142857142857;
          vec3 ns = n_ * D.wyz - D.xzx;
          vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
          vec4 x_ = floor(j * ns.z);
          vec4 y_ = floor(j - 7.0 * x_);
          vec4 x = x_ *ns.x + ns.yyyy;
          vec4 y = y_ *ns.x + ns.yyyy;
          vec4 h = 1.0 - abs(x) - abs(y);
          vec4 b0 = vec4(x.xy, y.xy);
          vec4 b1 = vec4(x.zw, y.zw);
          vec4 s0 = floor(b0)*2.0 + 1.0;
          vec4 s1 = floor(b1)*2.0 + 1.0;
          vec4 sh = -step(h, vec4(0.0));
          vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
          vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
          vec3 p0 = vec3(a0.xy, h.x);
          vec3 p1 = vec3(a0.zw, h.y);
          vec3 p2 = vec3(a1.xy, h.z);
          vec3 p3 = vec3(a1.zw, h.w);
          vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
          p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
          vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
          m = m * m;
          return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
        }
        
        void main() {
          vNormal = normal;
          vPosition = position;
          
          float wobbleSpeed = 2.0 + (1.0 - health) * 6.0;
          float wobbleAmp = 1.5 + (1.0 - health) * 2.0;
          
          float noise1 = snoise(position * 0.3 + time * 0.5) * wobbleAmp;
          float noise2 = snoise(position * 0.6 + time * wobbleSpeed * 0.7) * wobbleAmp * 0.5;
          float noise3 = snoise(position * 1.2 + time * wobbleSpeed) * wobbleAmp * 0.25;
          
          float drip = sin(position.y * 3.0 - time * 4.0) * (1.0 - health) * 2.0;
          
          float squash = 1.0 + sin(time * 3.0) * 0.1 * health;
          float stretch = 1.0 - sin(time * 3.0) * 0.05 * health;
          
          vec3 newPos = position;
          newPos.x *= stretch;
          newPos.y *= squash;
          newPos.z *= stretch;
          newPos += normal * (noise1 + noise2 + noise3 + drip);
          
          vDisplacement = noise1 + noise2 + noise3;
          
          gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float health;
        uniform vec3 blobColor;
        uniform vec3 glowColor;
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying float vDisplacement;
        
        void main() {
          float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);
          float goo = sin(vPosition.x * 2.0 + vPosition.y * 2.0 + vPosition.z * 2.0 + time * 2.0) * 0.5 + 0.5;
          goo *= sin(vPosition.x * 3.0 - vPosition.y * 1.5 + time * 1.5) * 0.5 + 0.5;
          
          vec3 col = blobColor * (0.6 + goo * 0.4);
          col += glowColor * fresnel * 0.8;
          
          float pulse = sin(time * (3.0 + (1.0 - health) * 8.0)) * 0.2 + 0.8;
          col *= pulse;
          
          float sss = pow(max(0.0, dot(vNormal, vec3(0.0, 1.0, 0.5))), 2.0) * 0.3;
          col += blobColor * sss;
          col += blobColor * vDisplacement * 0.2;
          
          gl_FragColor = vec4(col, 0.85);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide
    })
    
    this.healthBlob = new THREE.Mesh(blobGeometry, this.healthBlobMaterial)
    this.healthOrbGroup.add(this.healthBlob)

    const glowGeometry = new THREE.IcosahedronGeometry(12, 3)
    this.healthGlowMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        health: { value: 1.0 },
        glowColor: { value: new THREE.Color(0x00ff00) }
      },
      vertexShader: `
        uniform float time;
        uniform float health;
        varying vec3 vNormal;
        varying float vIntensity;
        
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
        
        float snoise(vec3 v) {
          const vec2 C = vec2(1.0/6.0, 1.0/3.0);
          const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
          vec3 i = floor(v + dot(v, C.yyy));
          vec3 x0 = v - i + dot(i, C.xxx);
          vec3 g = step(x0.yzx, x0.xyz);
          vec3 l = 1.0 - g;
          vec3 i1 = min(g.xyz, l.zxy);
          vec3 i2 = max(g.xyz, l.zxy);
          vec3 x1 = x0 - i1 + C.xxx;
          vec3 x2 = x0 - i2 + C.yyy;
          vec3 x3 = x0 - D.yyy;
          i = mod289(i);
          vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
          float n_ = 0.142857142857;
          vec3 ns = n_ * D.wyz - D.xzx;
          vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
          vec4 x_ = floor(j * ns.z);
          vec4 y_ = floor(j - 7.0 * x_);
          vec4 x = x_ *ns.x + ns.yyyy;
          vec4 y = y_ *ns.x + ns.yyyy;
          vec4 h = 1.0 - abs(x) - abs(y);
          vec4 b0 = vec4(x.xy, y.xy);
          vec4 b1 = vec4(x.zw, y.zw);
          vec4 s0 = floor(b0)*2.0 + 1.0;
          vec4 s1 = floor(b1)*2.0 + 1.0;
          vec4 sh = -step(h, vec4(0.0));
          vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
          vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
          vec3 p0 = vec3(a0.xy, h.x);
          vec3 p1 = vec3(a0.zw, h.y);
          vec3 p2 = vec3(a1.xy, h.z);
          vec3 p3 = vec3(a1.zw, h.w);
          vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
          p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
          vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
          m = m * m;
          return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
        }
        
        void main() {
          vNormal = normal;
          float wobble = snoise(normal * 0.5 + time * 0.3) * 1.0;
          vIntensity = 0.3 + wobble * 0.2;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        varying float vIntensity;
        
        void main() {
          gl_FragColor = vec4(glowColor, vIntensity);
        }
      `,
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
    
    const glowMesh = new THREE.Mesh(glowGeometry, this.healthGlowMaterial)
    this.healthOrbGroup.add(glowMesh)

    this.currentHealth = 1.0
    this.targetHealth = 1.0
  }

  setHealth(health) {
    this.targetHealth = health
  }

  updateHealthOrb(time) {
    if (this.targetHealth !== undefined) {
      const diff = this.targetHealth - this.currentHealth
      if (Math.abs(diff) > 0.001) {
        this.currentHealth += diff * 0.05
      } else {
        this.currentHealth = this.targetHealth
      }
    }
    
    const health = this.currentHealth
    
    if (Math.abs(health - this._lastHealthValue) > 0.01) {
      this._lastHealthValue = health
      
      let r, g
      if (health > 0.7) {
        const t = (health - 0.7) / 0.3
        r = 0.5 * (1 - t)
        g = 1.0
      } else if (health > 0.35) {
        const t = (health - 0.35) / 0.35
        r = 0.5 + 0.5 * (1 - t)
        g = 0.65 * t + 0.35 * (1 - t)
      } else {
        const t = health / 0.35
        r = 1.0
        g = 0.2 * t
      }
      
      this._healthColor.setRGB(r, g, 0)
      this._healthGlowColor.setRGB(r * 0.7, g * 0.7, 0)
      
      this.healthBlobMaterial.uniforms.blobColor.value = this._healthColor
      this.healthBlobMaterial.uniforms.glowColor.value = this._healthGlowColor
      this.healthGlowMaterial.uniforms.glowColor.value = this._healthGlowColor
    }
    
    this.healthBlobMaterial.uniforms.time.value = time
    this.healthBlobMaterial.uniforms.health.value = health
    this.healthGlowMaterial.uniforms.time.value = time
    this.healthGlowMaterial.uniforms.health.value = health

    // Stationary health orb - slight rotation only
    this.healthOrbGroup.rotation.y = time * 0.2
  }

  createOceanGrid() {
    const size = this.gridSize * this.segmentSize

    const geometry = new THREE.PlaneGeometry(
      size, size,
      this.gridSize - 1,
      this.gridSize - 1
    )
    geometry.rotateX(-Math.PI / 2)

    this.originalPositions = geometry.attributes.position.array.slice()

    // Enhanced wireframe with Gerstner wave simulation
    const wireMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 }
      },
      vertexShader: `
        varying vec3 vPosition;
        varying float vElevation;

        void main() {
          vPosition = position;
          vElevation = position.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vPosition;
        varying float vElevation;
        uniform float time;

        void main() {
          float intensity = smoothstep(-5.0, 8.0, vElevation) * 0.5 + 0.1;
          intensity += sin(time * 2.0 + vPosition.x * 0.1) * 0.03;
          
          float distFromCenter = length(vPosition.xz) / 60.0;
          intensity *= 1.0 - smoothstep(0.7, 1.0, distFromCenter);
          
          // Add subtle cyan tint based on elevation
          vec3 color = vec3(intensity);
          color.b += vElevation * 0.02;
          
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      wireframe: true,
      transparent: true
    })

    this.oceanMesh = new THREE.Mesh(geometry.clone(), wireMaterial)
    this.scene.add(this.oceanMesh)

    // Points for the ocean surface
    const colors = new Float32Array(geometry.attributes.position.count * 3)
    const sizes = new Float32Array(geometry.attributes.position.count)

    for (let i = 0; i < geometry.attributes.position.count; i++) {
      colors[i * 3] = 0.08
      colors[i * 3 + 1] = 0.1
      colors[i * 3 + 2] = 0.12
      sizes[i] = 1.5
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))

    const pointsMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 }
      },
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;

        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        uniform float time;

        void main() {
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);
          if (dist > 0.5) discard;
          
          float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
          vec3 col = vColor;
          col += vec3(0.1, 0.15, 0.2) * sin(time * 2.0 + gl_PointCoord.x * 10.0) * 0.3;
          
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })

    this.oceanPoints = new THREE.Points(geometry, pointsMaterial)
    this.scene.add(this.oceanPoints)

    // Solid water surface for 1726 mode - matches the ship wave height
    const waterSize = this.gridSize * this.segmentSize
    const waterGeometry = geometry.clone()
    
    const waterMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        waterColor: { value: new THREE.Color(0x5a8a9a) },
        deepColor: { value: new THREE.Color(0x2d4a52) }
      },
      vertexShader: `
        varying float vWave;
        varying vec2 vUv;
        
        void main() {
          vUv = uv;
          vWave = position.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3 waterColor;
        uniform vec3 deepColor;
        varying float vWave;
        varying vec2 vUv;
        
        void main() {
          float t = (vWave + 6.0) / 12.0;
          vec3 col = mix(deepColor, waterColor, clamp(t, 0.0, 1.0));
          
          // Subtle shimmer
          col += vec3(0.06) * sin(vUv.x * 30.0 + time * 2.0) * sin(vUv.y * 30.0 + time * 1.5);
          
          gl_FragColor = vec4(col, 0.92);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide
    })
    
    this.oceanWater = new THREE.Mesh(waterGeometry, waterMaterial)
    this.oceanWater.visible = false
    this.scene.add(this.oceanWater)

    this.geometry = geometry
    this.wireMaterial = wireMaterial
    this.pointsMaterial = pointsMaterial
  }

  animate() {
    requestAnimationFrame(() => this.animate())

    // IMPORTANT: getDelta must be called first, getElapsedTime resets the internal timer
    const delta = this.clock.getDelta()
    const time = this.clock.getElapsedTime()

    this.wireMaterial.uniforms.time.value = time
    this.pointsMaterial.uniforms.time.value = time
    if (this.oceanWater && this.oceanWater.visible) {
      this.oceanWater.material.uniforms.time.value = time
    }

    this.updateWaves(time)
    this.updateParticles(time, delta)
    this.updateCamera(time)
    this.updateHealthOrb(time)
    this.checkHover(time)
    this.updateShipScales(delta)
    this.updateAnimations(delta)

    this.renderer.render(this.scene, this.camera)
  }

  updateAnimations(delta) {
    if (this.activeAnimations.size > 0 && !this._loggedAnimations) {
      console.log("Active animations:", this.activeAnimations.size, "delta:", delta)
      this._loggedAnimations = true
      setTimeout(() => { this._loggedAnimations = false }, 1000)
    }

    this.activeAnimations.forEach((animation, id) => {
      const shouldContinue = animation.update(delta)
      if (!shouldContinue) {
        console.log("Animation completed:", id)
        this.activeAnimations.delete(id)
      }
    })
  }

  updateWaves(time) {
    const positions = this.geometry.attributes.position.array
    const original = this.originalPositions

    for (let i = 0; i < positions.length; i += 3) {
      const x = original[i]
      const z = original[i + 2]

      let y = 0

      // Gerstner wave approximation - multiple layers
      // Wave 1 - Large rolling swell
      y += Math.sin(x * 0.025 + time * 0.35) * 7
      y += Math.cos(z * 0.02 + time * 0.28) * 5
      
      // Wave 2 - Cross swell
      y += Math.sin(x * 0.04 + z * 0.03 + time * 0.5) * 4
      
      // Wave 3 - Medium waves
      y += Math.sin(x * 0.08 - time * 0.6) * 2.5
      y += Math.cos(z * 0.07 + time * 0.45) * 2
      
      // Wave 4 - Chop
      y += Math.sin(x * 0.15 + z * 0.12 + time * 1.2) * 1.2
      y += Math.cos(x * 0.18 - time * 1.0) * 1

      positions[i + 1] = y
    }

    this.geometry.attributes.position.needsUpdate = true
    this.oceanMesh.geometry.attributes.position.array.set(positions)
    this.oceanMesh.geometry.attributes.position.needsUpdate = true
    if (this.oceanWater && this.oceanWater.visible) {
      this.oceanWater.geometry.attributes.position.array.set(positions)
      this.oceanWater.geometry.attributes.position.needsUpdate = true
    }
  }

  updateCamera(time) {
    const radius = 130
    const speed = 0.04
    this.camera.position.x = Math.sin(time * speed) * radius
    this.camera.position.z = Math.cos(time * speed) * radius
    this.camera.position.y = 70 + Math.sin(time * 0.1) * 15
    this.camera.lookAt(0, 0, 0)
  }

  onResize() {
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  // --- Combat & Animation Methods ---

  playDeathAnimation(id, position, reason) {
    console.log("playDeathAnimation called:", id, reason)
    const ship = this.particles.get(id)
    if (!ship) {
      console.log("Ship not found for death animation:", id)
      return
    }

    // Get position from ship if not provided
    const pos = position || {
      x: ship.position.x,
      y: ship.position.y,
      z: ship.position.z
    }

    console.log("Starting death animation for ship:", id, "theme:", this.currentTheme)

    if (this.currentTheme === 'pirate') {
      this.sinkShipAnimation(id, ship, pos)
    } else {
      this.pixelateDeathAnimation(id, ship, pos)
    }
  }

  playStormAnimation(id) {
    const ship = this.particles.get(id)
    if (!ship) return

    console.log("Storm animation for:", id)

    const data = ship.userData
    const startHeading = data.heading

    // Ship spins out dramatically
    let elapsed = 0
    const spinDuration = 2.0
    const spinRevolutions = 3 + Math.random() * 2  // 3-5 full spins

    const stormAnimation = {
      update: (delta) => {
        elapsed += delta
        const t = Math.min(elapsed / spinDuration, 1)

        // Ease out - fast spin that slows down
        const easeOut = 1 - Math.pow(1 - t, 3)

        // Spin the ship
        ship.rotation.y = startHeading + easeOut * spinRevolutions * Math.PI * 2

        // Rock violently during spin
        const rockIntensity = (1 - t) * 0.4
        ship.rotation.z = Math.sin(elapsed * 15) * rockIntensity
        ship.rotation.x = Math.cos(elapsed * 12) * rockIntensity * 0.5

        if (t >= 1) {
          // Reset to normal sailing
          data.heading = startHeading + spinRevolutions * Math.PI * 2
          ship.rotation.z = 0
          ship.rotation.x = 0
          return false
        }
        return true
      }
    }

    this.activeAnimations.set(`storm_${id}`, stormAnimation)
  }


  sinkShipAnimation(id, ship, position) {
    const startY = ship.position.y
    const startRotationX = ship.rotation.x
    const startRotationZ = ship.rotation.z
    const startScale = ship.scale.x
    let elapsed = 0
    const duration = 3.0  // Longer, more dramatic sink

    // Create splash/bubble particles
    const splashGroup = this.createSplashEffect(ship.position)

    const animation = {
      update: (delta) => {
        elapsed += delta
        const t = Math.min(elapsed / duration, 1)

        // Different easing for different phases
        const sinkEase = t < 0.3
          ? t / 0.3 * 0.1  // Slow start - ship tilts first
          : 0.1 + Math.pow((t - 0.3) / 0.7, 2) * 0.9  // Then accelerating descent

        // Phase 1 (0-30%): Ship tilts dramatically
        // Phase 2 (30-100%): Ship sinks rapidly

        if (t < 0.3) {
          // Tilting phase - dramatic lean before sinking
          const tiltT = t / 0.3
          ship.rotation.z = startRotationZ + tiltT * 0.8  // Lean to port
          ship.rotation.x = startRotationX - tiltT * 0.5  // Bow up slightly
          ship.position.y = startY - tiltT * 2  // Slight dip
        } else {
          // Sinking phase - nose goes up as stern sinks first
          const sinkT = (t - 0.3) / 0.7
          const sinkEaseOut = 1 - Math.pow(1 - sinkT, 2)

          ship.rotation.z = startRotationZ + 0.8 + sinkEaseOut * 0.6  // Continue leaning
          ship.rotation.x = startRotationX - 0.5 - sinkEaseOut * 1.2  // Bow rises dramatically
          ship.position.y = startY - 2 - sinkEaseOut * 18  // Rapid descent

          // Slight spin as it sinks
          ship.rotation.y += delta * 0.5
        }

        // Update splash particles
        if (splashGroup) {
          this.updateSplashEffect(splashGroup, t)
        }

        // Fade out in final phase
        if (t > 0.5) {
          const fadeT = (t - 0.5) / 0.5
          ship.traverse((child) => {
            if (child.material) {
              child.material.transparent = true
              child.material.opacity = Math.max(0, 1 - fadeT)
            }
          })
        }

        if (t >= 1) {
          console.log("Sink animation complete for:", id)
          this.removeParticle(id)
          if (splashGroup) {
            this.scene.remove(splashGroup)
            splashGroup.traverse((child) => {
              if (child.geometry) child.geometry.dispose()
              if (child.material) child.material.dispose()
            })
          }
          return false
        }
        return true
      }
    }

    this.activeAnimations.set(`death_${id}`, animation)
  }

  createSplashEffect(position) {
    const group = new THREE.Group()
    group.position.copy(position)

    // Create rising bubble particles
    const bubbleCount = 20
    const bubbleGeo = new THREE.BufferGeometry()
    const bubblePositions = new Float32Array(bubbleCount * 3)
    const bubbleSizes = new Float32Array(bubbleCount)

    for (let i = 0; i < bubbleCount; i++) {
      bubblePositions[i * 3] = (Math.random() - 0.5) * 6
      bubblePositions[i * 3 + 1] = -Math.random() * 5
      bubblePositions[i * 3 + 2] = (Math.random() - 0.5) * 6
      bubbleSizes[i] = 0.3 + Math.random() * 0.5
    }

    bubbleGeo.setAttribute('position', new THREE.BufferAttribute(bubblePositions, 3))
    bubbleGeo.setAttribute('size', new THREE.BufferAttribute(bubbleSizes, 1))

    const bubbleMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.8,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending
    })

    const bubbles = new THREE.Points(bubbleGeo, bubbleMat)
    bubbles.userData.velocities = []
    for (let i = 0; i < bubbleCount; i++) {
      bubbles.userData.velocities.push({
        x: (Math.random() - 0.5) * 0.1,
        y: 0.1 + Math.random() * 0.2,
        z: (Math.random() - 0.5) * 0.1
      })
    }
    group.add(bubbles)

    this.scene.add(group)
    return group
  }

  updateSplashEffect(group, t) {
    const bubbles = group.children[0]
    if (!bubbles) return

    const positions = bubbles.geometry.attributes.position.array
    const velocities = bubbles.userData.velocities

    for (let i = 0; i < velocities.length; i++) {
      positions[i * 3] += velocities[i].x
      positions[i * 3 + 1] += velocities[i].y
      positions[i * 3 + 2] += velocities[i].z

      // Slow down as they rise
      velocities[i].y *= 0.98
    }

    bubbles.geometry.attributes.position.needsUpdate = true
    bubbles.material.opacity = 0.6 * (1 - t)
  }

  pixelateDeathAnimation(id, ship, position) {
    // Use ship's actual position
    const pos = {
      x: ship.position.x,
      y: ship.position.y,
      z: ship.position.z
    }

    // Remove ship first
    this.removeParticle(id)

    // Create particle burst effect
    const particleCount = 30
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(particleCount * 3)
    const velocities = []

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = pos.x + (Math.random() - 0.5) * 2
      positions[i * 3 + 1] = pos.y + Math.random() * 2
      positions[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 2
      velocities.push({
        x: (Math.random() - 0.5) * 0.3,
        y: Math.random() * 0.2,
        z: (Math.random() - 0.5) * 0.3
      })
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.5,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending
    })

    const particles = new THREE.Points(geometry, material)
    this.scene.add(particles)

    // Remove original ship immediately
    this.removeParticle(id)

    let elapsed = 0
    const duration = 1.5

    const animation = {
      update: (delta) => {
        elapsed += delta
        const t = elapsed / duration

        const posArray = geometry.attributes.position.array
        for (let i = 0; i < particleCount; i++) {
          posArray[i * 3] += velocities[i].x
          posArray[i * 3 + 1] += velocities[i].y
          posArray[i * 3 + 2] += velocities[i].z
          velocities[i].y -= 0.01 // gravity
        }
        geometry.attributes.position.needsUpdate = true

        material.opacity = 1 - t

        if (t >= 1) {
          this.scene.remove(particles)
          geometry.dispose()
          material.dispose()
          return false
        }
        return true
      }
    }

    this.activeAnimations.set(`death_${id}`, animation)
  }

  playRepairAnimation(id, position, color) {
    if (this.currentTheme === 'pirate') {
      this.ghostShipRiseAnimation(id, position, color)
    } else {
      this.pixelReassembleAnimation(id, position, color)
    }
  }

  ghostShipRiseAnimation(id, position, color) {
    // Start ship below water as ghost
    const ghostPosition = { ...position, y: position.y - 20 }
    this.addParticle(id, ghostPosition, color)
    const ship = this.particles.get(id)
    if (!ship) return

    // Make it ghostly
    ship.traverse((child) => {
      if (child.material) {
        child.material.transparent = true
        child.material.opacity = 0.3
        if (child.material.uniforms && child.material.uniforms.shipColor) {
          child.material.uniforms.shipColor.value = new THREE.Color(0xcccccc)
        }
      }
    })

    const startY = ghostPosition.y
    const targetY = this.getWaveHeight(position.x, position.z, this.clock.getElapsedTime()) + 1.5
    let elapsed = 0
    const duration = 2.5

    const animation = {
      update: (delta) => {
        elapsed += delta
        const t = Math.min(elapsed / duration, 1)
        const eased = 1 - Math.pow(1 - t, 3) // ease out cubic

        // Rise up
        ship.position.y = startY + (targetY - startY) * eased

        // Solidify
        const opacity = 0.3 + (0.65 * eased)
        ship.traverse((child) => {
          if (child.material) {
            child.material.opacity = opacity
            if (child.material.uniforms && child.material.uniforms.shipColor) {
              const ghostColor = new THREE.Color(0xcccccc)
              const realColor = new THREE.Color(color || '#ffffff')
              child.material.uniforms.shipColor.value.lerpColors(ghostColor, realColor, eased)
            }
          }
        })

        // Wobble
        ship.rotation.z = Math.sin(elapsed * 5) * 0.1 * (1 - t)

        if (t >= 1) {
          ship.traverse((child) => {
            if (child.material) {
              child.material.opacity = 0.95
            }
          })
          return false
        }
        return true
      }
    }

    this.activeAnimations.set(`repair_${id}`, animation)
  }

  pixelReassembleAnimation(id, position, color) {
    // Create scattered particles
    const particleCount = 30
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(particleCount * 3)
    const startPositions = []
    const targetPosition = position

    for (let i = 0; i < particleCount; i++) {
      // Start scattered
      const sx = position.x + (Math.random() - 0.5) * 30
      const sy = position.y + Math.random() * 15 - 5
      const sz = position.z + (Math.random() - 0.5) * 30
      positions[i * 3] = sx
      positions[i * 3 + 1] = sy
      positions[i * 3 + 2] = sz
      startPositions.push({ x: sx, y: sy, z: sz })
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const material = new THREE.PointsMaterial({
      color: new THREE.Color(color || '#ffffff'),
      size: 0.8,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    })

    const particles = new THREE.Points(geometry, material)
    this.scene.add(particles)

    let elapsed = 0
    const duration = 1.5

    const animation = {
      update: (delta) => {
        elapsed += delta
        const t = Math.min(elapsed / duration, 1)
        const eased = 1 - Math.pow(1 - t, 3)

        const posArray = geometry.attributes.position.array
        for (let i = 0; i < particleCount; i++) {
          posArray[i * 3] = startPositions[i].x + (targetPosition.x - startPositions[i].x) * eased
          posArray[i * 3 + 1] = startPositions[i].y + (targetPosition.y - startPositions[i].y) * eased
          posArray[i * 3 + 2] = startPositions[i].z + (targetPosition.z - startPositions[i].z) * eased
        }
        geometry.attributes.position.needsUpdate = true

        if (t >= 1) {
          this.scene.remove(particles)
          geometry.dispose()
          material.dispose()

          // Spawn actual ship
          this.addParticle(id, position, color)
          return false
        }
        return true
      }
    }

    this.activeAnimations.set(`repair_${id}`, animation)
  }

  getClickedShipId(event) {
    // Check if we have a hovered particle (from raycasting)
    if (this.hoveredParticle && this.hoveredParticle.userData) {
      return this.hoveredParticle.userData.id
    }
    return null
  }

  setTheme(themeName) {
    // Handle both string and atom from LiveView
    let theme = themeName
    if (typeof themeName === 'object' && themeName.toString) {
      theme = themeName.toString().replace(':', '')
    } else if (typeof themeName !== 'string') {
      theme = String(themeName)
    }
    console.log("setTheme raw:", themeName, "converted:", theme)
    if (theme !== 'modern' && theme !== 'pirate') return
    this.currentTheme = theme

    // Apply theme visuals
    this.applyTheme(theme)

    const themeConfig = getTheme(theme)

    // Toggle ocean style based on theme
    if (themeConfig.ocean.waterStyle === 'solid') {
      // 1726 mode: solid water, hide wireframe/points
      this.oceanMesh.visible = false
      this.oceanPoints.visible = false
      this.oceanWater.visible = true
      if (themeConfig.ocean.waterColor) {
        this.oceanWater.material.uniforms.waterColor.value = new THREE.Color(themeConfig.ocean.waterColor)
      }
    } else {
      // Modern mode: wireframe + points
      this.oceanMesh.visible = true
      this.oceanPoints.visible = true
      this.oceanWater.visible = false
    }

    // Also update ships and ocean
    this.updateShipsForTheme(themeConfig)
    this.updateOceanPointColors(themeConfig)
  }

  animateThemeTransition(theme) {
    const duration = 1.0  // 1 second transition
    let elapsed = 0

    // Store starting values
    const startBg = this.scene.background.clone()
    const targetBg = new THREE.Color(theme.ocean.backgroundColor)

    const startFog = this.scene.fog.color.clone()
    const targetFog = new THREE.Color(theme.ocean.fogColor)
    const targetFogDensity = theme.ocean.fogDensity

    const animation = {
      update: (delta) => {
        elapsed += delta
        const t = Math.min(elapsed / duration, 1)
        const eased = 1 - Math.pow(1 - t, 3)  // ease out cubic

        // Transition background
        this.scene.background.lerpColors(startBg, targetBg, eased)

        // Transition fog
        this.scene.fog.color.lerpColors(startFog, targetFog, eased)
        this.scene.fog.density = this.scene.fog.density + (targetFogDensity - this.scene.fog.density) * eased

        if (t >= 1) {
          return false
        }
        return true
      }
    }

    this.activeAnimations.set('theme_transition', animation)

    // Update ship colors for new theme
    this.updateShipsForTheme(theme)

    // Update ocean point colors
    this.updateOceanPointColors(theme)
  }

  updateOceanPointColors(theme) {
    const colors = this.geometry.attributes.color.array
    const pointColor = theme.ocean.pointColor

    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = pointColor.r
      colors[i + 1] = pointColor.g
      colors[i + 2] = pointColor.b
    }

    this.geometry.attributes.color.needsUpdate = true
  }

  updateShipsForTheme(theme) {
    const themeKey = theme.name === 'pirate' ? 'pirate' : 'modern'
    const newModel = this.shipModels[themeKey]
    
    if (!newModel) return

    this.particles.forEach((ship) => {
      const data = ship.userData
      
      // If it's a GLB model, swap it
      if (data.isGLB && !data.isGLBFallback) {
        // Remove old mesh
        while(ship.children.length > 0) { 
          ship.remove(ship.children[0]) 
        }
        
        // Add new model mesh with proper scale
        const newMesh = newModel.clone()
        if (themeKey === 'pirate') {
          newMesh.scale.setScalar(1.5)
        } else {
          newMesh.scale.set(0.15, 0.25, 0.15)
        }
        ship.add(newMesh)
        data.themeKey = themeKey
      }
      
      // Also update procedural materials if they exist
      const shipColor = new THREE.Color(theme.ship.hullColor)
      if (data.hullMaterial && data.hullMaterial.uniforms && data.hullMaterial.uniforms.shipColor) {
        data.hullMaterial.uniforms.shipColor.value.copy(shipColor)
      }
      if (data.sailMaterial && data.sailMaterial.uniforms && data.sailMaterial.uniforms.shipColor) {
        data.sailMaterial.uniforms.shipColor.value.copy(shipColor)
      }
    })
  }

  dispose() {
    if (this.tooltip) {
      this.tooltip.remove()
    }

    window.removeEventListener('resize', this.boundResize)
    if (this.onMouseMove) {
      this.container.removeEventListener('mousemove', this.onMouseMove)
      this.container.removeEventListener('mouseleave', this.onMouseLeave)
    }

    this.renderer.dispose()
    this.geometry.dispose()
    this.oceanMesh.geometry.dispose()
    this.wireMaterial.dispose()
    this.pointsMaterial.dispose()

    // Dispose shared ship geometries
    if (this.hullGeometry) this.hullGeometry.dispose()
    if (this.mastGeometry) this.mastGeometry.dispose()
    if (this.sailGeometry) this.sailGeometry.dispose()

    // Dispose all ships
    this.particles.forEach((ship) => {
      ship.traverse((child) => {
        if (child.geometry) child.geometry.dispose()
        if (child.material) {
          if (child.material.map) child.material.map.dispose()
          child.material.dispose()
        }
      })
    })
  }
}
