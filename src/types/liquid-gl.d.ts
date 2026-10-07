declare module 'liquid-gl' {
  export interface LiquidGLOptions {
    target: string;
    snapshot?: string;
    resolution?: number;
    engine?: 'auto' | 'webgpu' | 'webgl2' | 'webgl';
    zIndex?: number;
    content?: string | boolean;
    refraction?: number;
    aberration?: number;
    bevelDepth?: number;
    bevelWidth?: number;
    frost?: number;
    shadow?: boolean;
    specular?: boolean;
    reveal?: 'none' | 'fade';
    tilt?: boolean;
    magnify?: number;
    tint?: string | null;
    on?: { init?: (lens: LiquidGLLens) => void };
  }
  export interface LiquidGLLens {
    destroy(): void;
    setTint(value: string | null): void;
    renderer?: { captureSnapshot(): Promise<boolean | void> };
  }
  interface LiquidGL {
    (options: LiquidGLOptions): LiquidGLLens | LiquidGLLens[] | undefined;
    registerDynamic(elements: string | Element[]): void;
  }
  const liquidGL: LiquidGL;
  export default liquidGL;
}
