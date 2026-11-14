/**
 * Landmark material (docs/05 §7).
 *
 * The city bakes every footprint as an anonymous prism, so nothing in it reads as a landmark. This
 * shades a small set of real Melbourne landmarks as hero masses: a lifted violet body with a vertical
 * gradient that brightens toward the top.
 *
 * TWO KINDS IN ONE DRAW CALL (docs/05 §6.2's pattern, reused)
 * The layer's vertices carry a baked `aKind` flag - 0.0 for a real footprint mass, 1.0 for the one
 * PROCEDURAL landmark, the Arts Centre spire (docs/05 §7.1). The masses keep the shader they always
 * had. The spire takes a different branch: an open lattice of ribs, rings and diamond web, with a
 * dense net in its flared skirt, cut out with `discard`, and a colour that changes along the
 * structure AND over `u_progress` - the real spire is famous for its light shows, and a light that
 * travels up it is the honest reading of "changing colours" for a building whose illumination is
 * its identity.
 *
 * NO LIGHTING OBJECT (docs/05 §2). The gradient is `smoothstep` on world Y and the emission is
 * arithmetic, not a light. Body colours are `mix(void, violet, lift)` - two §1 palette entries - and
 * the spire lights in the palette's Amber and Yellow-White, so §1's "do not invent new colors" is not
 * touched by this layer, unlike the ground (docs/05 §6.1).
 *
 * `depthWrite: true` here, unlike the ground: a landmark is a SOLID mass and must occlude what is behind
 * it. `transparent: true` only so the layer can take part in the same progress fade as everything else.
 * `side: DoubleSide` is required by the spire and harmless for the masses: a closed prism's back faces
 * are depth-rejected anyway, and the spire's open surface needs both sides or it reads as a shell.
 */
import * as THREE from 'three';

/**
 * @param {typeof import('../config.js').config} config the live singleton
 * @returns {{ material: THREE.ShaderMaterial, uniforms: Record<string, THREE.IUniform>,
 *            sync: (next: typeof config) => void, setFade: (value: number) => void,
 *            setProgress: (value: number) => void }}
 */
export function createLandmarkMaterial(config) {
  const uniforms = {
    u_baseColour: { value: new THREE.Color(config.landmarks.baseColor) },
    u_liftColour: { value: new THREE.Color(config.landmarks.liftColor) },
    u_crownColour: { value: new THREE.Color(config.landmarks.crownColor) },
    u_lift: { value: config.landmarks.lift },
    u_crownMix: { value: config.landmarks.crownMix },
    u_crownHeight: { value: config.landmarks.crownHeight },
    u_wallGain: { value: config.landmarks.wallGain },
    u_roofGain: { value: config.landmarks.roofGain },
    // docs/05 §7.1 - the procedural spire.
    u_spireAxis: { value: new THREE.Vector2(0, 0) },
    u_spireBaseY: { value: 15 },
    u_spireTipY: { value: 162 },
    u_spireColourLow: { value: new THREE.Color(config.landmarks.spire.lowColor) },
    u_spireColourHigh: { value: new THREE.Color(config.landmarks.spire.highColor) },
    u_spireWaveColour: { value: new THREE.Color(config.landmarks.spire.waveColor) },
    u_spireGain: { value: config.landmarks.spire.gain },
    u_spireRibs: { value: config.landmarks.spire.ribs },
    u_spireRibWidth: { value: config.landmarks.spire.ribWidth },
    u_spireDiamondPitch: { value: config.landmarks.spire.diamondPitch },
    u_spireDiamondWidth: { value: config.landmarks.spire.diamondWidth },
    u_spireRingPitch: { value: config.landmarks.spire.ringPitch },
    u_spireRingWidth: { value: config.landmarks.spire.ringWidth },
    u_spireNetPitch: { value: config.landmarks.spire.netPitch },
    u_spireNetWidth: { value: config.landmarks.spire.netWidth },
    u_spireNetEnd: { value: config.landmarks.spire.netEnd },
    u_spireWaveCycles: { value: config.landmarks.spire.waveCycles },
    u_spireWaveSpeed: { value: config.landmarks.spire.waveSpeed },
    u_spireWaveWidth: { value: config.landmarks.spire.waveWidth },
    u_spireWaveGain: { value: config.landmarks.spire.waveGain },
    u_spireGradient: { value: config.landmarks.spire.gradient },
    u_progress: { value: 0 },
    u_fade: { value: 1 }
  };

  const material = new THREE.ShaderMaterial({
    name: 'Landmarks',
    uniforms,
    transparent: true,
    blending: THREE.NormalBlending,
    depthWrite: true,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float aKind;

      varying vec3 vWorld;
      varying float vKind;

      void main() {
        vKind = aKind;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 u_baseColour;
      uniform vec3 u_liftColour;
      uniform vec3 u_crownColour;
      uniform float u_lift;
      uniform float u_crownMix;
      uniform float u_crownHeight;
      uniform float u_wallGain;
      uniform float u_roofGain;
      uniform vec2 u_spireAxis;
      uniform float u_spireBaseY;
      uniform float u_spireTipY;
      uniform vec3 u_spireColourLow;
      uniform vec3 u_spireColourHigh;
      uniform vec3 u_spireWaveColour;
      uniform float u_spireGain;
      uniform float u_spireRibs;
      uniform float u_spireRibWidth;
      uniform float u_spireDiamondPitch;
      uniform float u_spireDiamondWidth;
      uniform float u_spireRingPitch;
      uniform float u_spireRingWidth;
      uniform float u_spireNetPitch;
      uniform float u_spireNetWidth;
      uniform float u_spireNetEnd;
      uniform float u_spireWaveCycles;
      uniform float u_spireWaveSpeed;
      uniform float u_spireWaveWidth;
      uniform float u_spireWaveGain;
      uniform float u_spireGradient;
      uniform float u_progress;
      uniform float u_fade;

      varying vec3 vWorld;
      varying float vKind;

      const float TAU = 6.28318530717958647692;

      void main() {
        // Aerial falloff, so the far landmarks settle into the city instead of floating over it. The
        // distance is the same term for both kinds.
        float haze = 1.0 - smoothstep(1200.0, 5200.0, length(cameraPosition - vWorld));
        float air = mix(0.45, 1.0, haze);

        if (vKind > 0.5) {
          // ---- the procedural spire: an open lattice with a light show on it (docs/05 §7.1) ----
          float span = max(u_spireTipY - u_spireBaseY, 1.0);
          float rise = clamp((vWorld.y - u_spireBaseY) / span, 0.0, 1.0);

          vec2 radial = vWorld.xz - u_spireAxis;
          float radius = max(length(radial), 0.05);
          float angle = atan(radial.x, radial.y);
          float around = angle / TAU + 0.5;
          float arc = around * TAU * radius;

          // EVERY MASK LIVES IN ITS OWN CELL SPACE, AND THE ANTI-ALIASING IS BOUNDED.
          // The first version of this measured a member's distance in METRES and its anti-aliasing
          // width from the screen-space derivative of that distance. That is wrong for a thin
          // structure, and looking at the render is what showed it: on a mast a few pixels wide the
          // derivative of an arc length is huge, so the "one pixel" widening swallowed the whole cell
          // and the open cage came out as a solid funnel. In cell space the fractional part IS the
          // cell, the derivative is cells per pixel, and clamping the softening to a fraction of one
          // cell keeps the metal fraction honest at any distance: close up you see members, far away
          // you see the coverage those members actually have.
          float ribCell = around * max(u_spireRibs, 1.0);
          float ribF = abs(fract(ribCell) - 0.5) * 2.0;
          float ribHalf = clamp(u_spireRibWidth / max(arc / max(u_spireRibs, 1.0), 1e-3), 0.02, 0.35);
          float ribAa = clamp(fwidth(ribCell) * 0.75, 0.0, 0.3);
          float ribMask = 1.0 - smoothstep(ribHalf, ribHalf + ribAa + 0.01, ribF);

          // The diamond web: two crossing families in (arc, height) space, so the cells are diamond
          // shaped and the pitch is a physical size on the structure.
          float dCell = (arc + vWorld.y) / max(u_spireDiamondPitch, 0.2);
          float dF = abs(fract(dCell) - 0.5) * 2.0;
          float eCell = (arc - vWorld.y) / max(u_spireDiamondPitch, 0.2);
          float eF = abs(fract(eCell) - 0.5) * 2.0;
          float webHalf = clamp(u_spireDiamondWidth / max(u_spireDiamondPitch, 0.2), 0.02, 0.35);
          float webAa = clamp(max(fwidth(dCell), fwidth(eCell)) * 0.75, 0.0, 0.3);
          float webMask = max(1.0 - smoothstep(webHalf, webHalf + webAa + 0.01, dF),
                              1.0 - smoothstep(webHalf, webHalf + webAa + 0.01, eF));

          // Horizontal rings.
          float rCell = vWorld.y / max(u_spireRingPitch, 0.5);
          float rF = abs(fract(rCell) - 0.5) * 2.0;
          float ringHalf = clamp(u_spireRingWidth / max(u_spireRingPitch, 0.5), 0.02, 0.35);
          float ringAa = clamp(fwidth(rCell) * 0.75, 0.0, 0.3);
          float ringMask = 1.0 - smoothstep(ringHalf, ringHalf + ringAa + 0.01, rF);

          // The skirt's dense net: fine enough to read as a membrane at distance and as a mesh up
          // close, which is what the real gold net does over the Theatres Building roof. Its own cell
          // is small, so its members are proportionally wider - which is exactly how a net reads.
          float netFade = 1.0 - smoothstep(u_spireNetEnd * 0.5, u_spireNetEnd, rise);
          float nCell = (arc + vWorld.y) / max(u_spireNetPitch, 0.15);
          float nF = abs(fract(nCell) - 0.5) * 2.0;
          float mCell = (arc - vWorld.y) / max(u_spireNetPitch, 0.15);
          float mF = abs(fract(mCell) - 0.5) * 2.0;
          float netHalf = clamp(u_spireNetWidth / max(u_spireNetPitch, 0.15), 0.02, 0.45);
          float netAa = clamp(max(fwidth(nCell), fwidth(mCell)) * 0.75, 0.0, 0.4);
          float netMask = max(1.0 - smoothstep(netHalf, netHalf + netAa + 0.01, nF),
                              1.0 - smoothstep(netHalf, netHalf + netAa + 0.01, mF)) * netFade;

          float member = max(max(ribMask, webMask), ringMask);
          float lattice = max(member, netMask * 0.85);
          // CUTOUT, not alpha: the spire is an open steel structure, and a discarded fragment writes
          // no depth either, so the far side of the cage stays visible through the near side's holes.
          if (lattice < 0.5) discard;

          // Colour 1: a static gradient along the structure. The real spire is a whitish steel cage
          // whose skirt carries the lamps, so the skirt takes the palette's Amber, the mast runs to
          // its Yellow-White, and the change between them happens over the flared section.
          vec3 colour = mix(u_spireColourLow, u_spireColourHigh,
                            smoothstep(0.0, max(u_spireGradient, 0.01), rise));
          // The net is the lamplit surface, so it stays on the skirt's own warm colour while the
          // structure above it whitens.
          colour = mix(colour, u_spireColourLow, netMask * 0.4);
          // Ribs and rings are the structure, and structure catches more light than the web.
          colour *= mix(0.8, 1.2, max(ribMask, ringMask));

          // Colour 2: the light show. A band of the palette's Signature Violet travels UP the spire as
          // u_progress advances - a pure function of progress (docs/03 section 1), no clock, so the
          // same scroll position paints the same frame on every machine and in every capture.
          float wave = fract(rise * max(u_spireWaveCycles, 0.001) - u_progress * u_spireWaveSpeed);
          float waveLit = 1.0 - smoothstep(0.0, max(u_spireWaveWidth, 0.001), min(wave, 1.0 - wave));
          colour = mix(colour, u_spireWaveColour, clamp(waveLit * u_spireWaveGain, 0.0, 1.0));

          // The lattice is emissive: it is lit from inside by its own lamps, so it brightens the
          // distant frame rather than sitting in it as a dark silhouette.
          colour *= u_spireGain * air;
          gl_FragColor = vec4(colour, u_fade);
          #include <colorspace_fragment>
          return;
        }

        // ---- a real footprint mass ----
        vec3 body = mix(u_baseColour, u_liftColour, u_lift);

        // The vertical gradient: absolute world height, so a tall landmark brightens along its own
        // length and its tip is the brightest point in the layer. Deliberately NOT normalised per
        // building - that would need a per-vertex height attribute, and the absolute form already reads
        // correctly because the landmarks are all standing on the same ground plane.
        float rise = smoothstep(0.0, u_crownHeight, vWorld.y);
        vec3 colour = mix(body, u_crownColour, rise * u_crownMix);

        // FACE SHADING, recovered from screen-space derivatives exactly as the city's night look does:
        // the payload ships no normals. Without this a wide, low landmark (the museum, an arena) renders
        // as a flat violet slab, because its roof fills the frame and nothing distinguishes it from its
        // walls. Walls and roofs take different gains, which is what gives the mass its form.
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        float wall = 1.0 - smoothstep(0.35, 0.70, abs(n.y));
        colour *= mix(u_roofGain, u_wallGain, wall) * air;

        gl_FragColor = vec4(colour, u_fade);
        #include <colorspace_fragment>
        return;
      }
    `
  });

  const applied = {
    baseColor: '',
    liftColor: '',
    crownColor: '',
    lift: Number.NaN,
    crownMix: Number.NaN,
    crownHeight: Number.NaN,
    wallGain: Number.NaN,
    roofGain: Number.NaN,
    spireAxis: '',
    spireBaseY: Number.NaN,
    spireTipY: Number.NaN,
    spireLowColor: '',
    spireHighColor: '',
    spireWaveColor: '',
    spire: {}
  };

  /**
   * @param {typeof config} next
   */
  function sync(next) {
    const l = next.landmarks;
    if (applied.baseColor !== l.baseColor) {
      uniforms.u_baseColour.value.set(l.baseColor);
      applied.baseColor = l.baseColor;
    }
    if (applied.liftColor !== l.liftColor) {
      uniforms.u_liftColour.value.set(l.liftColor);
      applied.liftColor = l.liftColor;
    }
    if (applied.crownColor !== l.crownColor) {
      uniforms.u_crownColour.value.set(l.crownColor);
      applied.crownColor = l.crownColor;
    }
    if (applied.lift !== l.lift) {
      uniforms.u_lift.value = l.lift;
      applied.lift = l.lift;
    }
    if (applied.crownMix !== l.crownMix) {
      uniforms.u_crownMix.value = l.crownMix;
      applied.crownMix = l.crownMix;
    }
    if (applied.crownHeight !== l.crownHeight) {
      // Guarded: a zero would make smoothstep degenerate and flatten the whole gradient.
      uniforms.u_crownHeight.value = Math.max(l.crownHeight, 1);
      applied.crownHeight = l.crownHeight;
    }
    if (applied.wallGain !== l.wallGain) {
      uniforms.u_wallGain.value = l.wallGain;
      applied.wallGain = l.wallGain;
    }
    if (applied.roofGain !== l.roofGain) {
      uniforms.u_roofGain.value = l.roofGain;
      applied.roofGain = l.roofGain;
    }

    const s = l.spire;
    if (applied.spireLowColor !== s.lowColor) {
      uniforms.u_spireColourLow.value.set(s.lowColor);
      applied.spireLowColor = s.lowColor;
    }
    if (applied.spireHighColor !== s.highColor) {
      uniforms.u_spireColourHigh.value.set(s.highColor);
      applied.spireHighColor = s.highColor;
    }
    if (applied.spireWaveColor !== s.waveColor) {
      uniforms.u_spireWaveColour.value.set(s.waveColor);
      applied.spireWaveColor = s.waveColor;
    }
    // Every remaining spire value is a plain scalar, and each is bounded so the shader can never be
    // handed a zero where it divides (pitch, cycles, gradient) or a width it cannot resolve.
    const bounds = {
      gain: [0, 4],
      ribs: [3, 64],
      ribWidth: [0, 2],
      diamondPitch: [0.2, 12],
      diamondWidth: [0, 1],
      ringPitch: [0.5, 24],
      ringWidth: [0, 1],
      netPitch: [0.15, 3],
      netWidth: [0, 0.6],
      netEnd: [0, 1],
      waveCycles: [0.25, 12],
      waveSpeed: [0, 8],
      waveWidth: [0.01, 0.6],
      waveGain: [0, 1],
      gradient: [0.05, 1.5]
    };
    for (const [key, [lo, hi]] of Object.entries(bounds)) {
      if (applied.spire[key] === s[key]) continue;
      uniforms[`u_spire${key[0].toUpperCase()}${key.slice(1)}`].value = Math.min(Math.max(s[key], lo), hi);
      applied.spire[key] = s[key];
    }
  }

  /**
   * Where the spire stands, in world xz. Read from the generated module rather than written here:
   * the axis is a bake output (docs/02 §1 - the runtime does no projection of its own).
   *
   * @param {number} x
   * @param {number} z
   */
  function setSpireAxis(x, z) {
    uniforms.u_spireAxis.value.set(x, z);
  }

  /**
   * @param {number} baseY
   * @param {number} tipY
   */
  function setSpireSpan(baseY, tipY) {
    uniforms.u_spireBaseY.value = baseY;
    uniforms.u_spireTipY.value = Math.max(tipY, baseY + 1);
  }

  /**
   * @param {number} value
   */
  function setFade(value) {
    uniforms.u_fade.value = value;
    material.opacity = value;
  }

  /**
   * The light show's clock: `u_progress` and nothing else (docs/03 §1).
   *
   * @param {number} value 0..1
   */
  function setProgress(value) {
    uniforms.u_progress.value = value;
  }

  return { material, uniforms, sync, setFade, setProgress, setSpireAxis, setSpireSpan };
}
