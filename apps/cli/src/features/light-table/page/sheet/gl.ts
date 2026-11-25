// The two things the table draws with WebGL: pictures, many from one
// texture in a single call, and plain boxes with a soft shadow. What was
// drawn can also be laid over the rest as a whole, part of it showing
// through.

const pictureVertex = `#version 300 es
in vec2 aCorner;
in vec4 aRect;
in vec4 aUv;
in vec2 aLook;
uniform vec2 uView;
out vec2 vUv;
out vec2 vLook;
void main() {
  vec2 place = aRect.xy + aCorner * aRect.zw;
  vUv = mix(aUv.xy, aUv.zw, aCorner);
  vLook = aLook;
  vec2 clip = place / uView * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

// A frame that isn't lit keeps a little of its colour, like a print in the
// shade, so that the lit ones stand out by light and not by a border.
const pictureFragment = `#version 300 es
precision mediump float;
uniform sampler2D uPicture;
uniform float uShade;
uniform float uGrey;
in vec2 vUv;
in vec2 vLook;
out vec4 color;
void main() {
  vec3 seen = texture(uPicture, vUv).rgb;
  float grey = dot(seen, vec3(0.2126, 0.7152, 0.0722));
  vec3 shaded = mix(vec3(grey), seen, uGrey) * uShade;
  color = vec4(mix(shaded, seen, vLook.x) * vLook.y, vLook.y);
}`;

const boxVertex = `#version 300 es
in vec2 aCorner;
in vec4 aRect;
in vec4 aColor;
in float aBlur;
uniform vec2 uView;
out vec2 vFromMiddle;
out vec2 vHalf;
out vec4 vColor;
out float vBlur;
void main() {
  vec2 size = aRect.zw + aBlur * 2.0;
  vec2 place = aRect.xy - aBlur + aCorner * size;
  vFromMiddle = (aCorner - 0.5) * size;
  vHalf = aRect.zw * 0.5;
  vColor = aColor;
  vBlur = aBlur;
  vec2 clip = place / uView * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const boxFragment = `#version 300 es
precision mediump float;
in vec2 vFromMiddle;
in vec2 vHalf;
in vec4 vColor;
in float vBlur;
out vec4 color;
void main() {
  vec2 outside = abs(vFromMiddle) - vHalf;
  float distance =
    length(max(outside, 0.0)) + min(max(outside.x, outside.y), 0.0);
  float cover = vBlur > 0.0
    ? 1.0 - smoothstep(-vBlur, vBlur, distance)
    : clamp(0.5 - distance, 0.0, 1.0);
  color = vColor * cover;
}`;

const wholeVertex = `#version 300 es
in vec2 aCorner;
in vec4 aRect;
out vec2 vUv;
void main() {
  vUv = aRect.xy + aCorner * aRect.zw;
  gl_Position = vec4(vUv * 2.0 - 1.0, 0.0, 1.0);
}`;

const wholeFragment = `#version 300 es
precision mediump float;
uniform sampler2D uPicture;
uniform float uShare;
in vec2 vUv;
out vec4 color;
void main() {
  color = texture(uPicture, vUv) * uShare;
}`;

const compile = (
  gl: WebGL2RenderingContext,
  kind: number,
  source: string,
): WebGLShader => {
  const shader = gl.createShader(kind);
  if (shader === null) {
    throw new Error('WebGL has no room for a shader.');
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
};

const link = (
  gl: WebGL2RenderingContext,
  vertex: string,
  fragment: string,
): WebGLProgram => {
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? 'WebGL program failed.');
  }
  return program;
};

type Part = { readonly name: string; readonly size: number };

const floatBytes = Float32Array.BYTES_PER_ELEMENT;
const cornerSize = 2;
const cornerCount = 4;

/** A program that draws many boxes, each described by a row of numbers. */
const makeBatch = (
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  parts: ReadonlyArray<Part>,
) => {
  const stride = parts.reduce((sum, part) => sum + part.size, 0);
  const vertexArray = gl.createVertexArray();
  gl.bindVertexArray(vertexArray);
  const corners = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, corners);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const corner = gl.getAttribLocation(program, 'aCorner');
  gl.enableVertexAttribArray(corner);
  gl.vertexAttribPointer(corner, cornerSize, gl.FLOAT, false, 0, 0);
  const rows = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, rows);
  const places = parts.map(({ name }) => gl.getAttribLocation(program, name));
  for (const place of places) {
    gl.enableVertexAttribArray(place);
    gl.vertexAttribDivisor(place, 1);
  }
  const point = (first: number) => {
    let offset = first * stride;
    for (const [index, part] of parts.entries()) {
      gl.vertexAttribPointer(
        places[index] ?? 0,
        part.size,
        gl.FLOAT,
        false,
        stride * floatBytes,
        offset * floatBytes,
      );
      offset += part.size;
    }
  };
  return {
    stride,
    /** Makes the program current and hands it all rows of this frame. */
    load: (data: Float32Array, count: number) => {
      gl.useProgram(program);
      gl.bindVertexArray(vertexArray);
      gl.bindBuffer(gl.ARRAY_BUFFER, rows);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        data.subarray(0, count * stride),
        gl.DYNAMIC_DRAW,
      );
    },
    draw: (first: number, count: number) => {
      if (count > 0) {
        point(first);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, cornerCount, count);
      }
    },
  };
};

/**
 * A second canvas that isn't seen, for what is laid over the table as a
 * whole. Two things that lie on each other and each let some of the table
 * through would let too little of it through together.
 */
const makeApart = (gl: WebGL2RenderingContext) => {
  const program = link(gl, wholeVertex, wholeFragment);
  const whole = makeBatch(gl, program, [{ name: 'aRect', size: 4 }]);
  const everywhere = new Float32Array([0, 0, 1, 1]);
  const share = gl.getUniformLocation(program, 'uShare');
  const buffer = gl.createFramebuffer();
  const texture = gl.createTexture();
  let size = { width: 0, height: 0 };

  const makeRoom = ({ width, height }: typeof size) => {
    if (size.width === width && size.height === height) {
      return;
    }
    size = { width, height };
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    for (const kind of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) {
      gl.texParameteri(gl.TEXTURE_2D, kind, gl.NEAREST);
    }
    for (const kind of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) {
      gl.texParameteri(gl.TEXTURE_2D, kind, gl.CLAMP_TO_EDGE);
    }
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );
  };

  return {
    /** Has all that is drawn from here on go to the canvas that isn't seen. */
    begin: () => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      makeRoom({
        width: gl.drawingBufferWidth,
        height: gl.drawingBufferHeight,
      });
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    },
    /** Lays what was drawn there over the table, as strongly as `amount`. */
    end: (amount: number) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      whole.load(everywhere, 1);
      gl.uniform1f(share, amount);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      whole.draw(0, 1);
    },
  };
};

/** How many numbers describe one picture: place, part of the texture, look. */
export const pictureStride = 10;
/** How many numbers describe one box: place, colour, blur. */
export const boxStride = 9;

export const makePainter = (canvas: HTMLCanvasElement) => {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    powerPreference: 'high-performance',
  });
  if (gl === null) {
    return null;
  }
  const pictureProgram = link(gl, pictureVertex, pictureFragment);
  const boxProgram = link(gl, boxVertex, boxFragment);
  const pictures = makeBatch(gl, pictureProgram, [
    { name: 'aRect', size: 4 },
    { name: 'aUv', size: 4 },
    { name: 'aLook', size: 2 },
  ]);
  const boxes = makeBatch(gl, boxProgram, [
    { name: 'aRect', size: 4 },
    { name: 'aColor', size: 4 },
    { name: 'aBlur', size: 1 },
  ]);
  const uniform = (program: WebGLProgram, name: string) =>
    gl.getUniformLocation(program, name);
  const places = {
    pictureView: uniform(pictureProgram, 'uView'),
    shade: uniform(pictureProgram, 'uShade'),
    grey: uniform(pictureProgram, 'uGrey'),
    boxView: uniform(boxProgram, 'uView'),
  };
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  let view = { width: 1, height: 1 };

  return {
    gl,
    apart: makeApart(gl),
    /** Fits the drawing to the canvas, whose size is in device pixels. */
    resize: (width: number, height: number, scale: number) => {
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
      view = { width, height };
    },
    clear: (grey: number) => {
      gl.clearColor(grey, grey, grey, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    },
    loadBoxes: (data: Float32Array, count: number) => {
      boxes.load(data, count);
      gl.uniform2f(places.boxView, view.width, view.height);
    },
    drawBoxes: boxes.draw,
    /** `shade` is how bright frames are that aren't lit. */
    loadPictures: (data: Float32Array, count: number, shade: number) => {
      pictures.load(data, count);
      gl.uniform2f(places.pictureView, view.width, view.height);
      gl.uniform1f(places.shade, shade);
      gl.uniform1f(places.grey, greyShare);
      gl.activeTexture(gl.TEXTURE0);
    },
    drawPictures: (texture: WebGLTexture, first: number, count: number) => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      pictures.draw(first, count);
    },
  };
};

/** How much colour a frame keeps that isn't lit. */
const greyShare = 0.55;

export type Painter = NonNullable<ReturnType<typeof makePainter>>;
