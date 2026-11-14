export const palette = {
  backgroundTop: '#322736',
  backgroundBottom: '#1D1720',
  laminar: '#CBA6C3',
  violet: '#886593',
  chalk: '#A0A0A2',
  separation: '#E23E64',
  separationDeep: '#E53247',
  vortex: '#E69D25',
  // The single bold streak that runs through the Currents composition.
  // Deliberately more saturated than `separation`, which stays a wash.
  band: '#E5113C',
  car: '#151419',
}

// Every rotation in this file is stored in DEGREES and converted at the point
// of use (THREE.MathUtils.degToRad). Degrees are what the panel shows and what
// gets read back out of "Copy Full Config", so there is one obvious unit
// everywhere rather than radians in some places and degrees in others.
export const config = {
  scroll: {
    endVH: 3.45,        // camera reaches endpoint at this many viewport heights
    smoothing: 0.1,     // time constant of the scroll smoothing filter, seconds
  },

  car: {
    modelPath: '/models/f1-car.glb',
    scale: 0.605,
    // Set by eye. Note this is a deliberate, slight three-quarter yaw -- the nudge
    // off a clean PI/2 (90 deg) is what gives the car its offset angle in frame.
    rotationX: 12.91476311,
    rotationY: 90.86046808,
    rotationZ: -11.52704964,
    positionX: 0.72,
    positionY: -0.14,
    positionZ: 0.05,

    // ---- Centring --------------------------------------------------------
    // The exported model is NOT centred on its own origin. Measured from the GLB
    // itself (scripts/inspect-glb.py public/models/f1-car.glb):
    //
    //     bounds min Z -5.098   max Z +7.055  -> centre Z +0.978
    //     bounds min Y  0.094   max Y  2.682  -> centre Y +1.294
    //
    // The tail sits ~0.98 local units further from the origin than the nose, and
    // the whole body floats above it. Those two numbers are why the car looked
    // off-axis no matter what positionX/Y/Z said: the config was compensating
    // for a modelling offset rather than placing the car.
    //
    // With autoCenter on, the loader measures the bounding box at load and
    // subtracts its centre, so the car's GEOMETRIC CENTRE lands on
    // (positionX, positionY, positionZ). That makes those three values mean
    // "where the car is", which is what they look like they mean.
    //
    // Turn it off to place the model's own origin instead, reproducing the
    // pre-centring framing exactly.
    autoCenter: true,
    // Pivot used when autoCenter is on. 'bbox' = geometric centre of the whole
    // model. 'ground' = bbox centre in X/Z but the model's LOWEST point in Y, so
    // positionY reads as "how far the tyres sit above the ground plane".
    centerMode: 'ground',

    // ---- Surface finish --------------------------------------------------
    // `finish` is a STARTING POINT, not a live mode: choosing one copies its
    // values into the sliders below (see src/car/finishes.js). Tune those by
    // hand afterwards; the finish name is only a label for which preset was
    // applied last -- these values were hand-tuned past the glossy preset's own.
    finish: 'glossy',
    color: '#252429',       // the single body colour every part is tinted to
    roughness: 1,           // 0 = mirror, 1 = fully diffuse
    metalness: 1,           // 1 = metal. Needs the environment or it goes black
    clearcoat: 0.615,       // lacquer layer over the base. 0 = none
    clearcoatRoughness: 0.18,
    envMapIntensity: 0.75,  // strength of the reflections
    // Reflections come from a generated room environment. Without one, metal has
    // nothing to reflect and every metallic surface renders black -- which is
    // exactly why this is OFF here: with roughness and metalness both at 1 and no
    // environment, the car is lit only by the scene's three lights, giving a flat
    // grey body rather than a reflective one. Turn it on to get the metal look
    // back.
    environment: false,
    // Keep the model's original per-part colours instead of tinting everything
    // to `color`. Useful for checking part layout; off by default because the
    // artwork wants a single dark silhouette.
    keepOriginalMaterials: false,
  },

  camera: {
    start: {
      position: { x: -10.12, y: 28.9, z: -3.18 },
      // The target is the point the camera AIMS at. When `rotation` is 0/0/0 it
      // is exactly what the camera looks at; when rotation is non-zero the
      // target still supplies the base aim and rotation is layered on top.
      //
      // Here BOTH targets sit above their camera (start target y -8.235 vs
      // camera 28.9; end target y 8.09 vs camera 2.02), so the shot is an
      // upward-looking one throughout, with the rotation layer tilting each end.
      target:   { x: 0.29, y: -8.235, z: -1.45 },
      fov: 34.1,
      rotation: { x: 14.6, y: 2.1, z: -35.4 },
    },
    end: {
      position: { x: -4.91, y: 2.02, z: -3.18 },
      target:   { x: 0.29, y: 8.09, z: 0.29 },
      fov: 55,
      rotation: { x: -54.1, y: 2.1, z: -22.9 },
    },
    // ---- Trajectory ------------------------------------------------------
    // How the camera travels from start to end. The path is a CatmullRom
    // through start -> (arc control point) -> end; the control point is what
    // bends the flight, and each term below moves it independently.
    //
    //   trajectoryShape  sideways bow, in the horizontal plane
    //   trajectoryLift   vertical bow (positive = the path rises mid-flight)
    //   trajectoryArcPos where along the path the bow peaks.
    //                    0.5 = halfway (symmetric), lower = bends early.
    //   trajectoryOrbit  how far the camera swings AROUND the target line,
    //                    in degrees. 0 = no orbit; 360 = a full loop.
    //
    // The two bow terms carry trailing float noise (0.0800000000000001) because
    // they arrived from a dragged slider and are kept VERBATIM, not rounded --
    // the same reason f1.preset.json is pasted in as-is. Rounding here would put
    // this file and config.defaults.json a hair apart for no benefit.
    trajectoryShape: 0.0800000000000001,
    trajectoryLift: 0,
    trajectoryArcPos: 0.51,
    // The camera swings 102 deg -- a little over a quarter turn -- around the
    // travel axis as it descends, which with carLock at 1 is what reads as
    // orbiting the car rather than falling towards it. See the note in
    // trajectory.js on why the arc terms are independent of one another.
    trajectoryOrbit: 102,
    // The aim point gets its own bow and its own arc position, so the camera can
    // sweep across the car while the body flies a different line.
    //
    // INERT at the shipped carLock of 1: the lock replaces the whole aim curve.
    // These are the values to return to when dialling the lock down.
    trajectoryTargetShape: 0.0100000000000002,
    trajectoryTargetArcPos: 0.505,
    // Motion profile: how scroll progress maps onto distance along the path.
    // These are the strongest controls here -- they change the *feel* (a slow
    // start that rushes at the end, or a heavy settle) far more than the
    // geometry does.
    trajectoryEase: 'linear',
    trajectoryTargetEase: 'linear',
    // Arc-length resolution of the curves. Raise if a very curved path looks
    // faceted; it costs a little setup time on each rebuild.
    trajectoryArcDivisions: 80,

    // ---- Car lock (tracking) ---------------------------------------------
    // How much the camera locks onto the car, 0..1. The aim point is blended
    // from the target curve above toward the car's MEASURED world centre, so at 1
    // the camera stares at the car for the whole scroll while still flying the
    // start->end path -- the car stays centred and simply grows as the camera
    // closes in.
    //
    //   0   the aim travels the target curve, exactly as it always has
    //   1   the aim is the car's centre, every frame
    //   0.5 a proportional lock: the camera tracks the car loosely
    //
    // The same weight scales the authored start/end ROTATION layer by
    // (1 - carLock). That is not optional polish: at full lock a pure look-at is
    // the promise, and the authored pitch alone (14.6 -> -54.1 deg) would throw
    // the aim up to ~54 deg off the car even with the aim point perfectly
    // centred on it. Dutch tilt is NOT scaled -- it rolls about the view axis and
    // cannot move the aim.
    //
    // Consequences at 1, which is the SHIPPED value: both Target folders, `aim
    // sideways bow`, `aim bow peak at` and the start/end Rotation sliders all
    // stop having an effect, which is expected -- there is no authored aim left
    // to apply. Everything else, including the start/end POSITIONS,
    // trajectoryLift, trajectoryOrbit, both motion profiles and the fov ramp,
    // still drives the shot. Drag the slider toward 0 to bring the authored
    // framing back.
    //
    // The centre comes from src/car/ref.js, measured from the model's bounding
    // box on every transform change, so it follows positionX/Y/Z and the pivot
    // mode -- and differs per preset, because 'ground' lifts the centre half a
    // body above positionY while 'bbox' puts it exactly on it.
    carLock: 1,

    // 'XYZ' | 'YXZ' | 'ZXY' | 'XZY' | 'YZX' | 'ZYX'. YXZ is usually the kindest
    // for a camera (yaw, then pitch, then roll).
    rotationOrder: 'XYZ',
    dutchAngle: 15,          // degrees, ramped in across the whole scroll
    dutchStart: 0,           // scroll where the Dutch tilt begins
    dutchEnd:   1.0,         // scroll where the Dutch tilt is fully applied
  },

  airflow: {
    // ---- Field extents ---------------------------------------------------
    // lateralSpread is the half-width along Z, the axis the line grid sits on.
    // Kept wide relative to lineLength: the streamlines travel a long way
    // through the cross-section, and that ratio is what makes them read as long
    // parallel currents rather than a mesh.
    //
    // (There used to be a `visibleWidth` alongside this. Nothing ever read it --
    // it was documentation posing as a setting, and lateralSpread is the value
    // that actually controls the width. Removed rather than left as a slider
    // that does nothing.)
    lateralSpread: 24,

    // Each streamline's length and the cycle length used for recycling.
    //
    // WARNING -- cycleLength and flowSpeed are coupled, not independent.
    // A line's streamwise position is wrapped with
    // `mod(-t * flowSpeed * speed + phase, cycleLength)`, so the distance a line
    // jumps at the wrap point is flowSpeed * speed * dt. At the shipped values
    // that jump is far below a pixel. Raise flowSpeed alone and the wrap becomes
    // a visible teleport: at flowSpeed 10 with cycleLength 60, lines jump ~1 unit
    // per frame. Raise them together, e.g. flowSpeed 5 with cycleLength 180, if
    // faster flow is wanted.
    lineLength: 30,
    cycleLength: 60,

    // ---- Density ---------------------------------------------------------
    // Several identical "sheets" stacked at different heights. The sheets are
    // what create the optical interference (moire) in the album artwork: line
    // families at different depths that cross under projection.
    //
    //   total instances = countLines * sheetCount     (550 * 3 = 1650)
    //
    // Denser and finer than earlier revisions -- a hairline field, which is what
    // the album artwork actually looks like. sheetSpread is 0, so the sheets sit
    // at the same height and interfere purely through phase: the moire comes from
    // sheetPhaseJitter alone rather than from vertical separation. Raising
    // sheetSpread would pull them apart into distinguishable layers.
    countLines: 550,         // streamlines per sheet
    sheetCount: 3,           // parallel sheets
    sheetSpread: 0,          // vertical distance between sheets, world units
    sheetPhaseJitter: 0.57,  // phase offset between sheets, in cycle fractions

    // ---- Flow ------------------------------------------------------------
    flowSpeed: 1.7,
    microOscillation: 0.02,
    lineThickness: 2.66,     // pixels
    opacity: 0.36,
    // Added to the flow clock in the shader, so the field is already developed
    // on the first frame rather than visibly "starting". See the note in
    // airflow/field.js step 1. One full cycle is (timeSeed * flowSpeed) units of
    // travel. At 60 s the field has run ~102 units -- many cycles, so the
    // per-line speed variation has fully separated the lines and the load frame
    // is indistinguishable from a frame taken minutes in.
    timeSeed: 60,
    // Overlapping lines must ADD, not fight; plain alpha blending turns an
    // overlapping field into flat mush. Low opacity depends on this: 1650
    // additive hairlines accumulate into a bright field at 0.36 alpha each,
    // whereas the same lines under normal blending would just be dim.
    additive: true,

    // ---- Depth reveal: the sudden 2D -> 3D transition --------------------
    // MUST differ: equal values divide by zero (see safeStep in field.js).
    // Sheets fan apart across this window and the vertical spread opens up.
    //
    // verticalSpread is THE control for how three-dimensional the field reads:
    // how far the lines fan apart vertically once lifted. At 0 the field stays
    // a perfectly flat sheet no matter what the reveal ramp does. It is
    // multiplied by the reveal, so the flat poster state is unaffected.
    verticalSpread: 2.25,    // world units of vertical fan when fully revealed
    depthStart: 0.72,
    depthEnd:   0.90,
    depthSharpness: 2.0,

    // ---- Splay: how the field deforms around the car ---------------------
    // Lines are displaced as they pass the body, producing the bunching, the
    // void around the car, and the fan-and-reconverge in the wake.
    // Direction comes from each line's own sign, so streamlines never cross.
    //
    // influenceSplay is the pure sideways push. At 0 all of the deformation comes
    // from the depth splay plus the body corridor, so lines hold their lateral
    // position and part around the car in depth instead, which is calmer. Raising
    // it moves lines sideways around the body as well, which is what produces the
    // visible bowing either side of the car.
    influenceSplay:    0.42,
    influenceLateral:  6.03,
    influenceUpstream: 2.76,
    influenceWake:     1.66,

    // ---- Where the field reacts relative to the car body -----------------
    // The point the deformation is centred on, and the radius of the ellipsoid
    // around it. Both are STYLING constants that shape the artwork, NOT
    // measurements of the model -- but with autoCenter on, the car now sits at
    // `car.position*`, so keeping carCenter near that point is what makes the
    // deformation land on the body instead of beside it.
    //
    // Measured world half-extents of the GLB at scale 0.605 with the shipped
    // rotation (from scripts/inspect-glb.py, and confirmed in-browser):
    //
    //     half-length (X) 3.69   half-height (Y) 0.86   half-WIDTH (Z) 1.58
    //
    // All six components are read by the vertex shader. carCenter is turned into
    // a CAR-RELATIVE coordinate: zN and xN are measured from the centre rather
    // than from the world origin, so the influence follows the car wherever it is
    // placed. carHalf sets the reach in each axis.
    //
    // A wider ellipsoid than the purely graphic one: carHalf.z 0.62 makes the
    // body corridor 0.65 units wide rather than 0.32, so the void around the car
    // reads as the car's own width instead of a thin line through it.
    carCenter: { x: 1.29, y: 0, z: 0 },
    carHalf:   { x: 2.43, y: 1.96, z: 0.62 },

    // ---- Focal red band --------------------------------------------------
    // The album has one bold saturated streak through the composition. Lines
    // whose flat lateral position is near the centreline become that band.
    bandWidth: 1.2,         // |laneZ| below this is band, world units
    bandStrength: 1.0,
    // Share of the remaining lines that lean violet instead of pale lavender,
    // for tonal variety. Deterministic per line, not random per frame.
    violetMix: 0.92,

    // ---- Ground ----------------------------------------------------------
    // No line is ever allowed below groundY. The vertical fan (verticalSpread),
    // the depth splay, the wake's vertical recovery, the turbulence and the
    // vortex can all push lines downward, and without a floor they drive under
    // the ground and out of frame. The ground sits at 0, matching the grid
    // helper in scene/scene.js.
    groundY: 0.0,
    // How hard that limit holds.
    //   1.0  lines are held flat on the ground and pack into a layer there
    //   0.0  off -- lines pass straight through
    groundClamp: 1.0,
    // Height of a compression band just ABOVE the floor, in world units. Lines
    // entering it are pulled down and held, producing the flat packed layer the
    // reference artwork has along its lower edge. Without it the limit is a hard
    // cut where lines simply stop, with nothing to show the floor is there.
    //
    // At 1.4 this band is a large fraction of the field's height, so a wide
    // margin of the lower frame is flattened onto the floor.
    groundSoftness: 1.4,

    // ---- Turbulence (Act 4) ---------------------------------------------
    // !! THIS RAMP IS INVERTED !!
    // turbEnd (0.815) is BELOW turbStart (0.85), and smoothstep with edge0 >
    // edge1 descends instead of rising. With these values turbulence is at FULL
    // strength from scroll 0 all the way to 0.815, then drops to zero by 0.85.
    // It is backwards from an "Act 4 disturbance".
    //
    // To make it ramp IN instead, swap the edges, e.g. turbStart 0.6 -> turbEnd 0.9.
    turbStart: 0.85,
    turbEnd:   0.815,
    turbStrength: 0.15,
    // How much of the turbulence is vertical vs sideways, as a share of
    // turbStrength. Raising turbLateral alone gives a shimmy along the field,
    // raising turbVertical alone gives a choppy surface.
    turbVertical: 1.27,
    turbLateral: 0.62,
    // Spatial frequency of the noise along each line. Low = long lazy waves,
    // high = tight chop. These are what the eye actually reads as "turbulent".
    // Past ~5 the waves become finer than the line spacing and read as noise
    // rather than as shape.
    turbFreqX: 5.6,         // primary wave frequency along the line
    turbFreqX2: 0.75,       // secondary frequency, multiplied against the first
    turbFreqZ: 3.95,
    turbFreqZ2: 4.5,
    // How fast the noise pattern itself travels, independent of flowSpeed. At 0
    // the lines move through a frozen wave pattern.
    turbSpeed: 3.85,
    // Per-line phase spread. 0 makes every line wobble in lockstep (reads as a
    // single moving sheet); higher values break the lines up individually. At 3
    // the lines are fully decorrelated from each other.
    turbPhaseSpread: 3,
    // How strongly turbulence is concentrated where the flow is already
    // disturbed, vs applied uniformly across the field.
    //   1.0  only near the car and in the wake (calm field elsewhere)
    //   0.0  everywhere equally
    turbLocalise: 0.8,
    // Share of the wake zone that counts as turbulent (the wakeMix weight).
    turbWakeMix: 0.27,

    // ---- Vortex (Act 5) --------------------------------------------------
    // The ramp now RISES: vortexStart 0.13 is below vortexEnd 1, so the vortex
    // fades in from scroll 0.13 and is fully on by the end -- the fixed version
    // of the inverted ramp described in earlier revisions.
    //
    // Still invisible here: vortexSpin, vortexTwist and vortexRadiusGain are all
    // 0, which reduces the twist maths to a no-op. Raise any of the three to give
    // it something to do.
    vortexStart: 0.13,
    vortexEnd:   1,
    vortexSpin:  0.0,
    vortexTwist: 0.0,
    vortexCoreY: -5.0,
    vortexCoreZ: 1.99,
    // How much the spiral widens with distance behind the car. 0 keeps the vortex
    // a constant-radius tube.
    vortexRadiusGain: 0.0,

    // ---- Wake (behind the car) -------------------------------------------
    // What gives the field its "something passed through here" trail. Tunable
    // individually rather than only through the single influenceWake reach.
    // How much of the streamwise profile survives into the wake, vs ahead of the
    // nose. 1.0 makes the wake as strong as the leading edge.
    influenceBackFactor: 0.85,
    // Where the wake starts, as a distance behind the car's rear. 0 starts it
    // exactly at the rear axle line.
    wakeStartOffset: 0.0,
    // How far the wake extends before it has fully decayed.
    wakeLength: 7.0,
    // Sideways spread applied through the wake.
    wakeLateral: 0.31,
    // How much the wake amplifies the sideways spread where the flow is already
    // splayed (the (1 + splay) term). Above 1 the wake spreads faster than the
    // body does.
    wakeLateralGain: 2.03,
    // Vertical recovery in the wake: lines are pulled back toward this lane
    // height as the flow settles.
    wakeLiftTarget: 0.25,
    // Strength of that vertical pull.
    wakeLift: 0.30,
  },
}