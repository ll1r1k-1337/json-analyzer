import type { BinaryWriter } from "../parser/streamParser.js";
import { TokenType } from "./format.js";

export type AnalysisReport = {
  arrays: Map<string, TokenType>;
  strings: string[];
  stringStats: {
    uniqueCount: number;
    totalCount: number;
    uniqueBytes: number;
    totalBytes: number;
  };
};

type ArrayStats = {
  count: number;
  min: number;
  max: number;
  isInteger: boolean;
  isValid: boolean;
};

type Container =
  | { type: 'root' }
  | { type: 'object' }
  | { type: 'array'; index: number; stats: ArrayStats };

export class JsonAnalyzer implements BinaryWriter {
  private readonly path: (string | number)[] = [];
  private readonly containers: Container[] = [{ type: 'root' }];

  private readonly stringIndex = new Map<string, number>();
  private readonly strings: string[] = [];
  private readonly arrays = new Map<string, TokenType>();

  private readonly stats = {
    uniqueCount: 0,
    totalCount: 0,
    uniqueBytes: 0,
    totalBytes: 0,
  };

  getReport(): AnalysisReport {
    return {
      arrays: this.arrays,
      strings: this.strings,
      stringStats: this.stats,
    };
  }

  private registerString(value: string): void {
    this.stats.totalCount += 1;
    this.stats.totalBytes += value.length;

    if (!this.stringIndex.has(value)) {
      const byteLength = Buffer.byteLength(value, "utf8");
      this.stats.uniqueCount += 1;
      this.stats.uniqueBytes += byteLength;
      this.stringIndex.set(value, this.strings.length);
      this.strings.push(value);
    }
  }

  private currentContainer(): Container {
    return this.containers[this.containers.length - 1];
  }

  private beforeValue(): void {
    const container = this.currentContainer();
    if (container.type === 'array') {
      container.index++;
      this.path.push(container.index);
    }
  }

  private afterValue(): void {
    const container = this.currentContainer();
    if (container.type === 'array') {
      this.path.pop();
    } else if (container.type === 'object') {
       this.path.pop(); // Pop the key pushed by writeKey
    }
  }

  writeStartObject(): void | Promise<void> {
    this.beforeValue();
    const container = this.currentContainer();
    if (container.type === 'array') container.stats.isValid = false;
    this.containers.push({ type: 'object' });
  }

  writeEndObject(): void | Promise<void> {
    const container = this.containers.pop();
    if (!container || container.type !== 'object') throw new Error("Unbalanced object");
    this.afterValue();
  }

  writeStartArray(): void | Promise<void> {
    this.beforeValue();
    const container = this.currentContainer();
    if (container.type === 'array') container.stats.isValid = false; // An array inside an array means the outer array is not a leaf number array

    // Identify this array by current path
    // Note: path already includes the index/key for this array

    this.containers.push({
      type: 'array',
      index: -1,
      stats: { count: 0, min: Infinity, max: -Infinity, isInteger: true, isValid: true }
    });
  }

  writeEndArray(): void | Promise<void> {
    const container = this.containers.pop();
    if (!container || container.type !== 'array') throw new Error("Unbalanced array");

    const { stats } = container;

    if (stats.isValid && stats.count > 0) {
      // Determine type
      let type: TokenType | undefined;

      if (stats.isInteger) {
         if (stats.min >= 0 && stats.max <= 255) type = TokenType.Uint8Array;
         else if (stats.min >= -128 && stats.max <= 127) type = TokenType.Int8Array;
         else if (stats.min >= 0 && stats.max <= 65535) type = TokenType.Uint16Array;
         else if (stats.min >= -32768 && stats.max <= 32767) type = TokenType.Int16Array;
         else if (stats.min >= 0 && stats.max <= 4294967295) type = TokenType.Uint32Array;
         else if (stats.min >= -2147483648 && stats.max <= 2147483647) type = TokenType.Int32Array;
         else type = TokenType.Float64Array;
      } else {
         type = TokenType.Float64Array;
      }

      if (type) {
        // The path to this array is currently in 'this.path' because we haven't popped it yet (afterValue does that)
        // However, 'path' includes the index of the last element if we were iterating?
        // No, 'beforeValue' pushed index for *child*. 'afterValue' popped it.
        // So at this point, 'this.path' is exactly the path to the array itself.
        this.arrays.set(this.path.join('/'), type);
      }
    }

    this.afterValue();
  }

  writeKey(key: string): void | Promise<void> {
    this.path.push(key);
    this.registerString(key);
  }

  writeString(value: string): void | Promise<void> {
    this.beforeValue();
    const container = this.currentContainer();
    if (container.type === 'array') container.stats.isValid = false;
    this.registerString(value);
    this.afterValue();
  }

  writeNumber(value: number | string): void | Promise<void> {
    this.beforeValue();
    const container = this.currentContainer();
    // Use container (parent) to update stats
    // But wait, 'currentContainer()' is the parent because we haven't pushed anything for Number.
    // However, 'beforeValue' checks 'currentContainer()'.
    // If parent is array, 'beforeValue' incremented index and pushed it to path.
    // 'container' reference is still valid.

    if (container.type === 'array') {
       if (container.stats.isValid) {
         const num = Number(value);
         if (isNaN(num)) {
            container.stats.isValid = false;
         } else {
            container.stats.count++;
            if (num < container.stats.min) container.stats.min = num;
            if (num > container.stats.max) container.stats.max = num;
            if (!Number.isInteger(num)) container.stats.isInteger = false;
         }
       }
    } else {
       // Parent is object or root.
       // Check if value string representation should be added to string table?
       // writeNumber handles numbers. If it was a string in JSON ("123"), stream-json emits numberValue if it looks like number?
       // stream-json emits numberValue for actual numbers.
       // BinaryWriter.writeNumber takes number | string.
       // If it's not an integer in specific range, existing writer stores it as string reference if needed.
       // But Analyzer just needs to know if it's a candidate for TypedArray.
       // If parent is Object, we don't care about TypedArray stats.
       // But we might care about String deduplication if the number is stored as string?
       // The existing writer only stores as string if it doesn't fit in standard types.
       // Analyzer should probably emulate this check?
       // For now, let's assume numbers don't go to string table unless they are weird.
    }

    this.afterValue();
  }

  writeBoolean(value: boolean): void | Promise<void> {
    this.beforeValue();
    const container = this.currentContainer();
    if (container.type === 'array') container.stats.isValid = false;
    this.afterValue();
  }

  writeNull(): void | Promise<void> {
    this.beforeValue();
    const container = this.currentContainer();
    if (container.type === 'array') container.stats.isValid = false;
    this.afterValue();
  }
}
