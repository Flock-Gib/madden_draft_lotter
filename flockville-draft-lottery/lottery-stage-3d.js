(function (root) {
  const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js";
  const THREE_INTEGRITY = "sha384-qOkzR5Ke/XkQxuGVJ9hpFEpDlcoLtWwVYhnJf06cLIZa2vaIptSqaubivErzmD5O";
  let threePromise;

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
      const timeout = setTimeout(fail, 4000);
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

  function labelTexture(THREE, label) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, 128, 128);
    context.fillStyle = "#fff";
    context.font = "bold 54px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, 64, 64);
    return new THREE.CanvasTexture(canvas);
  }

  async function createLotteryStage3d(container, canvas, onUnavailable) {
    let renderer;
    let scene;
    let resizeObserver;
    let frame = 0;
    let contextLost;
    try {
      if (!container || !canvas || !root.WebGLRenderingContext) return null;
      const THREE = await loadThree();
      if (!THREE) return null;

      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
      renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 1.5));
      renderer.setSize(container.clientWidth || 320, container.clientHeight || 300, false);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
      camera.position.set(0, 0.25, 7.4);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x7d68a5, 2.1));

      const keyLight = new THREE.DirectionalLight(0xffffff, 3.3);
      keyLight.position.set(-3, 5, 5);
      keyLight.castShadow = true;
      scene.add(keyLight);
      const fillLight = new THREE.PointLight(0x9bc8ff, 35, 14);
      fillLight.position.set(3, 1, 4);
      scene.add(fillLight);

      const machine = new THREE.Group();
      scene.add(machine);

      const globe = new THREE.Mesh(
        new THREE.SphereGeometry(1.78, 36, 28),
        new THREE.MeshPhysicalMaterial({
          color: 0xd9edff,
          transparent: true,
          opacity: 0.12,
          roughness: 0.12,
          metalness: 0.08,
          side: THREE.DoubleSide,
        }),
      );
      globe.renderOrder = 2;
      machine.add(globe);

      const metal = new THREE.MeshStandardMaterial({
        color: 0xb9c5d8,
        metalness: 0.82,
        roughness: 0.24,
      });
      const hoopGeometry = new THREE.TorusGeometry(1.86, 0.045, 8, 48);
      const hoop = new THREE.Mesh(hoopGeometry, metal);
      hoop.rotation.x = Math.PI / 2;
      machine.add(hoop);
      const sideHoop = new THREE.Mesh(hoopGeometry, metal);
      sideHoop.rotation.y = Math.PI / 2;
      machine.add(sideHoop);
      const chuteCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -1.45, 0),
        new THREE.Vector3(0.05, -1.9, 0.25),
        new THREE.Vector3(0.25, -2.3, 0.7),
      ]);
      machine.add(new THREE.Mesh(new THREE.TubeGeometry(chuteCurve, 16, 0.09, 10, false), metal));
      const base = new THREE.Mesh(
        new THREE.CircleGeometry(1.55, 40),
        new THREE.MeshStandardMaterial({ color: 0xf4f0fc, transparent: true, opacity: 0.25, roughness: 0.75 }),
      );
      base.rotation.x = -Math.PI / 2;
      base.position.y = -1.72;
      base.receiveShadow = true;
      machine.add(base);
      for (const x of [-1.25, 1.25]) {
        const leg = new THREE.Mesh(
          new THREE.CylinderGeometry(0.055, 0.09, 1.35, 10),
          metal,
        );
        leg.position.set(x, -2.25, 0);
        machine.add(leg);
      }

      const ballGeometry = new THREE.SphereGeometry(0.25, 24, 18);
      const ballColors = [0x6d45cf, 0x169a8d, 0xe57a52];
      const balls = Array.from({ length: 12 }, (_, index) => {
        const texture = labelTexture(THREE, String(index + 1));
        const material = new THREE.MeshStandardMaterial({
          color: ballColors[index % ballColors.length],
          map: texture,
          roughness: 0.19,
          metalness: 0.04,
        });
        const ball = new THREE.Mesh(ballGeometry, material);
        const angle = index * 2.399963;
        const radius = 0.35 + (index % 4) * 0.19;
        ball.position.set(Math.cos(angle) * radius, Math.sin(angle * 1.7) * radius, Math.sin(angle) * 0.6);
        ball.castShadow = true;
        ball.receiveShadow = true;
        ball.userData.phase = angle;
        machine.add(ball);
        return ball;
      });
      const revealMaterial = new THREE.MeshStandardMaterial({
        color: 0x6d45cf,
        roughness: 0.16,
        metalness: 0.04,
      });
      const revealBall = new THREE.Mesh(new THREE.SphereGeometry(0.38, 32, 24), revealMaterial);
      revealBall.castShadow = true;
      revealBall.visible = false;
      scene.add(revealBall);

      const resize = () => {
        const width = container.clientWidth || 320;
        const height = container.clientHeight || 300;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      };
      resizeObserver = root.ResizeObserver ? new ResizeObserver(resize) : null;
      resizeObserver?.observe(container);
      contextLost = (event) => {
        event.preventDefault();
        container.hidden = true;
        onUnavailable?.();
      };
      canvas.addEventListener("webglcontextlost", contextLost, { once: true });

      let phase = "ready";
      let reducedMotion = root.matchMedia?.("(prefers-reduced-motion: reduce)").matches || false;
      let disposed = false;
      const clock = new THREE.Clock();

      function renderFrame() {
        frame = root.requestAnimationFrame(renderFrame);
        const elapsed = clock.getElapsedTime();
        if (phase === "mixing" && !reducedMotion) {
          balls.forEach((ball, index) => {
            const angle = elapsed * (1.2 + (index % 3) * 0.12) + ball.userData.phase;
            ball.position.x = Math.cos(angle) * (0.38 + (index % 4) * 0.18);
            ball.position.y = Math.sin(angle * 1.7) * (0.4 + (index % 3) * 0.12);
            ball.position.z = Math.sin(angle * 0.8) * 0.55;
            ball.rotation.x += 0.015;
            ball.rotation.y += 0.02;
          });
          machine.rotation.y = Math.sin(elapsed * 0.28) * 0.18;
        } else if (phase === "settling" && !reducedMotion) {
          balls.forEach((ball, index) => {
            const radius = 0.35 + (index % 4) * 0.19;
            const angle = ball.userData.phase;
            ball.position.x += (Math.cos(angle) * radius - ball.position.x) * 0.08;
            ball.position.y += (-0.55 - ball.position.y) * 0.08;
            ball.position.z += (Math.sin(angle) * 0.18 - ball.position.z) * 0.08;
          });
        } else {
          machine.rotation.y *= 0.92;
        }
        if (phase === "extracting" || phase === "revealed") {
          const progress = phase === "revealed" || reducedMotion
            ? 1
            : Math.min(1, (elapsed - revealBall.userData.startedAt) / 0.55);
          revealBall.visible = true;
          revealBall.position.set(0.55 * progress, -0.1 + progress * 0.85, 0.2 + progress * 2.4);
          revealBall.scale.setScalar(0.72 + progress * 0.42);
        }
        renderer.render(scene, camera);
      }

      container.hidden = false;
      frame = root.requestAnimationFrame(renderFrame);
      return {
        setPhase(nextPhase) {
          phase = nextPhase;
          if (nextPhase === "extracting") {
            revealBall.userData.startedAt = clock.getElapsedTime();
            revealBall.visible = true;
          }
          if (nextPhase === "mixing" || nextPhase === "settling") revealBall.visible = false;
        },
        reveal(result) {
          const team = String(result.team || "").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
          const texture = labelTexture(THREE, team || String(result.pick));
          revealMaterial.map?.dispose();
          revealMaterial.map = texture;
          revealMaterial.needsUpdate = true;
        },
        setReducedMotion(value) {
          reducedMotion = Boolean(value);
        },
        dispose() {
          if (disposed) return;
          disposed = true;
          root.cancelAnimationFrame(frame);
          resizeObserver?.disconnect();
          canvas.removeEventListener("webglcontextlost", contextLost);
          scene.traverse((object) => {
            object.geometry?.dispose();
            if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
            else object.material?.dispose();
            if (object.material?.map) object.material.map.dispose();
          });
          renderer.dispose();
          renderer.forceContextLoss();
          container.hidden = true;
        },
      };
    } catch {
      root.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      scene?.traverse((object) => {
        object.geometry?.dispose();
        object.material?.map?.dispose();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
        else object.material?.dispose();
      });
      renderer?.dispose();
      renderer?.forceContextLoss();
      if (container) container.hidden = true;
      return null;
    }
  }

  root.createLotteryStage3d = createLotteryStage3d;
})(globalThis);
