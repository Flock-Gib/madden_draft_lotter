(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.lotteryBallSim = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  // Decorative ball motion for the 3D stage. It never selects winners and owns
  // its own PRNG, so it cannot consume the lottery draw's random sequence.
  const MAX_FRAME_DELTA = 0.05;
  const SUBSTEP = 1 / 120;
  const MAX_SPEED = 7;

  function clampDelta(delta) {
    const value = Number(delta);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.min(value, MAX_FRAME_DELTA);
  }

  function mulberry32(seed) {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const MODES = {
    mix: { jet: 40, turbulence: 16, drag: 0.55, restitution: 0.62, spin: 5 },
    settle: { jet: 0, turbulence: 0, drag: 2.4, restitution: 0.2, spin: 0 },
    rest: { jet: 0, turbulence: 0, drag: 3, restitution: 0.1, spin: 0 },
  };

  function createBallSimulation(options = {}) {
    const count = Math.max(0, Math.floor(options.count || 0));
    const radius = options.radius ?? 0.25;
    const chamberRadius = options.chamberRadius ?? 1.6;
    const gravity = options.gravity ?? 9;
    const random = mulberry32(options.seed ?? 0x5eed);
    const limit = chamberRadius - radius;
    const balls = [];
    let time = 0;

    for (let index = 0; index < count; index += 1) {
      let position = [0, -limit, 0];
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const candidate = [
          (random() * 2 - 1) * limit,
          (random() * 2 - 1) * limit,
          (random() * 2 - 1) * limit,
        ];
        if (Math.hypot(...candidate) > limit) continue;
        const clear = balls.every((ball) => Math.hypot(ball.x - candidate[0], ball.y - candidate[1], ball.z - candidate[2]) >= radius * 2);
        position = candidate;
        if (clear) break;
      }
      balls.push({
        x: position[0], y: position[1], z: position[2],
        vx: 0, vy: 0, vz: 0,
        wx: 0, wy: 0, wz: 0,
        kx: 0, ky: 0, kz: 0,
        kickAt: random() * 0.2,
        active: true,
        kinematic: false,
      });
    }

    function applyForces(ball, h, params) {
      let ax = 0;
      let ay = -gravity;
      let az = 0;
      if (params.jet) {
        // An air column rises through the middle and spills down the walls.
        const spread = chamberRadius * 0.55;
        const column = Math.exp(-(ball.x * ball.x + ball.z * ball.z) / (spread * spread));
        const lift = 0.45 + 0.55 * Math.max(0, -ball.y / chamberRadius);
        ay += params.jet * column * lift;
        ax += -ball.z * 2.2;
        az += ball.x * 2.2;
        if (time >= ball.kickAt) {
          ball.kickAt = time + 0.12 + random() * 0.18;
          ball.kx = (random() * 2 - 1) * params.turbulence;
          ball.ky = (random() * 2 - 1) * params.turbulence * 0.6;
          ball.kz = (random() * 2 - 1) * params.turbulence;
          ball.wx += (random() * 2 - 1) * params.spin;
          ball.wy += (random() * 2 - 1) * params.spin;
          ball.wz += (random() * 2 - 1) * params.spin;
        }
        ax += ball.kx;
        ay += ball.ky;
        az += ball.kz;
      }
      const drag = Math.exp(-params.drag * h);
      ball.vx = (ball.vx + ax * h) * drag;
      ball.vy = (ball.vy + ay * h) * drag;
      ball.vz = (ball.vz + az * h) * drag;
      const speed = Math.hypot(ball.vx, ball.vy, ball.vz);
      if (speed > MAX_SPEED) {
        const scale = MAX_SPEED / speed;
        ball.vx *= scale;
        ball.vy *= scale;
        ball.vz *= scale;
      }
      ball.x += ball.vx * h;
      ball.y += ball.vy * h;
      ball.z += ball.vz * h;
      const spinDamping = Math.exp(-0.8 * h);
      ball.wx *= spinDamping;
      ball.wy *= spinDamping;
      ball.wz *= spinDamping;
    }

    function separate(a, b, params) {
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dz = b.z - a.z;
      let distance = Math.hypot(dx, dy, dz);
      const minimum = radius * 2;
      if (distance >= minimum) return;
      if (distance < 1e-6) {
        dx = random() - 0.5;
        dy = random() - 0.5;
        dz = random() - 0.5;
        distance = Math.hypot(dx, dy, dz) || 1;
      }
      const nx = dx / distance;
      const ny = dy / distance;
      const nz = dz / distance;
      const overlap = minimum - distance;
      const shareA = a.kinematic ? 0 : b.kinematic ? 1 : 0.5;
      const shareB = 1 - shareA;
      a.x -= nx * overlap * shareA;
      a.y -= ny * overlap * shareA;
      a.z -= nz * overlap * shareA;
      b.x += nx * overlap * shareB;
      b.y += ny * overlap * shareB;
      b.z += nz * overlap * shareB;
      const approach = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny + (b.vz - a.vz) * nz;
      if (approach >= 0) return;
      const impulse = -(1 + params.restitution) * approach;
      a.vx -= nx * impulse * shareA;
      a.vy -= ny * impulse * shareA;
      a.vz -= nz * impulse * shareA;
      b.vx += nx * impulse * shareB;
      b.vy += ny * impulse * shareB;
      b.vz += nz * impulse * shareB;
    }

    function containWithinChamber(ball, params) {
      const distance = Math.hypot(ball.x, ball.y, ball.z);
      if (distance <= limit) return;
      const nx = ball.x / distance;
      const ny = ball.y / distance;
      const nz = ball.z / distance;
      ball.x = nx * limit;
      ball.y = ny * limit;
      ball.z = nz * limit;
      const outward = ball.vx * nx + ball.vy * ny + ball.vz * nz;
      if (outward > 0) {
        ball.vx -= (1 + params.restitution) * outward * nx;
        ball.vy -= (1 + params.restitution) * outward * ny;
        ball.vz -= (1 + params.restitution) * outward * nz;
      }
      // Rolling contact: spin follows the tangential slide along the glass.
      const rollX = (ny * ball.vz - nz * ball.vy) / -radius;
      const rollY = (nz * ball.vx - nx * ball.vz) / -radius;
      const rollZ = (nx * ball.vy - ny * ball.vx) / -radius;
      ball.wx += (rollX - ball.wx) * 0.35;
      ball.wy += (rollY - ball.wy) * 0.35;
      ball.wz += (rollZ - ball.wz) * 0.35;
      const friction = 0.985;
      ball.vx *= friction;
      ball.vy *= friction;
      ball.vz *= friction;
    }

    function substep(h, params) {
      time += h;
      const live = balls.filter((ball) => ball.active);
      for (const ball of live) {
        if (!ball.kinematic) applyForces(ball, h, params);
      }
      for (let iteration = 0; iteration < 4; iteration += 1) {
        for (let i = 0; i < live.length; i += 1) {
          for (let j = i + 1; j < live.length; j += 1) {
            if (live[i].kinematic && live[j].kinematic) continue;
            separate(live[i], live[j], params);
          }
        }
        for (const ball of live) {
          if (!ball.kinematic) containWithinChamber(ball, params);
        }
      }
    }

    function step(delta, mode = "rest") {
      const elapsed = clampDelta(delta);
      if (!elapsed) return 0;
      const params = MODES[mode] || MODES.rest;
      const steps = Math.ceil(elapsed / SUBSTEP - 1e-9);
      const h = elapsed / steps;
      for (let index = 0; index < steps; index += 1) substep(h, params);
      return elapsed;
    }

    function setKinematic(index, kinematic, position) {
      const ball = balls[index];
      if (!ball) return;
      ball.kinematic = Boolean(kinematic);
      if (position) {
        ball.x = position.x;
        ball.y = position.y;
        ball.z = position.z;
      }
      ball.vx = 0;
      ball.vy = 0;
      ball.vz = 0;
    }

    function setActive(index, active) {
      const ball = balls[index];
      if (ball) ball.active = Boolean(active);
    }

    return {
      balls,
      radius,
      chamberRadius,
      step,
      setActive,
      setKinematic,
      get time() {
        return time;
      },
    };
  }

  function ballRadiusForCount(count) {
    const safe = Math.max(1, count);
    return Math.min(0.33, Math.max(0.18, 0.32 * Math.cbrt(10 / safe)));
  }

  return {
    MAX_FRAME_DELTA,
    SUBSTEP,
    ballRadiusForCount,
    clampDelta,
    createBallSimulation,
  };
});
