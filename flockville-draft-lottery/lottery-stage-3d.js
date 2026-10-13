(function (root) {
  const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js";
  const THREE_INTEGRITY = "sha384-qOkzR5Ke/XkQxuGVJ9hpFEpDlcoLtWwVYhnJf06cLIZa2vaIptSqaubivErzmD5O";
  const LOGO_TIMEOUT_MS = 3000;
  const MAX_POOL_BALLS = 32;
  const RACK_SLOTS = 6;
  let threePromise;
  let activeStage = null;
  const logoImageCache = new Map();

  function loadThree() {
    if (root.THREE) return Promise.resolve(root.THREE);
    if (threePromise) return threePromise;
    threePromise = new Promise((resolve) => {
      const script = document.createElement("script");
      let settled = false;
      const fail = () => {
        if (settled) return;
        settled = true;
        threePromise = null;
        resolve(null);
      };
      const timeout = setTimeout(fail, 2500);
      script.src = THREE_URL;
      script.integrity = THREE_INTEGRITY;
      script.crossOrigin = "anonymous";
      script.referrerPolicy = "no-referrer";
      script.onload = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(root.THREE || null);
      };
      script.onerror = () => {
        clearTimeout(timeout);
        fail();
      };
      document.head.append(script);
    });
    return threePromise;
  }

  // Logo images are optional decoration: a failed, slow or CORS-blocked image
  // resolves to null and the team keeps its monogram.
  function loadLogoImage(url) {
    if (!url || typeof Image !== "function") return Promise.resolve(null);
    if (logoImageCache.has(url)) return logoImageCache.get(url);
    const promise = new Promise((resolve) => {
      const image = new Image();
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        image.onload = null;
        image.onerror = null;
        resolve(value);
      };
      const timer = setTimeout(() => finish(null), LOGO_TIMEOUT_MS);
      if (/^https:\/\//i.test(url)) image.crossOrigin = "anonymous";
      image.decoding = "async";
      image.referrerPolicy = "no-referrer";
      image.onload = () => finish(image.naturalWidth > 0 ? image : null);
      image.onerror = () => finish(null);
      image.src = url;
    }).then((image) => {
      if (!image) logoImageCache.delete(url);
      return image;
    });
    logoImageCache.set(url, promise);
    return promise;
  }

  function fallbackBranding(name, index) {
    const label = String(name || index + 1);
    return {
      key: `ball:${label}`,
      name: label,
      abbr: label.slice(0, 3).toUpperCase(),
      primary: ["#6931CF", "#0E8F83", "#E07A1F"][index % 3],
      secondary: "#FFFFFF",
      patch: "#FFFFFF",
      ink: "#1D1730",
      logoUrl: null,
    };
  }

  function brandingFor(name, logos, index = 0) {
    const branding = root.lotteryTeamBranding;
    return branding ? branding.getTeamBranding(name, logos) : fallbackBranding(name, index);
  }

  function contrast(a, b) {
    return root.lotteryTeamBranding?.contrastRatio?.(a, b) ?? 21;
  }

  // Draws the round label "patch": team-color ring, white face, logo or monogram.
  function drawDecal(canvas, branding, logo) {
    const size = canvas.width;
    const context = canvas.getContext("2d");
    const center = size / 2;
    context.clearRect(0, 0, size, size);
    const ring = contrast(branding.secondary, branding.patch) < 1.4 ? branding.ink : branding.secondary;
    context.beginPath();
    context.arc(center, center, center - 1, 0, Math.PI * 2);
    context.fillStyle = ring;
    context.fill();
    context.beginPath();
    context.arc(center, center, center * 0.84, 0, Math.PI * 2);
    context.fillStyle = branding.patch;
    context.fill();
    if (logo) {
      try {
        const box = center * 1.22;
        const scale = Math.min(box / logo.naturalWidth, box / logo.naturalHeight);
        const width = logo.naturalWidth * scale;
        const height = logo.naturalHeight * scale;
        context.drawImage(logo, center - width / 2, center - height / 2, width, height);
        return;
      } catch {
        context.beginPath();
        context.arc(center, center, center * 0.84, 0, Math.PI * 2);
        context.fillStyle = branding.patch;
        context.fill();
      }
    }
    const text = branding.abbr || "?";
    const family = '"Arial Black", "Helvetica Neue", Arial, system-ui, sans-serif';
    let fontSize = center * (text.length > 2 ? 0.7 : 0.86);
    context.font = `900 ${fontSize}px ${family}`;
    const measured = context.measureText(text).width || 1;
    const maxWidth = center * 1.3;
    if (measured > maxWidth) fontSize *= maxWidth / measured;
    context.font = `900 ${fontSize}px ${family}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = branding.ink;
    context.fillText(text, center, center + fontSize * 0.04);
  }

  // Paints the ball body in team colors and projects the round decal onto the
  // front (+z) and back (-z) of a UV sphere so the patch stays circular.
  function paintBallCanvas(canvas, branding, decal, angularRadius = 0.95) {
    const width = canvas.width;
    const height = canvas.height;
    const context = canvas.getContext("2d");
    context.fillStyle = branding.primary;
    context.fillRect(0, 0, width, height);
    const image = context.getImageData(0, 0, width, height);
    const pixels = image.data;
    const decalSize = decal.width;
    const source = decal.getContext("2d").getImageData(0, 0, decalSize, decalSize).data;
    const reach = Math.sin(angularRadius);
    const sample = (u, v, channel) => {
      const x = Math.min(decalSize - 1, Math.max(0, u * decalSize - 0.5));
      const y = Math.min(decalSize - 1, Math.max(0, v * decalSize - 0.5));
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const x1 = Math.min(decalSize - 1, x0 + 1);
      const y1 = Math.min(decalSize - 1, y0 + 1);
      const fx = x - x0;
      const fy = y - y0;
      const at = (px, py) => source[(py * decalSize + px) * 4 + channel];
      return (at(x0, y0) * (1 - fx) + at(x1, y0) * fx) * (1 - fy) + (at(x0, y1) * (1 - fx) + at(x1, y1) * fx) * fy;
    };
    for (let row = 0; row < height; row += 1) {
      const theta = ((row + 0.5) / height) * Math.PI;
      const dirY = Math.cos(theta);
      if (Math.abs(dirY) > reach) continue;
      const ring = Math.sin(theta);
      for (let column = 0; column < width; column += 1) {
        const phi = ((column + 0.5) / width) * Math.PI * 2;
        const dirX = -Math.cos(phi) * ring;
        const dirZ = Math.sin(phi) * ring;
        const planeX = dirZ >= 0 ? dirX : -dirX;
        if (planeX * planeX + dirY * dirY > reach * reach) continue;
        const u = 0.5 + planeX / (2 * reach);
        const v = 0.5 - dirY / (2 * reach);
        const alpha = sample(u, v, 3) / 255;
        if (alpha <= 0) continue;
        const offset = (row * width + column) * 4;
        for (let channel = 0; channel < 3; channel += 1) {
          const color = sample(u, v, channel) / Math.max(alpha, 1e-3);
          pixels[offset + channel] = pixels[offset + channel] * (1 - alpha) + color * alpha;
        }
        pixels[offset + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
  }

  function createCanvas(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  // A tiny procedural "photo studio" used only as an environment map so glossy
  // balls, chrome and glass get soft reflections without any image download.
  function createStudioEnvironment(THREE, renderer, room = 0.62) {
    const envScene = new THREE.Scene();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const owned = [geometry];
    const panel = (intensity, color, position, scale) => {
      const material = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
      material.color.multiplyScalar(intensity);
      owned.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...position);
      mesh.scale.set(...scale);
      envScene.add(mesh);
      return mesh;
    };
    panel(room, 0xf3eefc, [0, 3, 0], [20, 12, 20]);
    const front = (intensity, position, scale) => {
      const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
      material.color.multiplyScalar(intensity);
      owned.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...position);
      mesh.scale.set(...scale);
      envScene.add(mesh);
    };
    front(9, [0, 8.5, 0], [6, 0.1, 4]);
    front(5, [-8.5, 3.5, 3], [0.1, 4, 6]);
    front(3.5, [8.5, 2.5, -1], [0.1, 3, 4]);
    front(2.2, [0, 3, 9.5], [8, 3, 0.1]);
    const floor = new THREE.MeshBasicMaterial({ color: 0xb8a8d8 });
    floor.color.multiplyScalar(room * 0.55);
    owned.push(floor);
    const ground = new THREE.Mesh(geometry, floor);
    ground.position.set(0, -2.9, 0);
    ground.scale.set(20, 0.1, 20);
    envScene.add(ground);
    const generator = new THREE.PMREMGenerator(renderer);
    const target = generator.fromScene(envScene, 0.035);
    generator.dispose();
    owned.forEach((item) => item.dispose());
    return target;
  }

  function easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  }

  function smoothstep(edge0, edge1, value) {
    const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  async function createLotteryStage3d(container, canvas, onUnavailable, options = {}) {
    let renderer;
    let frame = 0;
    let resizeObserver;
    let contextLost;
    let orientationChanged;
    let disposed = false;
    const disposables = new Set();
    const track = (resource) => {
      if (resource) disposables.add(resource);
      return resource;
    };
    const releaseAll = () => {
      root.cancelAnimationFrame(frame);
      frame = 0;
      resizeObserver?.disconnect();
      if (contextLost) canvas?.removeEventListener("webglcontextlost", contextLost);
      if (orientationChanged) root.removeEventListener?.("orientationchange", orientationChanged);
      disposables.forEach((resource) => {
        try {
          resource.dispose();
        } catch {}
      });
      disposables.clear();
      try {
        renderer?.dispose();
        renderer?.forceContextLoss();
      } catch {}
    };
    try {
      if (!container || !canvas || !root.WebGLRenderingContext) return null;
      const THREE = await loadThree();
      if (!THREE) return null;
      // Only one live scene: a rerun tears down any stage left behind.
      activeStage?.dispose();

      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
      renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.AgXToneMapping;
      renderer.toneMappingExposure = 1.15;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.setClearColor(0x000000, 0);

      const scene = new THREE.Scene();
      const environment = track(createStudioEnvironment(THREE, renderer));
      scene.environment = environment.texture;
      // Glass reflects only the studio softboxes, so it reads as crisp highlights
      // instead of a grey haze over the balls.
      const glassEnvironment = track(createStudioEnvironment(THREE, renderer, 0.04));
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);

      const hemisphere = new THREE.HemisphereLight(0xffffff, 0xd9cdf2, 0.6);
      scene.add(hemisphere);
      const keyLight = new THREE.DirectionalLight(0xfff8f0, 2.4);
      keyLight.position.set(-3.5, 7, 5);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.left = -3.4;
      keyLight.shadow.camera.right = 3.4;
      keyLight.shadow.camera.top = 3.6;
      keyLight.shadow.camera.bottom = -3.4;
      keyLight.shadow.camera.near = 2;
      keyLight.shadow.camera.far = 18;
      keyLight.shadow.radius = 4;
      keyLight.shadow.bias = -0.0006;
      keyLight.shadow.normalBias = 0.025;
      scene.add(keyLight);
      const rimLight = new THREE.DirectionalLight(0xdfe8ff, 1.1);
      rimLight.position.set(4, 3, -4);
      scene.add(rimLight);

      const names = (Array.isArray(options.teams) ? options.teams : [])
        .map((name) => String(name ?? "").trim())
        .filter(Boolean);
      const poolNames = names.length ? [...new Set(names)].slice(0, MAX_POOL_BALLS)
        : Array.from({ length: 12 }, (_, index) => String(index + 1));
      const simApi = root.lotteryBallSim;
      if (!simApi) return null;
      const ballRadius = simApi.ballRadiusForCount(poolNames.length);
      const heroRadius = 0.6;

      // Machine layout (world units).
      const chamberCenter = new THREE.Vector3(0, 0.45, 0);
      const chamberRadius = 1.6;
      const plinthTop = -2.1;
      const outletDirection = new THREE.Vector3(0.6, -0.66, 0.45).normalize();
      const heroPosition = new THREE.Vector3(1.35, -0.15, 2.0);

      const chrome = track(new THREE.MeshStandardMaterial({ color: 0xe9ecf3, metalness: 1, roughness: 0.16 }));
      const paint = track(new THREE.MeshPhysicalMaterial({
        color: 0x6b3fd0, roughness: 0.32, metalness: 0.05, clearcoat: 0.9, clearcoatRoughness: 0.12,
      }));
      const pearl = track(new THREE.MeshPhysicalMaterial({
        color: 0xf8f6fd, roughness: 0.38, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.2,
      }));
      // Additive "reflection only" glass: it can brighten but never darken or hide
      // the balls behind it, so transparent sorting cannot swallow them. Alpha is
      // written as the reflection brightness so the transparent canvas composites
      // as a lighten-toward-white over the page instead of an opaque black shell.
      const lightenBlending = {
        transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
        blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
        blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      };
      const glass = track(new THREE.MeshPhysicalMaterial({
        color: 0x000000, roughness: 0.04, metalness: 0, envMap: glassEnvironment.texture, envMapIntensity: 1.4,
        side: THREE.DoubleSide, ...lightenBlending,
      }));
      glass.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <dithering_fragment>",
          "#include <dithering_fragment>\n  gl_FragColor.rgb = clamp(gl_FragColor.rgb, 0.0, 1.0);\n  gl_FragColor.a = max(max(gl_FragColor.r, gl_FragColor.g), gl_FragColor.b);",
        );
      };
      const rim = track(new THREE.ShaderMaterial({
        uniforms: { tint: { value: new THREE.Color(0xc9b6ff) }, strength: { value: 0.55 } },
        vertexShader: "varying vec3 vNormal; varying vec3 vView; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vNormal = normalize(normalMatrix * normal); vView = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
        fragmentShader: "uniform vec3 tint; uniform float strength; varying vec3 vNormal; varying vec3 vView; void main(){ float f = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 3.0); vec3 c = clamp(tint * f * strength, 0.0, 1.0); gl_FragColor = vec4(c, max(max(c.r, c.g), c.b)); }",
        ...lightenBlending,
      }));

      const machine = new THREE.Group();
      scene.add(machine);
      const addMesh = (geometry, material, configure) => {
        const mesh = new THREE.Mesh(track(geometry), material);
        configure?.(mesh);
        machine.add(mesh);
        return mesh;
      };

      // Clear chamber with a fresnel edge; no rings cross in front of the balls.
      addMesh(new THREE.SphereGeometry(chamberRadius, 64, 48), glass, (mesh) => {
        mesh.position.copy(chamberCenter);
        mesh.renderOrder = 2;
      });
      addMesh(new THREE.SphereGeometry(chamberRadius + 0.005, 64, 48), rim, (mesh) => {
        mesh.position.copy(chamberCenter);
        mesh.renderOrder = 3;
      });
      // Support hoop sits in the silhouette plane (behind/around the globe edge).
      addMesh(new THREE.TorusGeometry(chamberRadius + 0.07, 0.045, 12, 96), chrome, (mesh) => {
        mesh.position.copy(chamberCenter);
        mesh.rotation.y = -0.27;
        mesh.castShadow = true;
      });
      const topY = chamberCenter.y + chamberRadius;
      addMesh(new THREE.CylinderGeometry(0.2, 0.26, 0.2, 32), chrome, (mesh) => mesh.position.set(0, topY + 0.06, 0));
      addMesh(new THREE.SphereGeometry(0.12, 24, 16), paint, (mesh) => mesh.position.set(0, topY + 0.24, 0));
      addMesh(new THREE.CylinderGeometry(0.6, 0.66, 0.18, 48), chrome, (mesh) => {
        mesh.position.set(0, -1.12, 0);
        mesh.castShadow = true;
      });
      const pedestalProfile = [
        [0, -1.2], [0.64, -1.2], [0.68, -1.25], [0.72, -1.42], [0.82, -1.64],
        [1.0, -1.86], [1.22, -2.0], [1.3, -2.04], [1.3, plinthTop], [0, plinthTop],
      ].map(([x, y]) => new THREE.Vector2(x, y));
      addMesh(new THREE.LatheGeometry(pedestalProfile, 72), paint, (mesh) => {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      });
      addMesh(new THREE.TorusGeometry(1.3, 0.035, 10, 96), chrome, (mesh) => {
        mesh.rotation.x = Math.PI / 2;
        mesh.position.y = -2.05;
      });
      addMesh(new THREE.CylinderGeometry(2.1, 2.15, 0.16, 96), pearl, (mesh) => {
        mesh.position.y = plinthTop - 0.08;
        mesh.receiveShadow = true;
        mesh.castShadow = true;
      });

      // League lettering band on the pedestal front (drawn text, no extra asset).
      const bandCanvas = createCanvas(576, 128);
      const bandContext = bandCanvas.getContext("2d");
      bandContext.shadowColor = "rgba(20, 8, 48, 0.55)";
      bandContext.shadowBlur = 6;
      bandContext.shadowOffsetY = 3;
      bandContext.fillStyle = "#ffffff";
      bandContext.font = '800 52px "Arial Black", "Helvetica Neue", Arial, sans-serif';
      bandContext.textAlign = "center";
      bandContext.textBaseline = "middle";
      bandContext.fillText("DRAFT LOTTERY", 288, 66, 556);
      const bandTexture = track(new THREE.CanvasTexture(bandCanvas));
      bandTexture.colorSpace = THREE.SRGBColorSpace;
      bandTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const bandMaterial = track(new THREE.MeshStandardMaterial({
        map: bandTexture, emissive: 0xffffff, emissiveMap: bandTexture, emissiveIntensity: 0.55,
        transparent: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2,
      }));
      addMesh(new THREE.CylinderGeometry(0.735, 0.92, 0.3, 64, 1, true, -0.8, 1.6), bandMaterial, (mesh) => {
        mesh.position.y = -1.6;
        mesh.rotation.y = Math.atan2(-0.3, 1); // face the default camera direction
      });

      // Extraction tube: outlet at the lower front of the chamber, down into a cup.
      const simChamberRadius = chamberRadius - 0.05;
      const outletEntry = chamberCenter.clone().addScaledVector(outletDirection, simChamberRadius - ballRadius);
      const outlet = chamberCenter.clone().addScaledVector(outletDirection, chamberRadius + 0.02);
      const cupPosition = new THREE.Vector3(1.42, plinthTop + ballRadius + 0.02, 1.0);
      const tubeEnd = cupPosition.clone().add(new THREE.Vector3(0, ballRadius * 1.9, 0));
      const tubeCurve = new THREE.CatmullRomCurve3([
        outlet.clone().addScaledVector(outletDirection, -0.12),
        outlet.clone().addScaledVector(outletDirection, 0.25),
        outlet.clone().lerp(tubeEnd, 0.5).add(new THREE.Vector3(0.12, -0.05, 0.08)),
        tubeEnd.clone().add(new THREE.Vector3(0, 0.35, 0)),
        tubeEnd,
      ]);
      const tubeRadius = ballRadius + 0.06;
      addMesh(new THREE.TubeGeometry(tubeCurve, 64, tubeRadius, 24, false), glass, (mesh) => {
        mesh.renderOrder = 2;
      });
      addMesh(new THREE.TubeGeometry(tubeCurve, 64, tubeRadius + 0.004, 24, false), rim, (mesh) => {
        mesh.renderOrder = 3;
      });
      const collar = (point, tangent) => addMesh(new THREE.TorusGeometry(tubeRadius + 0.02, 0.03, 10, 40), chrome, (mesh) => {
        mesh.position.copy(point);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent.clone().normalize());
      });
      collar(tubeCurve.getPoint(0.06), tubeCurve.getTangent(0.06));
      collar(tubeEnd, tubeCurve.getTangent(1));
      const cupProfile = [[0, 0], [0.55, 0], [0.95, 0.18], [1.18, 0.5], [1.22, 0.56], [1.12, 0.56], [0.9, 0.24], [0, 0.08]]
        .map(([x, y]) => new THREE.Vector2(x * ballRadius, y * ballRadius));
      addMesh(new THREE.LatheGeometry(cupProfile, 40), chrome, (mesh) => {
        mesh.position.set(cupPosition.x, plinthTop, cupPosition.z);
        mesh.castShadow = true;
      });

      // Soft floor shadow: a shadow catcher plus a baked contact shadow.
      addMesh(new THREE.PlaneGeometry(14, 14), track(new THREE.ShadowMaterial({ opacity: 0.16 })), (mesh) => {
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = plinthTop - 0.159;
        mesh.receiveShadow = true;
      });
      const contactCanvas = createCanvas(128, 128);
      const contactContext = contactCanvas.getContext("2d");
      const gradient = contactContext.createRadialGradient(64, 64, 20, 64, 64, 64);
      gradient.addColorStop(0, "rgba(58, 31, 112, 0.42)");
      gradient.addColorStop(1, "rgba(58, 31, 112, 0)");
      contactContext.fillStyle = gradient;
      contactContext.fillRect(0, 0, 128, 128);
      const contactTexture = track(new THREE.CanvasTexture(contactCanvas));
      addMesh(new THREE.PlaneGeometry(5.2, 5.2), track(new THREE.MeshBasicMaterial({
        map: contactTexture, transparent: true, depthWrite: false, toneMapped: false,
      })), (mesh) => {
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = plinthTop - 0.155;
      });

      // Team balls: opaque, color-managed team-color textures with a white patch.
      const ballGeometry = track(new THREE.SphereGeometry(ballRadius, 48, 32));
      const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const decalCanvas = createCanvas(192, 192);
      const heroDecalCanvas = createCanvas(384, 384);
      let logos = {};
      const makeTexture = (canvasElement) => {
        const texture = track(new THREE.CanvasTexture(canvasElement));
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = anisotropy;
        return texture;
      };
      const paintBall = (canvasElement, decal, branding, logo) => {
        drawDecal(decal, branding, logo);
        try {
          paintBallCanvas(canvasElement, branding, decal);
        } catch {
          drawDecal(decal, branding, null);
          paintBallCanvas(canvasElement, branding, decal);
        }
      };
      const logoImages = new Map();
      const textureByKey = new Map();
      const pool = [];
      const createBallItem = (name, branding, index, position) => {
        let entry = textureByKey.get(branding.key);
        if (!entry) {
          const ballCanvas = createCanvas(512, 256);
          paintBall(ballCanvas, decalCanvas, branding, logoImages.get(branding.key) || null);
          entry = { canvas: ballCanvas, texture: makeTexture(ballCanvas), branding };
          textureByKey.set(branding.key, entry);
        }
        const material = track(new THREE.MeshPhysicalMaterial({
          map: entry.texture, roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06,
        }));
        const mesh = new THREE.Mesh(ballGeometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.rotation.set(pool.length * 0.9, pool.length * 2.1 + Math.PI * 0.15, 0);
        if (position) mesh.position.copy(position);
        scene.add(mesh);
        const seed = pool.length + 1;
        const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(
          Math.sin(seed * 12.9898) * 0.3, Math.sin(seed * 78.233) * 0.45, Math.sin(seed * 37.719) * 0.4,
        ));
        const item = { index, name, branding, mesh, material, texture: entry.texture, status: "pool", rackSlot: -1, tilt };
        pool.push(item);
        return item;
      };
      poolNames.forEach((name, index) => createBallItem(name, brandingFor(name, logos, index), index));

      const sim = simApi.createBallSimulation({
        count: pool.length,
        radius: ballRadius,
        chamberRadius: simChamberRadius,
        seed: 0x5eed + pool.length,
      });
      for (let warmup = 0; warmup < 40; warmup += 1) sim.step(0.05, "settle");

      // Hi-res winner texture and the standings "medallion" share one redraw path.
      const heroCanvas = createCanvas(1024, 512);
      const heroTexture = makeTexture(heroCanvas);
      const medallionCanvas = createCanvas(512, 512);
      const medallionTexture = makeTexture(medallionCanvas);
      const medallionGeometry = track(new THREE.CylinderGeometry(0.62, 0.62, 0.1, 72));
      medallionGeometry.rotateX(Math.PI / 2).rotateZ(Math.PI / 2);
      const medallionFace = track(new THREE.MeshPhysicalMaterial({
        map: medallionTexture, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08,
      }));
      const medallion = new THREE.Mesh(medallionGeometry, [chrome, medallionFace, chrome]);
      medallion.visible = false;
      medallion.castShadow = true;
      medallion.position.copy(heroPosition);
      scene.add(medallion);

      const applyLogos = (manifest) => {
        if (disposed || !manifest) return;
        logos = manifest;
        for (const entry of textureByKey.values()) {
          entry.branding = brandingFor(entry.branding.name, logos);
          if (!entry.branding.logoUrl) continue;
          loadLogoImage(entry.branding.logoUrl).then((image) => {
            if (!image || disposed) return;
            logoImages.set(entry.branding.key, image);
            paintBall(entry.canvas, decalCanvas, entry.branding, image);
            entry.texture.needsUpdate = true;
          }, () => {});
        }
      };
      Promise.resolve(options.logos ?? root.lotteryTeamBranding?.loadLogoManifest?.())
        .then(applyLogos, () => {});

      const fitPoints = [
        [0, topY + 0.38, 0], [-1.7, chamberCenter.y, 0], [1.7, chamberCenter.y, 0], [0, chamberCenter.y + 1.2, 1.2],
        [heroPosition.x + heroRadius * 1.3, heroPosition.y + heroRadius * 1.3, heroPosition.z],
        [heroPosition.x - heroRadius, heroPosition.y - heroRadius, heroPosition.z],
        [heroPosition.x + heroRadius * 1.3, heroPosition.y - heroRadius * 1.3, heroPosition.z],
      ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
      for (let step = 0; step < 16; step += 1) {
        const angle = (step / 16) * Math.PI * 2;
        fitPoints.push(new THREE.Vector3(Math.sin(angle) * 2.15, plinthTop - 0.16, Math.cos(angle) * 2.15));
      }
      const viewDirection = new THREE.Vector3(-0.3, 0.2, 1).normalize();
      const viewTarget = new THREE.Vector3();
      const projected = new THREE.Vector3();
      const cameraRight = new THREE.Vector3();
      const cameraUp = new THREE.Vector3();
      // Frames the whole machine plus the hero position for any aspect ratio.
      const fitCamera = () => {
        viewTarget.set(0.2, -0.2, 0.4);
        for (let pass = 0; pass < 3; pass += 1) {
          let bounds;
          for (let distance = 6; distance <= 30; distance += 0.1) {
            camera.position.copy(viewTarget).addScaledVector(viewDirection, distance);
            camera.lookAt(viewTarget);
            camera.updateMatrixWorld();
            bounds = [Infinity, -Infinity, Infinity, -Infinity];
            for (const point of fitPoints) {
              projected.copy(point).project(camera);
              bounds[0] = Math.min(bounds[0], projected.x);
              bounds[1] = Math.max(bounds[1], projected.x);
              bounds[2] = Math.min(bounds[2], projected.y);
              bounds[3] = Math.max(bounds[3], projected.y);
            }
            if (bounds[1] - bounds[0] <= 1.86 && bounds[3] - bounds[2] <= 1.84) break;
          }
          const distance = camera.position.distanceTo(viewTarget);
          const halfHeight = Math.tan((camera.fov * Math.PI) / 360) * distance;
          cameraRight.setFromMatrixColumn(camera.matrixWorld, 0);
          cameraUp.setFromMatrixColumn(camera.matrixWorld, 1);
          viewTarget.addScaledVector(cameraRight, ((bounds[0] + bounds[1]) / 2) * halfHeight * camera.aspect);
          viewTarget.addScaledVector(cameraUp, ((bounds[2] + bounds[3]) / 2) * halfHeight);
        }
        const finalDistance = camera.position.distanceTo(viewTarget);
        camera.position.copy(viewTarget).addScaledVector(viewDirection, finalDistance);
        camera.lookAt(viewTarget);
        camera.updateMatrixWorld();
      };
      const resize = () => {
        if (disposed) return;
        const width = Math.max(1, container.clientWidth || 320);
        const height = Math.max(1, container.clientHeight || 300);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        fitCamera();
      };
      resize();
      resizeObserver = root.ResizeObserver ? new ResizeObserver(resize) : null;
      resizeObserver?.observe(container);
      orientationChanged = () => resize();
      root.addEventListener?.("orientationchange", orientationChanged);

      let phase = "ready";
      let reducedMotion = Boolean(root.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
      let speed = options.speed === "fast" ? "fast" : "normal";
      let pending = null;
      let extraction = null;
      let hero = null;
      let medallionState = null;
      const transfers = [];
      let rackCount = 0;
      const faceCamera = new THREE.Object3D();
      const tempVector = new THREE.Vector3();
      const tempQuaternion = new THREE.Quaternion();
      const restQuaternion = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      let stageTime = 0;
      let lastTime = root.performance?.now?.() ?? Date.now();

      const toWorld = (ball, target) => target.set(ball.x, ball.y, ball.z).add(chamberCenter);
      const faceCameraQuaternion = (position) => {
        faceCamera.position.copy(position);
        faceCamera.lookAt(camera.position);
        return faceCamera.quaternion;
      };
      const rackPosition = (slot) => {
        const angle = -0.42 - slot * 0.36;
        return new THREE.Vector3(Math.sin(angle) * 1.62, plinthTop + ballRadius + 0.005, Math.cos(angle) * 1.62);
      };
      const durations = () => (speed === "fast"
        ? { extract: 0.26, rack: 0.2, medallion: 0.15 }
        : { extract: 1.05, rack: 0.6, medallion: 0.35 });

      const releaseHero = () => {
        if (hero) {
          const slot = rackCount % RACK_SLOTS;
          rackCount += 1;
          pool.filter((item) => item.status === "racked" && item.rackSlot === slot).forEach((item) => {
            item.status = "retired";
            item.mesh.visible = false;
          });
          hero.material.map = hero.texture;
          hero.material.needsUpdate = true;
          hero.status = "racking";
          hero.rackSlot = slot;
          transfers.push({
            item: hero,
            from: hero.mesh.position.clone(),
            fromScale: hero.mesh.scale.x,
            to: rackPosition(slot),
            start: stageTime,
          });
          hero = null;
        }
        if (medallionState) medallionState = { ...medallionState, hiding: true, start: stageTime };
      };

      const beginExtraction = () => {
        if (!pending || pending.kind !== "draw") return;
        const item = pending.item || createBallItem(pending.branding.name, pending.branding, -1, outletEntry);
        const startWorld = item.mesh.position.clone();
        sim.setKinematic(item.index, true);
        item.status = "extracting";
        item.material.map = heroTexture;
        item.material.needsUpdate = true;
        const path = new THREE.CurvePath();
        if (startWorld.distanceTo(outletEntry) > 1e-3) path.add(new THREE.LineCurve3(startWorld, outletEntry.clone()));
        path.add(new THREE.LineCurve3(outletEntry.clone(), tubeCurve.getPoint(0)));
        path.add(tubeCurve);
        path.add(new THREE.LineCurve3(tubeEnd.clone(), cupPosition.clone()));
        const lift = cupPosition.clone().lerp(heroPosition, 0.5).add(new THREE.Vector3(0, 0.9, 0));
        path.add(new THREE.QuadraticBezierCurve3(cupPosition.clone(), lift, heroPosition.clone()));
        const cupLength = path.getCurveLengths().at(-2) / path.getLength();
        extraction = { item, path, start: stageTime, cupLength, last: startWorld.clone() };
        pending = null;
      };

      const finishExtraction = () => {
        if (!extraction) return;
        const { item } = extraction;
        item.mesh.position.copy(heroPosition);
        item.mesh.scale.setScalar(heroRadius / ballRadius);
        item.mesh.quaternion.copy(faceCameraQuaternion(heroPosition));
        item.status = "hero";
        sim.setActive(item.index, false);
        hero = item;
        extraction = null;
      };

      const showMedallion = () => {
        if (!pending || pending.kind !== "placement") return;
        releaseHero();
        medallion.visible = true;
        medallion.quaternion.copy(faceCameraQuaternion(heroPosition));
        medallionState = { start: stageTime, hiding: false };
        if (reducedMotion) medallion.scale.setScalar(1);
        pending = null;
      };

      const updateExtraction = () => {
        if (!extraction) return;
        const raw = reducedMotion ? 1 : (stageTime - extraction.start) / durations().extract;
        const t = Math.min(1, raw);
        const along = easeInOut(t);
        const point = extraction.path.getPointAt(Math.min(1, along));
        const { item } = extraction;
        if (item) {
          const moved = tempVector.copy(point).sub(extraction.last);
          const distance = moved.length();
          if (distance > 1e-5) {
            const axis = new THREE.Vector3().crossVectors(up, moved).normalize();
            if (axis.lengthSq() > 0) {
              tempQuaternion.setFromAxisAngle(axis, distance / (ballRadius * item.mesh.scale.x));
              item.mesh.quaternion.premultiply(tempQuaternion);
            }
          }
          extraction.last.copy(point);
          item.mesh.position.copy(point);
          sim.setKinematic(item.index, true, tempVector.copy(point).sub(chamberCenter));
          const grow = smoothstep(extraction.cupLength, 1, along);
          item.mesh.scale.setScalar(1 + (heroRadius / ballRadius - 1) * grow);
          if (grow > 0) item.mesh.quaternion.slerp(faceCameraQuaternion(heroPosition), Math.min(1, grow * 0.35 + (t >= 1 ? 1 : 0)));
        }
        if (t >= 1) finishExtraction();
      };

      const updateTransfers = () => {
        for (let index = transfers.length - 1; index >= 0; index -= 1) {
          const transfer = transfers[index];
          const t = reducedMotion ? 1 : Math.min(1, (stageTime - transfer.start) / durations().rack);
          const eased = easeInOut(t);
          const { mesh } = transfer.item;
          mesh.position.lerpVectors(transfer.from, transfer.to, eased);
          mesh.position.y += Math.sin(Math.PI * eased) * 0.5;
          mesh.scale.setScalar(transfer.fromScale + (1 - transfer.fromScale) * eased);
          if (t >= 1) {
            transfer.item.status = "racked";
            mesh.quaternion.copy(faceCameraQuaternion(transfer.to));
            transfers.splice(index, 1);
          }
        }
      };

      const updateMedallion = () => {
        if (!medallionState) return;
        const elapsed = stageTime - medallionState.start;
        const t = reducedMotion ? 1 : Math.min(1, elapsed / durations().medallion);
        const scale = medallionState.hiding ? 1 - t : easeInOut(t);
        medallion.scale.setScalar(Math.max(0.001, scale));
        if (!reducedMotion && !medallionState.hiding) {
          const sway = Math.sin(stageTime * 1.4) * 0.12;
          medallion.quaternion.copy(faceCameraQuaternion(heroPosition));
          medallion.rotateY(sway);
        }
        if (medallionState.hiding && t >= 1) {
          medallion.visible = false;
          medallionState = null;
        }
      };

      const fail = () => {
        if (disposed) return;
        root.cancelAnimationFrame(frame);
        frame = 0;
        container.hidden = true;
        try {
          onUnavailable?.();
        } catch {}
      };

      function renderFrame() {
        frame = 0;
        if (disposed) return;
        try {
          const now = root.performance?.now?.() ?? Date.now();
          const delta = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
          lastTime = now;
          stageTime += delta;
          if (!reducedMotion) {
            const mode = phase === "mixing" ? "mix" : phase === "settling" || phase === "extracting" ? "settle" : "rest";
            sim.step(delta, mode);
          }
          for (const item of pool) {
            if (item.status !== "pool") continue;
            const ball = sim.balls[item.index];
            toWorld(ball, item.mesh.position);
            const rest = restQuaternion.copy(faceCameraQuaternion(item.mesh.position)).multiply(item.tilt);
            if (reducedMotion) {
              item.mesh.quaternion.copy(rest);
            } else {
              const spin = Math.hypot(ball.wx, ball.wy, ball.wz);
              if (spin > 1e-4) {
                tempVector.set(ball.wx / spin, ball.wy / spin, ball.wz / spin);
                tempQuaternion.setFromAxisAngle(tempVector, spin * Math.min(delta, 0.05));
                item.mesh.quaternion.premultiply(tempQuaternion);
              }
              // Resting balls ease their label toward the audience for legibility.
              if (phase !== "mixing") {
                item.mesh.quaternion.slerp(rest, Math.min(1, delta * 1.6));
              }
            }
          }
          updateExtraction();
          updateTransfers();
          updateMedallion();
          renderer.render(scene, camera);
          frame = root.requestAnimationFrame(renderFrame);
        } catch (error) {
          createLotteryStage3d.lastError = String(error?.message || error);
          fail();
        }
      }

      contextLost = (event) => {
        event.preventDefault();
        fail();
      };
      canvas.addEventListener("webglcontextlost", contextLost, { once: true });

      container.hidden = false;
      frame = root.requestAnimationFrame(renderFrame);

      const stage = {
        setPhase(nextPhase) {
          if (disposed) return;
          if (nextPhase === "mixing") {
            finishExtraction();
            releaseHero();
          }
          phase = nextPhase;
          if (nextPhase === "extracting") beginExtraction();
          if (nextPhase === "revealed") {
            if (pending?.kind === "draw") beginExtraction();
            showMedallion();
          }
        },
        reveal(result, info = {}) {
          if (disposed) return;
          const name = String(result?.team ?? "").trim();
          const branding = brandingFor(name || String(result?.pick ?? ""), logos);
          const kind = info.kind === "placement" ? "placement" : "draw";
          const logo = logoImages.get(branding.key) || null;
          if (kind === "draw") {
            const item = pool.find((candidate) => candidate.status === "pool" && candidate.branding.key === branding.key) || null;
            drawDecal(heroDecalCanvas, branding, logo);
            try {
              paintBallCanvas(heroCanvas, branding, heroDecalCanvas);
            } catch {
              drawDecal(heroDecalCanvas, branding, null);
              paintBallCanvas(heroCanvas, branding, heroDecalCanvas);
            }
            heroTexture.needsUpdate = true;
            pending = { kind, item, branding };
          } else {
            drawDecal(medallionCanvas, branding, logo);
            try {
              medallionCanvas.getContext("2d").getImageData(0, 0, 1, 1);
            } catch {
              drawDecal(medallionCanvas, branding, null);
            }
            medallionTexture.needsUpdate = true;
            pending = { kind, branding };
          }
        },
        setReducedMotion(value) {
          reducedMotion = Boolean(value);
        },
        setSpeed(value) {
          speed = value === "fast" ? "fast" : "normal";
        },
        dispose() {
          if (disposed) return;
          disposed = true;
          if (activeStage === stage) activeStage = null;
          releaseAll();
          container.hidden = true;
        },
      };
      // Exposed for diagnostics/tests only; never influences results.
      Object.defineProperty(stage, "debug", {
        value: {
          get phase() { return phase; },
          get ballCount() { return pool.length; },
          get ballRadius() { return ballRadius; },
          get heroTeam() { return hero?.branding.name ?? null; },
          get extracting() { return Boolean(extraction); },
          get medallionVisible() { return medallion.visible; },
          get rendering() { return frame !== 0; },
          get textureCount() { return textureByKey.size; },
          project(x, y, z) {
            const point = new THREE.Vector3(x, y, z).project(camera);
            return [point.x, point.y];
          },
          positions() {
            return pool.filter((item) => item.status === "pool").map((item) => item.mesh.position.toArray());
          },
          projectedHero() {
            const target = hero?.mesh ?? extraction?.item?.mesh;
            if (!target) return null;
            const point = target.position.clone().project(camera);
            return [point.x, point.y];
          },
        },
      });
      activeStage = stage;
      return stage;
    } catch (error) {
      createLotteryStage3d.lastError = String(error?.message || error);
      disposed = true;
      releaseAll();
      if (container) container.hidden = true;
      return null;
    }
  }

  root.createLotteryStage3d = createLotteryStage3d;
})(globalThis);
