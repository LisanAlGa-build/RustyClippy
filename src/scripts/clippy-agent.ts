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
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D rendering context for canvas');
    }
    this.ctx = ctx;
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
      
      console.log(`Canvas set to ${width}x${height}`);
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

    console.log(`Starting animation: ${animationName}`);
    
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

    try {
      // Clear canvas with explicit fill to ensure complete clearing on all platforms
      if (this.ctx && this.canvas) {
        // Debug: log current frame info
        console.log(`Rendering frame ${this.currentFrame} of animation "${this.currentAnimation}"`);
        
        // Ensure we're working with a valid context and canvas
        const ctx = this.ctx;
        const canvas = this.canvas;
        
        // Clear the entire canvas area using multiple methods for maximum compatibility
        if (ctx && canvas) {
          try {
            // Method 1: Standard clearRect - try first to be efficient
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Force a redraw by calling get context again (this can help with Linux rendering issues)
            const freshCtx = this.canvas.getContext('2d');
            if (freshCtx) {
              freshCtx.clearRect(0, 0, canvas.width, canvas.height);
            }
          } catch (clearError) {
            console.warn('clearRect failed:', clearError);
          }
          
          try {
            // Method 2: Fill with transparent color as backup
            ctx.fillStyle = 'rgba(0, 0, 0, 0)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Additional Linux-specific workaround - force a context reset
            if (ctx) {
              ctx.globalCompositeOperation = 'source-over';
            }
          } catch (fillError) {
            console.warn('fillRect failed:', fillError);
          }
        }
      }

      // Reset all context properties to ensure clean slate before drawing
      if (this.ctx) {
        this.ctx.globalAlpha = 1.0;
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.strokeStyle = '#000000';
        this.ctx.fillStyle = '#000000';
        this.ctx.lineWidth = 1;
        this.ctx.lineCap = 'butt';
        this.ctx.lineJoin = 'miter';
        this.ctx.miterLimit = 10;
      }

      // Get frame dimensions from the animation map
      const [frameWidth, frameHeight] = this.animationMap!.framesize;

      // Draw all images for this frame - ensure we're drawing with proper context settings
      // Format: [[x, y]] where x,y are sprite sheet coordinates
      // Width/height is always the framesize, destination is always (0,0)
      if (frame.images) {
        console.log(`Drawing ${frame.images.length} image(s) for frame ${this.currentFrame}`);
        for (const imageData of frame.images) {
          const [x, y] = imageData as [number, number];
          try {
            // Reset context settings before drawing to ensure clean state
            this.ctx.globalAlpha = 1.0;
            this.ctx.globalCompositeOperation = 'source-over';
            
            console.log(`Drawing image at (${x}, ${y}) with size ${frameWidth}x${frameHeight}`);
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

    } catch (error) {
      console.error('Error in renderFrame:', error);
      // Continue with animation even if there's an error - don't break the loop
    }

    // Schedule next frame with additional safety checks
    const duration = frame.duration || 100;
    
    // Ensure we don't schedule a new frame if the animation has been stopped or context is invalid
    if (this.currentAnimation !== null && this.ctx) {
      // Add a small delay to ensure proper rendering on Linux systems
      // Also reduce frequency of updates to avoid GTK issues
      const adjustedDuration = Math.max(10, duration - 5);
      this.frameTimeout = window.setTimeout(() => {
        this.currentFrame++;
        this.renderFrame();
      }, adjustedDuration);
    }
  }

  stop(): void {
    if (this.frameTimeout !== null) {
      clearTimeout(this.frameTimeout);
      this.frameTimeout = null;
    }
    this.currentAnimation = null;
    this.currentFrame = 0;
    
    // Clear canvas when stopping animation to ensure clean slate
    if (this.ctx && this.canvas) {
      try {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      } catch (error) {
        console.warn('Failed to clear canvas on stop:', error);
      }
    }
  }

  getAvailableAnimations(): string[] {
    return this.animationMap ? Object.keys(this.animationMap.animations) : [];
  }
}
