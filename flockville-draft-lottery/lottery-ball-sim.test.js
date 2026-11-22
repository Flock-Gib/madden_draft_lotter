const test = require("node:test");
const assert = require("node:assert/strict");
const { MAX_FRAME_DELTA, ballRadiusForCount, clampDelta, createBallSimulation } = require("./lottery-ball-sim.js");

function run(sim, seconds, mode, fps = 60) {
  const frames = Math.round(seconds * fps);
  for (let index = 0; index < frames; index += 1) sim.step(1 / fps, mode);
}

function worstOverlap(sim) {
  let worst = 0;
  const live = sim.balls.filter((ball) => ball.active);
  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      const a = live[i];
      const b = live[j];
      worst = Math.max(worst, sim.radius * 2 - Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
    }
  }
  return worst;
}

function worstEscape(sim) {
  return Math.max(...sim.balls.map((ball) => Math.hypot(ball.x, ball.y, ball.z) - (sim.chamberRadius - sim.radius)));
}

test("clampDelta bounds large, negative and invalid frame deltas", () => {
  assert.equal(clampDelta(1 / 60), 1 / 60);
  assert.equal(clampDelta(5), MAX_FRAME_DELTA);
  assert.equal(clampDelta(-1), 0);
  assert.equal(clampDelta(Number.NaN), 0);
  assert.equal(clampDelta(Infinity), 0);
});

test("ball radius shrinks for larger pools within sane bounds", () => {
  assert.ok(ballRadiusForCount(4) <= 0.33);
  assert.ok(ballRadiusForCount(32) >= 0.18);
  assert.ok(ballRadiusForCount(32) < ballRadiusForCount(12));
});

for (const count of [8, 12, 32]) {
  test(`${count} balls stay separated and inside the chamber while mixing and settling`, () => {
    const radius = ballRadiusForCount(count);
    const sim = createBallSimulation({ count, radius, chamberRadius: 1.55, seed: 7 });
    let maxOverlap = 0;
    let maxEscape = 0;
    let peakHeight = -Infinity;
    for (let frame = 0; frame < 240; frame += 1) {
      sim.step(1 / 60, "mix");
      maxOverlap = Math.max(maxOverlap, worstOverlap(sim));
      maxEscape = Math.max(maxEscape, worstEscape(sim));
      peakHeight = Math.max(peakHeight, ...sim.balls.map((ball) => ball.y));
    }
    assert.ok(maxOverlap < radius * 0.2, `mix overlap ${maxOverlap}`);
    assert.ok(maxEscape < 0.02, `mix escape ${maxEscape}`);
    assert.ok(peakHeight > 0.3, "air mixing should lift balls into the upper chamber");

    run(sim, 3, "settle");
    run(sim, 1, "rest");
    assert.ok(worstOverlap(sim) < radius * 0.1, `settled overlap ${worstOverlap(sim)}`);
    assert.ok(worstEscape(sim) < 0.02);
    const meanY = sim.balls.reduce((sum, ball) => sum + ball.y, 0) / count;
    assert.ok(meanY < -0.4, `settled balls should pack at the bottom (mean y ${meanY})`);
    const distinctHeights = new Set(sim.balls.map((ball) => ball.y.toFixed(2)));
    assert.ok(distinctHeights.size > 1 || count < 4, "settled balls should not collapse onto one line");
  });
}

test("motion is frame-rate independent and survives a long inactive-tab delta", () => {
  const at60 = createBallSimulation({ count: 12, radius: 0.25, chamberRadius: 1.55, seed: 3 });
  const at30 = createBallSimulation({ count: 12, radius: 0.25, chamberRadius: 1.55, seed: 3 });
  run(at60, 2, "settle", 60);
  run(at30, 2, "settle", 30);
  assert.ok(Math.abs(at60.time - at30.time) < 1e-9);
  const meanY = (sim) => sim.balls.reduce((sum, ball) => sum + ball.y, 0) / sim.balls.length;
  assert.ok(Math.abs(meanY(at60) - meanY(at30)) < 0.15);

  const before = at60.time;
  assert.equal(at60.step(30, "mix"), MAX_FRAME_DELTA);
  assert.ok(Math.abs(at60.time - before - MAX_FRAME_DELTA) < 1e-9);
  assert.ok(worstEscape(at60) < 0.02);
  for (const ball of at60.balls) assert.ok([ball.x, ball.y, ball.z, ball.vx, ball.vy, ball.vz].every(Number.isFinite));
});

test("same seed reproduces the same decorative motion", () => {
  const a = createBallSimulation({ count: 10, radius: 0.25, seed: 11 });
  const b = createBallSimulation({ count: 10, radius: 0.25, seed: 11 });
  run(a, 1, "mix");
  run(b, 1, "mix");
  assert.deepEqual(a.balls.map((ball) => ball.x), b.balls.map((ball) => ball.x));
});

test("kinematic balls push others aside and inactive balls are ignored", () => {
  const sim = createBallSimulation({ count: 6, radius: 0.25, chamberRadius: 1.55, seed: 5 });
  run(sim, 2, "settle");
  const target = { x: sim.balls[1].x, y: sim.balls[1].y, z: sim.balls[1].z };
  sim.setKinematic(0, true, target);
  run(sim, 0.5, "rest");
  assert.deepEqual([sim.balls[0].x, sim.balls[0].y, sim.balls[0].z], [target.x, target.y, target.z]);
  assert.ok(Math.hypot(sim.balls[1].x - target.x, sim.balls[1].y - target.y, sim.balls[1].z - target.z) > 0.4);

  sim.setKinematic(0, false);
  sim.setActive(2, false);
  const parked = { x: sim.balls[2].x, y: sim.balls[2].y, z: sim.balls[2].z };
  run(sim, 0.5, "mix");
  assert.deepEqual({ x: sim.balls[2].x, y: sim.balls[2].y, z: sim.balls[2].z }, parked);
});

test("simulation never touches Math.random", () => {
  const original = Math.random;
  Math.random = () => {
    throw new Error("draw RNG must not be consumed by decoration");
  };
  try {
    const sim = createBallSimulation({ count: 12, radius: 0.25 });
    run(sim, 1, "mix");
  } finally {
    Math.random = original;
  }
});
