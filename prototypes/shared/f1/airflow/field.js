import * as THREE from 'three'
import { viewport } from '../core/viewport.js'
import { LOOK } from '../look.js'
import { config, palette } from '../config.js'
import { time } from '../core/time.js'
import { scroll } from '../core/scroll.js'
import { hash1 } from '../utils/math.js'

// Ribbon resolution. 34 points is enough for the deformation to read smoothly
// while keeping the vertex bill manageable at high line counts.
const N_POINTS = 34

const vertexShader = /* glsl */ `
  attribute float a_phase;      // flow offset within the cycle
  attribute float a_laneY;      // "flat" vertical lane, opens up on depth reveal
  attribute float a_laneZ;      // lateral position. THIS is the grid axis.
  attribute float a_speed;      // per-line speed variation
  attribute float a_sheet;      // 0..1 height of this line's sheet
  attribute float a_band;       // 1.0 for the focal red band lines
  attribute float a_violet;     // 1.0 to lean violet instead of pale lavender
  attribute float a_lineSeed;   // deterministic per-line seed

  uniform float u_time;
  // Added to u_time by the vertex shader. Lets the flow field begin "already
  // running" instead of starting from a cold, lockstep state -- see the note in
  // step 1 of main(). A uniform rather than a CPU-side addition to u_time so
  // time.elapsed keeps meaning exactly what it says.
  uniform float u_timeSeed;
  uniform float u_scroll;

  uniform float u_flowSpeed;
  uniform float u_lineLength;
  uniform float u_cycleLength;
  uniform float u_verticalSpread;

  uniform float u_sheetSpread;
  uniform float u_depthStart;
  uniform float u_depthEnd;
  uniform float u_depthSharpness;
  uniform float u_microOscillation;

  uniform float u_thickness;
  uniform float u_projScale;

  uniform float u_turbStart;
  uniform float u_turbEnd;
  uniform float u_turbStrength;
  uniform float u_turbVertical;
  uniform float u_turbLateral;
  uniform float u_turbFreqX;
  uniform float u_turbFreqX2;
  uniform float u_turbFreqZ;
  uniform float u_turbFreqZ2;
  uniform float u_turbSpeed;
  uniform float u_turbPhaseSpread;
  uniform float u_turbLocalise;
  uniform float u_turbWakeMix;

  uniform float u_vortexStart;
  uniform float u_vortexEnd;
  uniform float u_vortexSpin;
  uniform float u_vortexTwist;
  uniform float u_vortexCoreY;
  uniform float u_vortexCoreZ;
  uniform float u_vortexRadiusGain;

  uniform float u_influenceSplay;
  uniform float u_influenceLateral;
  uniform float u_influenceUpstream;
  uniform float u_influenceWake;
  uniform float u_influenceBackFactor;

  uniform float u_wakeStartOffset;
  uniform float u_wakeLength;
  uniform float u_wakeLateral;
  uniform float u_wakeLateralGain;
  uniform float u_wakeLiftTarget;
  uniform float u_wakeLift;

  uniform float u_groundY;
  uniform float u_groundClamp;
  uniform float u_groundSoftness;

  uniform vec3 u_carCenter;
  uniform vec3 u_carHalf;

  varying float v_influence;
  varying float v_wake;
  varying float v_band;
  varying float v_violet;

  // Guard degenerate ramps. smoothstep with edge0 == edge1 divides by zero and
  // yields NaN, and a single NaN vertex makes the GPU discard the ENTIRE draw
  // -- the whole flow field silently vanishes. This only defends against that
  // degenerate case; edge direction is preserved so existing ramp behaviour is
  // unchanged.
  float safeStep(float edge0, float edge1, float x) {
    float d = edge1 - edge0;
    if (abs(d) < 1e-5) d = (d < 0.0) ? -1e-5 : 1e-5;
    return smoothstep(edge0, edge0 + d, x);
  }

  void main() {
    float t = position.x;
    float side = position.y;

    // 1. Flow offset. Lines travel -X (nose-first into the wake).
    //
    // u_timeSeed is subtracted so the field starts mid-cycle rather than at
    // t = 0. At exactly 0 every line sits at (phase - cycleLength/2), and because
    // the phases are stratified (evenly spaced) that still tiles the full cycle
    // -- but the per-line a_speed variation is multiplied by t, so at t = 0
    // speed has no effect yet and all lines are in lockstep. Seeding past the
    // first cycle lets the speed variation separate them, so the field is fully
    // developed and evenly populated on the very first frame instead of visibly
    // "starting".
    float flowTime = u_time + u_timeSeed;
    float offsetBase = -flowTime * u_flowSpeed * a_speed;
    float offset = mod(offsetBase + a_phase, u_cycleLength) - u_cycleLength * 0.5;

    float localX = (t - 0.5) * u_lineLength;
    float X = localX + offset;

    // 2. Depth reveal. Sheets fan apart and the vertical lanes open up.
    float depthReveal = safeStep(u_depthStart, u_depthEnd, u_scroll);
    float lift = pow(depthReveal, u_depthSharpness);

    float Y = a_laneY * u_verticalSpread * lift
            + (a_sheet - 0.5) * u_sheetSpread * lift;
    float Z = a_laneZ;

    // 3. Micro-oscillation, always present but off by default.
    Y += sin(u_time * 1.1 + a_lineSeed * 6.2831 + t * 3.0) * u_microOscillation;

    // 4. SPLAY -- the heart of the Currents look.
    //
    // Lines are pushed SIDEWAYS (in Z, the axis the car is narrow on) as they
    // pass the body, and slightly back into depth. That single move produces:
    //   * bunching upstream, where the field compresses,
    //   * a clean void where the body sits,
    //   * a fan and reconvergence in the wake.
    // The sign of a_laneZ keeps each line on its own side, so streamlines
    // never cross each other and the field stays laminar.
    //
    // CAR-RELATIVE COORDINATES. All three components of u_carCenter are used
    // here. The influence is measured from the car's centre, not from the world
    // origin, so moving the car moves the whole deformation with it:
    //
    //   .x  shifts the streamwise window (where the nose and wake sit)
    //   .y  shifts the vertical centre lines bow around
    //   .z  shifts the lateral centre lines part around, and the corridor
    //
    // Measuring from the origin instead would leave the field parting around an
    // invisible box at z = 0 while the car sat somewhere else -- and would make
    // the carCenter y/z panel sliders dead controls, since neither component
    // appeared anywhere else in the shader.
    float relZ = a_laneZ - u_carCenter.z;
    float zN = relZ / u_carHalf.z;
    float xN = (X - u_carCenter.x) / u_carHalf.x;
    // Vertical distance from the car's centre line, as a fraction of carHalf.y.
    // Without this term carHalf.y was likewise written to the uniform but never
    // read, so the ellipsoid had no vertical extent at all.
    float yN = (Y - u_carCenter.y) / u_carHalf.y;

    // Streamwise profile: ramps up ahead of the nose, peaks over the body,
    // and decays through the wake.
    float front = safeStep(u_influenceUpstream, 0.0, xN);   // 0 -> 1 approaching
    float back  = safeStep(0.0, -u_influenceWake, xN);      // 1 -> 0 into the wake
    float streamProfile = max(front, back * u_influenceBackFactor);

    // Lateral profile: strongest next to the body, fading outward.
    // Wider falloff than a tight gaussian so the bunching extends well beyond
    // the body -- in the reference the crowding is visible across most of the
    // frame, not just in a thin band beside the object.
    float latFall = exp(-zN * zN * 0.22);

    // Vertical profile: same falloff, at a quarter of the lateral strength.
    //
    // The 0.25 factor is what keeps this from turning into a visible change to
    // the shipped composition. At carHalf.y = 0.55 a line a full half-height off
    // the centre loses only ~6% of its influence, so the field still reacts
    // almost uniformly across its depth and keeps the graphic-sheet look; what
    // the term actually buys is that raising carCenter.y or shrinking carHalf.y
    // now concentrates the deformation vertically the way the controls imply.
    float vertFall = exp(-yN * yN * 0.22 * 0.25);

    float splay = streamProfile * latFall * vertFall;

    // No line may cross the body: guarantee a corridor just wider than the car
    // so the silhouette reads as a void. Kept tight -- a generous corridor eats
    // the line density and leaves an empty frame around the car.
    //
    // Measured against the car's centre in Z, so the void tracks the body rather
    // than sitting at the origin.
    float corridor = u_carHalf.z * 1.05;
    float relAbs = abs(relZ);
    if (relAbs < corridor) {
      Z = u_carCenter.z + sign(relZ) * mix(corridor, relAbs, clamp(splay, 0.0, 1.0));
    }

    // The bulk of the sideways push.
    Z += splay * sign(a_laneZ) * u_influenceSplay;
    // A little depth step so Act 3 has something to reveal.
    Y += splay * u_influenceLateral * 0.5;

    // 5. Wake zone behind the car (X < car rear).
    float rearX = u_carCenter.x - u_carHalf.x;
    float wakeZone = safeStep(rearX - u_wakeStartOffset,
                              rearX - u_wakeStartOffset - u_wakeLength, X);
    Z += wakeZone * sign(a_laneZ) * u_wakeLateral * (1.0 + splay * u_wakeLateralGain);
    Y += wakeZone * (u_wakeLiftTarget - a_laneY) * u_wakeLift;

    // 6. Harmonic turbulence (Act 4). Off by default.
    float turbAmount = safeStep(u_turbStart, u_turbEnd, u_scroll) * u_turbStrength;
    // How much of the field counts as "already disturbed". At turbLocalise 0 the
    // turbulence is applied uniformly, which makes the whole sheet wobble; at 1
    // it only appears near the car and through the wake.
    float turbMix = mix(1.0, splay + wakeZone * u_turbWakeMix, u_turbLocalise);
    float turbPhase = a_phase * u_turbPhaseSpread;
    float turbY = sin(X * u_turbFreqX + u_time * u_turbSpeed + turbPhase * 5.0)
                * cos(X * u_turbFreqX2 - u_time * u_turbSpeed * 0.67);
    float turbZ = cos(X * u_turbFreqZ - u_time * u_turbSpeed * 0.9 + turbPhase * 3.0)
                * sin(X * u_turbFreqZ2 + u_time * u_turbSpeed * 0.52);
    Y += turbY * turbAmount * turbMix * u_turbVertical;
    Z += turbZ * turbAmount * turbMix * u_turbLateral;

    // 7. Vortex (Act 5).
    float vortexAmount = safeStep(u_vortexStart, u_vortexEnd, u_scroll);
    if (vortexAmount > 0.001 && X < rearX + 0.5) {
      float depth = (rearX + 0.5) - X;
      float dir = (a_laneZ >= 0.0) ? 1.0 : -1.0;
      float coreY = u_vortexCoreY;
      float coreZ = dir * u_vortexCoreZ;
      float relY = Y - coreY;
      float relZ = Z - coreZ;
      float r = sqrt(relY * relY + relZ * relZ);
      float angle = atan(relY, relZ);
      float twist = angle + depth * u_vortexTwist * dir + u_time * u_vortexSpin * dir;
      float newR = r * (1.0 + depth * u_vortexRadiusGain);
      float newY = coreY + newR * sin(twist);
      float newZ = coreZ + newR * cos(twist);
      float blend = vortexAmount * safeStep(rearX + 0.5, rearX - 3.0, X);
      Y = mix(Y, newY, blend);
      Z = mix(Z, newZ, blend);
    }

    // 7b. GROUND. Nothing may go below the floor.
    //
    // Every stage above can push a line downward -- the vertical fan at depth
    // reveal, the depth splay, the wake's vertical recovery, the turbulence and
    // the vortex. Applied here, once, after all of them, so no individual stage
    // has to know about the floor and no combination of them can escape it.
    //
    // groundClamp is the strength of the effect: 0 switches the floor off
    // entirely (lines pass through) and 1 applies it fully. groundSoftness is
    // the height of a compression band just ABOVE the floor -- lines entering it
    // are pulled down toward the floor and held there, which is what turns the
    // limit into a visible surface, the flat packed layer the reference artwork
    // has along its lower edge, instead of a hard cut where lines vanish.
    //
    // Order matters: the band is applied first, the hard limit second. The limit
    // alone would let a line sit above groundY but still inside the band; the
    // band alone would leave a line that starts below the floor untouched.
    if (u_groundClamp > 0.0) {
      float band = safeStep(u_groundY + u_groundSoftness, u_groundY, Y);
      Y = mix(Y, u_groundY, band * u_groundClamp);
      if (Y < u_groundY) Y = u_groundY;   // the guarantee, not the aesthetic
    }

    vec3 worldPos = vec3(X, Y, Z);

    // 8. Screen-space ribbon expansion: constant pixel width at any distance.
    vec3 viewPos = (viewMatrix * vec4(worldPos, 1.0)).xyz;
    vec3 viewTan = (viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz;
    vec2 tan2 = viewTan.xy;
    if (length(tan2) < 1e-4) tan2 = vec2(1.0, 0.0);
    tan2 = normalize(tan2);
    vec2 perp = vec2(-tan2.y, tan2.x);

    float dist = -viewPos.z;
    float worldPerPixel = max(dist, 0.001) * u_projScale;
    viewPos.xy += perp * side * u_thickness * worldPerPixel * 0.5;

    v_influence = splay;
    v_wake = wakeZone * vortexAmount;
    v_band = a_band;
    v_violet = a_violet;

    gl_Position = projectionMatrix * vec4(viewPos, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 u_colorBase;        // pale lavender
  uniform vec3 u_colorViolet;      // deeper violet
  uniform vec3 u_colorSeparation;  // wash where the field is disturbed
  uniform vec3 u_colorVortex;      // warm accent, reserved for the vortex exit
  uniform vec3 u_colorBand;        // the bold focal streak
  uniform float u_opacity;
  uniform float u_bandStrength;

  varying float v_influence;
  varying float v_wake;
  varying float v_band;
  varying float v_violet;

  void main() {
    // Tonal variety: most lines pale lavender, a minority leaning violet.
    vec3 col = mix(u_colorBase, u_colorViolet, v_violet);

    // The focal band overrides everything -- it is the composition's anchor.
    col = mix(col, u_colorBand, v_band * u_bandStrength);

    // Disturbed flow washes toward the separation colour, but never as
    // strongly as the band, so the band stays the loudest thing on screen.
    col = mix(col, u_colorSeparation, smoothstep(0.25, 0.9, v_influence) * 0.45);
    col = mix(col, u_colorVortex, v_wake * 0.75);

    gl_FragColor = vec4(col, u_opacity);
  }
`

export function createAirflow(scene) {
  const a = config.airflow
  const perSheet = a.countLines
  const sheets = a.sheetCount
  const instanceCount = perSheet * sheets

  const geom = new THREE.InstancedBufferGeometry()

  // A ribbon: N_POINTS along the line, 2 vertices across (side = -1 / +1).
  const positions = new Float32Array(N_POINTS * 2 * 3)
  for (let i = 0; i < N_POINTS; i++) {
    const t = i / (N_POINTS - 1)
    positions[i * 6 + 0] = t
    positions[i * 6 + 1] = -1
    positions[i * 6 + 2] = 0
    positions[i * 6 + 3] = t
    positions[i * 6 + 4] = +1
    positions[i * 6 + 5] = 0
  }
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  const indices = []
  for (let i = 0; i < N_POINTS - 1; i++) {
    const v0 = i * 2
    const v1 = i * 2 + 1
    const v2 = i * 2 + 2
    const v3 = i * 2 + 3
    indices.push(v0, v1, v2, v1, v3, v2)
  }
  geom.setIndex(indices)

  const phases = new Float32Array(instanceCount)
  const laneYs = new Float32Array(instanceCount)
  const laneZs = new Float32Array(instanceCount)
  const speeds = new Float32Array(instanceCount)
  const sheetIds = new Float32Array(instanceCount)
  const bands = new Float32Array(instanceCount)
  const violets = new Float32Array(instanceCount)
  const seeds = new Float32Array(instanceCount)

  const cycle = a.cycleLength
  const halfZ = a.lateralSpread

  let idx = 0
  for (let s = 0; s < sheets; s++) {
    const sheetT = sheets === 1 ? 0.5 : s / (sheets - 1)
    // Each sheet is phase-shifted along the flow, so under projection the
    // line families cross and interfere -- this is what makes the moire.
    const sheetPhase = ((s * a.sheetPhaseJitter) % 1) * cycle

    for (let i = 0; i < perSheet; i++) {
      // Stratified lateral position: exactly even spacing, no clumping.
      const t = perSheet === 1 ? 0.5 : i / (perSheet - 1)
      const laneZ = -halfZ + 2 * halfZ * t

      laneZs[idx] = laneZ
      // The "flat" vertical lane. Small, and opened up by the depth reveal.
      laneYs[idx] = (hash1(idx * 3.1) - 0.5) * 0.9
      sheetIds[idx] = sheetT
      phases[idx] = (sheetPhase + i * cycle / perSheet) % cycle
      speeds[idx] = 0.92 + hash1(idx * 5.3) * 0.16
      bands[idx] = Math.abs(laneZ) <= a.bandWidth ? 1 : 0
      violets[idx] = hash1(idx * 11.7) < a.violetMix ? 1 : 0
      seeds[idx] = hash1(idx * 7.7)

      idx++
    }
  }

  geom.setAttribute('a_phase', new THREE.InstancedBufferAttribute(phases, 1))
  geom.setAttribute('a_laneY', new THREE.InstancedBufferAttribute(laneYs, 1))
  geom.setAttribute('a_laneZ', new THREE.InstancedBufferAttribute(laneZs, 1))
  geom.setAttribute('a_speed', new THREE.InstancedBufferAttribute(speeds, 1))
  geom.setAttribute('a_sheet', new THREE.InstancedBufferAttribute(sheetIds, 1))
  geom.setAttribute('a_band', new THREE.InstancedBufferAttribute(bands, 1))
  geom.setAttribute('a_violet', new THREE.InstancedBufferAttribute(violets, 1))
  geom.setAttribute('a_lineSeed', new THREE.InstancedBufferAttribute(seeds, 1))
  geom.instanceCount = instanceCount

  const uniforms = {
    u_time:              { value: 0 },
    u_timeSeed:          { value: a.timeSeed },
    u_scroll:            { value: 0 },
    u_flowSpeed:         { value: a.flowSpeed },
    u_lineLength:        { value: a.lineLength },
    u_cycleLength:       { value: a.cycleLength },
    // Was hardcoded to 4.5, which made the single strongest control over how
    // three-dimensional the field looks impossible to tune. Now config-driven.
    u_verticalSpread:    { value: a.verticalSpread },
    u_sheetSpread:       { value: a.sheetSpread },
    u_depthStart:        { value: a.depthStart },
    u_depthEnd:          { value: a.depthEnd },
    u_depthSharpness:    { value: a.depthSharpness },
    u_microOscillation:  { value: a.microOscillation },
    u_thickness:         { value: a.lineThickness },
    u_projScale:         { value: 0.001 },
    u_turbStart:         { value: a.turbStart },
    u_turbEnd:           { value: a.turbEnd },
    u_turbStrength:      { value: a.turbStrength },
    u_turbVertical:      { value: a.turbVertical },
    u_turbLateral:       { value: a.turbLateral },
    u_turbFreqX:         { value: a.turbFreqX },
    u_turbFreqX2:        { value: a.turbFreqX2 },
    u_turbFreqZ:         { value: a.turbFreqZ },
    u_turbFreqZ2:        { value: a.turbFreqZ2 },
    u_turbSpeed:         { value: a.turbSpeed },
    u_turbPhaseSpread:   { value: a.turbPhaseSpread },
    u_turbLocalise:      { value: a.turbLocalise },
    u_turbWakeMix:       { value: a.turbWakeMix },
    u_vortexStart:       { value: a.vortexStart },
    u_vortexEnd:         { value: a.vortexEnd },
    u_vortexSpin:        { value: a.vortexSpin },
    u_vortexTwist:       { value: a.vortexTwist },
    u_vortexCoreY:       { value: a.vortexCoreY },
    u_vortexCoreZ:       { value: a.vortexCoreZ },
    u_vortexRadiusGain:  { value: a.vortexRadiusGain },
    u_influenceSplay:    { value: a.influenceSplay },
    u_influenceLateral:  { value: a.influenceLateral },
    u_influenceUpstream: { value: a.influenceUpstream },
    u_influenceWake:     { value: a.influenceWake },
    u_influenceBackFactor: { value: a.influenceBackFactor },
    u_wakeStartOffset:   { value: a.wakeStartOffset },
    u_wakeLength:        { value: a.wakeLength },
    u_wakeLateral:       { value: a.wakeLateral },
    u_wakeLateralGain:   { value: a.wakeLateralGain },
    u_wakeLiftTarget:    { value: a.wakeLiftTarget },
    u_wakeLift:          { value: a.wakeLift },
    u_groundY:           { value: a.groundY },
    u_groundClamp:       { value: a.groundClamp },
    u_groundSoftness:    { value: a.groundSoftness },
    u_carCenter:         { value: new THREE.Vector3(a.carCenter.x, a.carCenter.y, a.carCenter.z) },
    u_carHalf:           { value: new THREE.Vector3(a.carHalf.x, a.carHalf.y, a.carHalf.z) },
    u_colorBase:         { value: new THREE.Color(palette.laminar) },
    u_colorViolet:       { value: new THREE.Color(palette.violet) },
    u_colorSeparation:   { value: new THREE.Color(palette.separation) },
    // HDR gains (look.js): these two accents are what the bloom pass picks up.
    u_colorVortex:       { value: new THREE.Color(palette.vortex).multiplyScalar(LOOK.vortexGain) },
    u_colorBand:         { value: new THREE.Color(palette.band).multiplyScalar(LOOK.bandGain) },
    u_bandStrength:      { value: a.bandStrength },
    u_opacity:           { value: a.opacity },
  }

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    // Additive so the thousand-odd thin lines accumulate into the dense,
    // luminous packing of the reference instead of alpha-blending into mush.
    blending: a.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    // REQUIRED. The ribbon is expanded in the vertex shader by offsetting each
    // vertex along `side` (position.y, which is -1 or +1), so the quad's
    // winding order depends on the sign of that offset. With three.js's default
    // FrontSide every triangle is back-facing and the entire flow field is
    // silently culled -- correct instanceCount, valid draw call, zero pixels.
    side: THREE.DoubleSide,
    // REQUIRED for the same class of reason. three.js injects
    // `#ifdef USE_INSTANCING` around `attribute mat4 instanceMatrix;` in its
    // vertex preamble but only *defines* USE_INSTANCING for its own built-in
    // materials, not for a custom ShaderMaterial on an InstancedBufferGeometry.
    // Without it the vertex shader fails to compile and the program is marked
    // non-runnable, which also renders nothing.
    defines: { USE_INSTANCING: '' },
  })

  const mesh = new THREE.Mesh(geom, material)
  mesh.frustumCulled = false
  scene.add(mesh)

  return { mesh, material, uniforms, instanceCount }
}

// Push the live config into the shader uniforms.
//
// `createAirflow` seeds these once at construction, but the config object is
// what the panel actually mutates. Without this sync every airflow slider is
// cosmetic: it changes `config.airflow` while the shader keeps rendering the
// values it was born with. Cheap (a handful of scalar writes), so it runs every
// frame and needs no onChange plumbing anywhere.
export function applyAirflowConfig(field) {
  const u = field.uniforms
  const a = config.airflow

  u.u_flowSpeed.value = a.flowSpeed
  u.u_lineLength.value = a.lineLength
  u.u_cycleLength.value = a.cycleLength
  u.u_timeSeed.value = a.timeSeed
  u.u_sheetSpread.value = a.sheetSpread
  u.u_verticalSpread.value = a.verticalSpread
  u.u_depthStart.value = a.depthStart
  u.u_depthEnd.value = a.depthEnd
  u.u_depthSharpness.value = a.depthSharpness
  u.u_microOscillation.value = a.microOscillation
  u.u_thickness.value = a.lineThickness
  u.u_turbStart.value = a.turbStart
  u.u_turbEnd.value = a.turbEnd
  u.u_turbStrength.value = a.turbStrength
  u.u_turbVertical.value = a.turbVertical
  u.u_turbLateral.value = a.turbLateral
  u.u_turbFreqX.value = a.turbFreqX
  u.u_turbFreqX2.value = a.turbFreqX2
  u.u_turbFreqZ.value = a.turbFreqZ
  u.u_turbFreqZ2.value = a.turbFreqZ2
  u.u_turbSpeed.value = a.turbSpeed
  u.u_turbPhaseSpread.value = a.turbPhaseSpread
  u.u_turbLocalise.value = a.turbLocalise
  u.u_turbWakeMix.value = a.turbWakeMix
  u.u_vortexStart.value = a.vortexStart
  u.u_vortexEnd.value = a.vortexEnd
  u.u_vortexSpin.value = a.vortexSpin
  u.u_vortexTwist.value = a.vortexTwist
  u.u_vortexCoreY.value = a.vortexCoreY
  u.u_vortexCoreZ.value = a.vortexCoreZ
  u.u_vortexRadiusGain.value = a.vortexRadiusGain
  u.u_influenceSplay.value = a.influenceSplay
  u.u_influenceLateral.value = a.influenceLateral
  u.u_influenceUpstream.value = a.influenceUpstream
  u.u_influenceWake.value = a.influenceWake
  u.u_influenceBackFactor.value = a.influenceBackFactor
  u.u_wakeStartOffset.value = a.wakeStartOffset
  u.u_wakeLength.value = a.wakeLength
  u.u_wakeLateral.value = a.wakeLateral
  u.u_wakeLateralGain.value = a.wakeLateralGain
  u.u_wakeLiftTarget.value = a.wakeLiftTarget
  u.u_wakeLift.value = a.wakeLift
  u.u_groundY.value = a.groundY
  u.u_groundClamp.value = a.groundClamp
  u.u_groundSoftness.value = a.groundSoftness
  u.u_bandStrength.value = a.bandStrength
  u.u_opacity.value = a.opacity

  u.u_carCenter.value.set(a.carCenter.x, a.carCenter.y, a.carCenter.z)
  u.u_carHalf.value.set(a.carHalf.x, a.carHalf.y, a.carHalf.z)
}

export function updateAirflow(field, camera) {
  const u = field.uniforms
  u.u_time.value = time.elapsed
  u.u_scroll.value = scroll.progress

  applyAirflowConfig(field)

  // Pixel-accurate ribbon thickness: world units per pixel at distance d
  // equals d * 2*tan(fov/2) / viewportHeightPixels.
  const fovRad = (camera.fov * Math.PI) / 180
  u.u_projScale.value =
    (2.0 * Math.tan(fovRad * 0.5)) / viewport.height
}
