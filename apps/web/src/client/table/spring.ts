export class Spring {
  velocity = 0;
  x: number;
  target: number;
  readonly stiffness: number;
  readonly damping: number;

  constructor(x: number, stiffness = 120, damping = 0.8) {
    this.x = x;
    this.target = x;
    this.stiffness = stiffness;
    this.damping = damping;
  }

  step(dt: number): number {
    const friction = 2 * Math.sqrt(this.stiffness) * this.damping;

    const pull =
      this.stiffness * (this.target - this.x) - friction * this.velocity;

    this.velocity += pull * dt;
    this.x += this.velocity * dt;

    return this.x;
  }

  settle(x: number) {
    this.x = x;
    this.target = x;
    this.velocity = 0;
  }

  kick(velocity: number) {
    this.velocity += velocity;
  }
}
