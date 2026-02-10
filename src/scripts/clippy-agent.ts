interface Frame {
  duration: number;
  images: number[][];
  sound?: string;
  exitBranch?: number;
  branching?: {
    branches: Array<{
      frameIndex: number;
      weight: number;
    }>;
  };
}

interface Animation {
  frames: Frame[];
  useExitBranching?: boolean;
}

interface AnimationMap {
  framesize: [number, number];
  animations: Record<string, Animation>;
}

export class ClippyAgent {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private spriteImage: HTMLImageElement;
  private animationMap: AnimationMap | null = null;
  private currentAnimation: string | null = null;
  private currentFrame: number = 0;
  private frameTimeout: number | null = null;
  private onAnimationComplete?: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.spriteImage = new Image();
  }

  async load(spritePath: string, mapPath: string): Promise<void> {
    // Load sprite image
    await new Promise<void>((resolve, reject) => {
      this.spriteImage.onload = () => {
        console.log('Sprite loaded:', this.spriteImage.width, 'x', this.spriteImage.height);
        resolve();
      };
      this.spriteImage.onerror = (e) => {
        console.error('Failed to load sprite:', e);
        reject(e);
      };
      this.spriteImage.src = spritePath;
    });

    // Load animation map
    const response = await fetch(mapPath);
    this.animationMap = await response.json();

    // Set canvas size to match frame dimensions
    if (this.animationMap) {
      const [width, height] = this.animationMap.framesize;
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  play(animationName: string, onComplete?: () => void): void {
    if (!this.animationMap) {
      console.error('Animation map not loaded');
      return;
    }

    const animation = this.animationMap.animations[animationName];
    if (!animation) {
      console.error(`Animation "${animationName}" not found`);
      return;
    }

    // Stop current animation
    if (this.frameTimeout !== null) {
      clearTimeout(this.frameTimeout);
    }

    this.currentAnimation = animationName;
    this.currentFrame = 0;
    this.onAnimationComplete = onComplete;
    this.renderFrame();
  }

  private renderFrame(): void {
    if (!this.animationMap || !this.currentAnimation) return;

    const animation = this.animationMap.animations[this.currentAnimation];
    if (!animation || this.currentFrame >= animation.frames.length) {
      // Animation complete
      if (this.onAnimationComplete) {
        this.onAnimationComplete();
      }
      return;
    }

    const frame = animation.frames[this.currentFrame];

    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Get frame dimensions from the animation map
    const [frameWidth, frameHeight] = this.animationMap!.framesize;

    // Draw all images for this frame
    // Format: [[x, y]] where x,y are sprite sheet coordinates
    // Width/height is always the framesize, destination is always (0,0)
    if (frame.images) {
      for (const imageData of frame.images) {
        const [x, y] = imageData as [number, number];
        try {
          this.ctx.drawImage(
            this.spriteImage,
            x, y, frameWidth, frameHeight,     // source from sprite sheet
            0, 0, frameWidth, frameHeight      // destination on canvas
          );
        } catch (error) {
          console.error('Failed to draw sprite:', error);
        }
      }
    }

    // Schedule next frame
    const duration = frame.duration || 100;
    this.frameTimeout = window.setTimeout(() => {
      this.currentFrame++;
      this.renderFrame();
    }, duration);
  }

  stop(): void {
    if (this.frameTimeout !== null) {
      clearTimeout(this.frameTimeout);
      this.frameTimeout = null;
    }
    this.currentAnimation = null;
    this.currentFrame = 0;
  }

  getAvailableAnimations(): string[] {
    return this.animationMap ? Object.keys(this.animationMap.animations) : [];
  }
}
