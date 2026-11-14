export class FrameDecoder {
  constructor(onFrame, maxBytes = 16 * 1024 * 1024) { this.buffer = Buffer.alloc(0); this.onFrame = onFrame; this.maxBytes = maxBytes; }
  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (length < 4 || length > this.maxBytes) throw new Error('捕获程序返回了无效帧长度。');
      if (this.buffer.length < 4 + length) return;
      const frame = this.buffer.subarray(4, 4 + length);
      if (frame[0] !== 0xff || frame[1] !== 0xd8) throw new Error('捕获程序返回的不是 JPEG 画面。');
      this.onFrame(Buffer.from(frame)); this.buffer = this.buffer.subarray(4 + length);
    }
  }
}
