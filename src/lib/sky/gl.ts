/**
 * A small WebGL2 copy of XNA's SpriteBatch, enough to draw the menu sky the way the game does:
 * textures are premultiplied, drawn with premultiplied "over" blending (BlendState.AlphaBlend)
 * and point sampling (SamplerState.PointClamp), each multiplied by a byte colour.
 *
 * Two of the game's pixel shaders (from Content/PixelShader.xnb, translated with MojoShader)
 * come along: "HorizonClouds", which lights the edges of clouds facing the sun or moon, and
 * "LensFlare", which dims the flare by how much of the sun is covered.
 */
import type { RGB, RGBA } from './clock';

export type Color = RGB | RGBA;

export interface Texture {
	tex: WebGLTexture;
	width: number;
	height: number;
	/** Already premultiplied (a render target), so the shader mustn't premultiply it again. */
	premultiplied?: boolean;
}

export interface Target extends Texture {
	fb: WebGLFramebuffer;
}

const VERTEX = `#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUV;
layout(location = 2) in vec4 aColor;
layout(location = 3) in vec2 aDrawPos;
uniform vec2 uSize;
uniform float uFlipY;
out vec2 vUV;
out vec4 vColor;
out vec2 vPos;
out vec2 vDrawPos;
void main() {
	vec2 clip = aPos / uSize * 2.0 - 1.0;
	gl_Position = vec4(clip.x, -clip.y * uFlipY, 0.0, 1.0);
	vUV = aUV;
	vColor = aColor;
	vPos = aPos;
	vDrawPos = aDrawPos;
}`;

/** Every sprite: texture times colour. Textures are stored straight and premultiplied here. */
const SPRITE = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform bool uPremultiplied;
in vec2 vUV;
in vec4 vColor;
out vec4 outColor;
vec4 sampleTex(vec2 uv) {
	vec4 t = texture(uTex, uv);
	if (!uPremultiplied) t.rgb *= t.a;
	return t;
}
void main() {
	outColor = sampleTex(vUV) * vColor;
}`;

/**
 * PixelShader.xnb, pass "HorizonClouds" (MojoShader's GLSL output, kept instruction for
 * instruction). ps_c0 = uColor (the sun or moon's light), ps_c1 = uDrawPosition (the cloud's
 * centre), ps_c2 = uShaderSpecificData (sun x, sun y, intensity), t1 = the pixel's screen position.
 */
const CLOUDS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec3 uColor;
uniform vec4 uData;
in vec2 vUV;
in vec4 vColor;
in vec2 vPos;
in vec2 vDrawPos;
out vec4 outColor;
const float FLT_MAX = 1e38;
const vec4 ps_c3 = vec4(0.0, 0.02, 1.0, 0.300000011);
const vec4 ps_c4 = vec4(0.000555555, 1.299999949, 2.0, -1.0);
const vec4 ps_c5 = vec4(0.016666667, 0.0, -0.035, -0.620000005);
const vec4 ps_c6 = vec4(0.0, 0.14, -0.035, 4.0);
const vec4 ps_c7 = vec4(0.035, 0.0, 0.200000002, 1.0);
const vec4 ps_c8 = vec4(0.600000023, -0.05, 0.5, 0.0);
vec4 tex(vec2 uv) {
	vec4 t = texture(uTex, uv);
	t.rgb *= t.a;
	return t;
}
void main() {
	vec4 ps_c0 = vec4(uColor, 0.0);
	vec4 ps_c1 = vec4(vDrawPos, 0.0, 0.0);
	vec4 ps_c2 = uData;
	vec4 ps_v0 = vColor;
	vec4 ps_t0 = vec4(vUV, 0.0, 0.0);
	vec4 ps_t1 = vec4(vPos, 0.0, 0.0);
	vec4 ps_r0, ps_r1, ps_r2, ps_r3, ps_r4;
	ps_r0.xy = ps_t0.xy + ps_c5.yz;
	ps_r1.xy = ps_t0.xy + ps_c6.xy;
	ps_r2.xy = ps_t0.xy + ps_c6.zx;
	ps_r3.xy = ps_t0.xy + ps_c7.xy;
	ps_r0 = tex(ps_r0.xy);
	ps_r1 = tex(ps_r1.xy);
	ps_r2 = tex(ps_r2.xy);
	ps_r3 = tex(ps_r3.xy);
	ps_r4 = tex(ps_t0.xy);
	ps_r0.x = ps_r0.w + ps_r1.w;
	ps_r0.x = ps_r2.w + ps_r0.x;
	ps_r0.x = ps_r3.w + ps_r0.x;
	ps_r0.x = ps_r4.w + ps_r0.x;
	ps_r0.x = (ps_r0.x * -ps_c7.z) + ps_c7.w;
	ps_r0.y = ps_r4.x + ps_c5.w;
	ps_r0.y = clamp(ps_r0.y * ps_c6.w, 0.0, 1.0);
	ps_r0.y = -ps_r0.y + ps_c3.z;
	ps_r1.x = max(ps_r0.y, ps_r0.x);
	ps_r0.xy = ps_t1.xy + -ps_c1.xy;
	ps_r0.z = dot(ps_r0.xy, ps_r0.xy) + ps_c3.x;
	ps_r0.z = ((ps_r0.z == 0.0) ? FLT_MAX : inversesqrt(abs(ps_r0.z)));
	ps_r0.xy = ps_r0.xy * ps_r0.zz;
	ps_r2.xy = -ps_t1.xy + ps_c2.xy;
	ps_r0.z = dot(ps_r2.xy, ps_r2.xy) + ps_c3.x;
	ps_r0.z = ((ps_r0.z == 0.0) ? FLT_MAX : inversesqrt(abs(ps_r0.z)));
	ps_r2.xy = ps_r2.xy * ps_r0.zz;
	ps_r0.z = ((ps_r0.z == 0.0) ? FLT_MAX : 1.0 / ps_r0.z);
	ps_r0.x = dot(ps_r0.xy, ps_r2.xy) + ps_c3.x;
	ps_r0.y = ps_r0.z * ps_c5.x;
	ps_r0.y = (ps_r0.y * -ps_r0.y) + ps_c3.z;
	ps_r1.y = max(ps_r0.x, ps_r0.y);
	ps_r0.xy = (ps_t0.xy * ps_c4.zz) + ps_c4.ww;
	ps_r0.x = dot(ps_r0.xy, ps_r0.xy) + ps_c3.x;
	ps_r0.x = ((ps_r0.x == 0.0) ? FLT_MAX : inversesqrt(abs(ps_r0.x)));
	ps_r0.x = ((ps_r0.x == 0.0) ? FLT_MAX : 1.0 / ps_r0.x);
	ps_r0.y = (ps_r1.y * ps_r0.x) + -ps_c3.w;
	ps_r0.x = clamp((ps_r1.y * ps_r0.x) + ps_c8.y, 0.0, 1.0);
	ps_r0.y = (ps_r1.x * ps_c8.x) + ps_r0.y;
	ps_r0.w = (ps_r0.z * -ps_c3.y) + ps_c3.z;
	ps_r0.z = (ps_r0.z * -ps_c4.x) + ps_c4.y;
	ps_r1.y = max(ps_c3.w, ps_r0.z);
	ps_r0.z = ((ps_r0.w >= 0.0) ? -ps_r0.w : -ps_c3.x);
	ps_r0.y = ps_r0.y + ps_r0.z;
	ps_r0.x = (ps_r0.x * ps_r1.x) + ps_r0.y;
	ps_r0.x = ps_r0.x * ps_c2.z;
	ps_r0.y = ps_r1.y * ps_r1.y;
	ps_r0.y = ps_r1.y * ps_r0.y;
	ps_r0.x = clamp(ps_r0.x * ps_r0.y, 0.0, 1.0);
	ps_r1.xyz = -ps_v0.xyz + ps_c0.xyz;
	ps_r1.w = -ps_v0.w + ps_c3.z;
	ps_r1 = (ps_r1 * ps_c8.zzzz) + ps_v0;
	ps_r1 = ps_r4.wwww * ps_r1;
	ps_r2 = ps_r4 * ps_v0;
	ps_r1 = (ps_r1 * ps_v0.wwww) + -ps_r2;
	ps_r0 = (ps_r0.xxxx * ps_r1) + ps_r2;
	outColor = ps_r0;
}`;

/**
 * PixelShader.xnb, pass "LensFlare": texture times colour times the sun's visibility, which is
 * HorizonHelper's 1x1 average of how uncovered the area around the sun is (here the smallest
 * mip level of a 64x64 copy of it).
 */
const LENS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform sampler2D uVisibility;
in vec2 vUV;
in vec4 vColor;
out vec4 outColor;
void main() {
	vec4 t = texture(uTex, vUV);
	t.rgb *= t.a;
	float covered = textureLod(uVisibility, vec2(0.5), 6.0).a;
	outColor = t * vColor * (1.0 - covered);
}`;

const FLOATS_PER_VERTEX = 7; // x, y, u, v, colour (4 bytes packed), drawX, drawY
const MAX_SPRITES = 2048;

type ProgramName = 'sprite' | 'clouds' | 'lens';

export class SpriteRenderer {
	readonly gl: WebGL2RenderingContext;
	#programs: Record<ProgramName, WebGLProgram>;
	#uniforms = new Map<WebGLProgram, Record<string, WebGLUniformLocation | null>>();
	#buffer: WebGLBuffer;
	#data = new ArrayBuffer(MAX_SPRITES * 4 * FLOATS_PER_VERTEX * 4);
	#f32 = new Float32Array(this.#data);
	#u8 = new Uint8Array(this.#data);
	#count = 0;
	#texture: Texture | null = null;
	#program: ProgramName = 'sprite';
	#target: { width: number; height: number; flip: number } = { width: 1, height: 1, flip: 1 };
	/** Per-program uniforms set before drawing (clouds: light colour and data; lens: visibility). */
	cloudColor: RGB = [255, 255, 255];
	cloudData: [number, number, number, number] = [0, 0, 0, 0];
	visibility: Texture | null = null;

	constructor(gl: WebGL2RenderingContext) {
		this.gl = gl;
		this.#programs = {
			sprite: this.#compile(SPRITE),
			clouds: this.#compile(CLOUDS),
			lens: this.#compile(LENS)
		};
		this.#buffer = gl.createBuffer()!;
		const vao = gl.createVertexArray();
		gl.bindVertexArray(vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffer);
		gl.bufferData(gl.ARRAY_BUFFER, this.#data.byteLength, gl.DYNAMIC_DRAW);
		const stride = FLOATS_PER_VERTEX * 4;
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
		gl.enableVertexAttribArray(2);
		gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, stride, 16);
		gl.enableVertexAttribArray(3);
		gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 20);
		// Two triangles per sprite.
		const indices = new Uint16Array(MAX_SPRITES * 6);
		for (let i = 0; i < MAX_SPRITES; i++) {
			indices.set(
				[0, 1, 2, 2, 1, 3].map((n) => n + i * 4),
				i * 6
			);
		}
		const ib = gl.createBuffer();
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
	}

	#compile(fragment: string): WebGLProgram {
		const gl = this.gl;
		const shader = (type: number, src: string) => {
			const s = gl.createShader(type)!;
			gl.shaderSource(s, src);
			gl.compileShader(s);
			if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
				throw new Error(gl.getShaderInfoLog(s) ?? '');
			return s;
		};
		const p = gl.createProgram()!;
		gl.attachShader(p, shader(gl.VERTEX_SHADER, VERTEX));
		gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fragment));
		gl.linkProgram(p);
		if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? '');
		const names = ['uSize', 'uFlipY', 'uTex', 'uPremultiplied', 'uColor', 'uData', 'uVisibility'];
		this.#uniforms.set(p, Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)])));
		return p;
	}

	/** Uploads an image (straight alpha; premultiplied in the shader), point sampled and clamped. */
	texture(img: ImageBitmap): Texture {
		const gl = this.gl;
		const tex = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, tex);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
		this.#sampling(gl.NEAREST);
		return { tex, width: img.width, height: img.height };
	}

	#sampling(filter: number, minFilter = filter) {
		const gl = this.gl;
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	}

	/** A render target (a RenderTarget2D). `mipmaps` for averaging it down to one pixel. */
	target(
		width: number,
		height: number,
		opts: { linear?: boolean; mipmaps?: boolean } = {}
	): Target {
		const gl = this.gl;
		const tex = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, tex);
		if (opts.mipmaps) {
			gl.texStorage2D(
				gl.TEXTURE_2D,
				Math.log2(Math.max(width, height)) + 1,
				gl.RGBA8,
				width,
				height
			);
			this.#sampling(gl.LINEAR, gl.LINEAR_MIPMAP_LINEAR);
		} else {
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
			this.#sampling(opts.linear ? gl.LINEAR : gl.NEAREST);
		}
		const fb = gl.createFramebuffer()!;
		gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
		return { tex, fb, width, height, premultiplied: true };
	}

	deleteTarget(t: Target) {
		this.gl.deleteFramebuffer(t.fb);
		this.gl.deleteTexture(t.tex);
	}

	/** Draws into `t` (null: the canvas, `width` x `height`). */
	begin(t: Target | null, width = t?.width ?? 0, height = t?.height ?? 0, clear?: RGBA) {
		this.flush();
		const gl = this.gl;
		gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fb : null);
		gl.viewport(0, 0, width, height);
		// Targets are drawn with the top row first, like images, so they sample the same way.
		this.#target = { width, height, flip: t ? -1 : 1 };
		if (clear) {
			gl.clearColor(clear[0] / 255, clear[1] / 255, clear[2] / 255, clear[3] / 255);
			gl.clear(gl.COLOR_BUFFER_BIT);
		}
	}

	generateMipmaps(t: Target) {
		this.flush();
		this.gl.bindTexture(this.gl.TEXTURE_2D, t.tex);
		this.gl.generateMipmap(this.gl.TEXTURE_2D);
	}

	use(program: ProgramName) {
		if (program !== this.#program) this.flush();
		this.#program = program;
	}

	/**
	 * SpriteBatch.Draw(texture, position, source, color, rotation, origin, scale, effects).
	 * `drawPos` is passed to the clouds shader as uDrawPosition.
	 */
	draw(
		t: Texture,
		x: number,
		y: number,
		color: Color,
		o: {
			src?: [number, number, number, number];
			rotation?: number;
			origin?: [number, number];
			scale?: number | [number, number];
			flipX?: boolean;
			drawPos?: [number, number];
		} = {}
	) {
		const [sx, sy, sw, sh] = o.src ?? [0, 0, t.width, t.height];
		const [ox, oy] = o.origin ?? [0, 0];
		const [kx, ky] = typeof o.scale === 'number' ? [o.scale, o.scale] : (o.scale ?? [1, 1]);
		const r = o.rotation ?? 0;
		const cos = Math.cos(r);
		const sin = Math.sin(r);
		let u0 = sx / t.width;
		let u1 = (sx + sw) / t.width;
		const v0 = sy / t.height;
		const v1 = (sy + sh) / t.height;
		if (o.flipX) [u0, u1] = [u1, u0];
		const corners: [number, number, number, number][] = [
			[0, 0, u0, v0],
			[sw, 0, u1, v0],
			[0, sh, u0, v1],
			[sw, sh, u1, v1]
		];
		const quad = corners.map(([cx, cy, u, v]) => {
			const dx = (cx - ox) * kx;
			const dy = (cy - oy) * ky;
			return [x + dx * cos - dy * sin, y + dx * sin + dy * cos, u, v] as const;
		});
		this.#push(t, quad, color, o.drawPos ?? [x, y]);
	}

	/** SpriteBatch.Draw(texture, destinationRectangle, color[, effects]). */
	drawRect(t: Texture, x: number, y: number, w: number, h: number, color: Color, flipX = false) {
		this.draw(t, x, y, color, { scale: [w / t.width, h / t.height], flipX });
	}

	#push(
		t: Texture,
		quad: (readonly [number, number, number, number])[],
		color: Color,
		drawPos: [number, number]
	) {
		if (this.#texture !== t || this.#count >= MAX_SPRITES) this.flush();
		this.#texture = t;
		const a = color.length > 3 ? (color as RGBA)[3] : 255;
		let i = this.#count * 4 * FLOATS_PER_VERTEX;
		for (const [px, py, u, v] of quad) {
			this.#f32[i] = px;
			this.#f32[i + 1] = py;
			this.#f32[i + 2] = u;
			this.#f32[i + 3] = v;
			const b = (i + 4) * 4;
			this.#u8[b] = color[0];
			this.#u8[b + 1] = color[1];
			this.#u8[b + 2] = color[2];
			this.#u8[b + 3] = a;
			this.#f32[i + 5] = drawPos[0];
			this.#f32[i + 6] = drawPos[1];
			i += FLOATS_PER_VERTEX;
		}
		this.#count++;
	}

	flush() {
		if (!this.#count || !this.#texture) return;
		const gl = this.gl;
		const p = this.#programs[this.#program];
		const u = this.#uniforms.get(p)!;
		gl.useProgram(p);
		gl.uniform2f(u.uSize, this.#target.width, this.#target.height);
		gl.uniform1f(u.uFlipY, this.#target.flip);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.#texture.tex);
		gl.uniform1i(u.uTex, 0);
		gl.uniform1i(u.uPremultiplied, this.#texture.premultiplied ? 1 : 0);
		if (this.#program === 'clouds') {
			gl.uniform3f(u.uColor, ...(this.cloudColor.map((c) => c / 255) as RGB));
			gl.uniform4f(u.uData, ...this.cloudData);
		}
		if (this.#program === 'lens' && this.visibility) {
			gl.activeTexture(gl.TEXTURE1);
			gl.bindTexture(gl.TEXTURE_2D, this.visibility.tex);
			gl.uniform1i(u.uVisibility, 1);
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffer);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.#f32, 0, this.#count * 4 * FLOATS_PER_VERTEX);
		gl.drawElements(gl.TRIANGLES, this.#count * 6, gl.UNSIGNED_SHORT, 0);
		this.#count = 0;
	}
}
