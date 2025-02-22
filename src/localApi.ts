import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import {
  Asset,
  Collection,
  CollectionReference,
  Global,
  GlobalReference,
  Id,
} from "./types";
import { doesMatchFilter } from "./applyFilters.js";
import type { Sharp } from "sharp";
import { convertZodSchema } from "./schemas.js";
import Ajv from "ajv";
import { ajvFormats } from "./validate.js";

// type SavedEntry<T> = {
//   data: T;
//   dataOnRemote?: T;
// };

// type SavedGlobal<T> = {
//   data: T;
//   dataOnRemote?: T;
// };

// type CreateEntryJournalItem<T> = {
//   id: string;
//   data: T;
//   collection: string;
// };

// type UpdateEntryJournalItem<T> = {
//   id: string;
//   data: T;
//   collection: string;
//   field: string;
//   value: any;
// };

// type DeleteEntryJournalItem = {
//   id: string;
//   collection: string;
// };

// type CreateGlobalJournalItem<T> = {
//   global: string;
//   data: T;
// };

// type UpdateGlobalJournalItem<T> = {
//   data: T;
//   global: string;
//   field: string;
//   value: any;
// };

// type DeleteGlobalJournalItem = {
//   global: string;
// };

export class LocalApi {
  private collections: Map<string, Collection<any>>;
  private globals: Map<string, Global<any>>;
  private contentDir: string;

  constructor(options: {
    collections?: Collection<any>[];
    globals?: Global<any>[];
    contentDir: string;
  }) {
    this.collections = new Map(
      (options.collections || []).map((c) => [c.name, c])
    );
    this.globals = new Map((options.globals || []).map((g) => [g.name, g]));
    console.log(`The content dir is ${options.contentDir}`);
    this.contentDir = options.contentDir;
  }

  public setConfig(options: {
    collections?: Collection<any>[];
    globals?: Global<any>[];
  }) {
    this.collections = new Map(
      (options.collections || []).map((c) => [c.name, c])
    );
    this.globals = new Map((options.globals || []).map((g) => [g.name, g]));
  }

  private getCollectionRef<T extends z.ZodRawShape, S extends z.ZodObject<T>>(
    ref: CollectionReference
  ): Collection<S> {
    if (typeof ref === "string") {
      const collection = this.collections.get(ref);
      if (!collection) {
        throw new Error(`Collection ${ref} not found`);
      }
      return collection as Collection<S>;
    }
    return ref;
  }

  private getGlobalRef<T extends z.ZodRawShape, S extends z.ZodObject<T>>(
    ref: GlobalReference
  ): Global<S> {
    if (typeof ref === "string") {
      const global = this.globals.get(ref);
      if (!global) {
        throw new Error(`Global ${ref} not found`);
      }
      return global as Global<S>;
    }
    return ref;
  }

  async getEntry<T extends Record<string, any>>(
    collection: CollectionReference,
    id: Id,
    options?: { include?: string[] }
  ): Promise<T | null> {
    const col = this.getCollectionRef(collection);
    try {
      const filePath = path.join(this.contentDir, col.name, `${id}.json`);
      const content = await fs.readFile(filePath, "utf-8");
      const data = JSON.parse(content) as { data: T };
      const entry = data.data as T;
      if (entry && options?.include?.length) {
        for (const include of options?.include ?? []) {
          const value = entry[include];
          if (value?.id && value?.collection) {
            const other = await this.getEntry(value.collection, value.id);
            entry[include].entry = other;
          }
        }
      }
      return entry;
    } catch {
      return null;
    }
  }

  async getCollections(): Promise<Collection<any>[]> {
    const collections = await this._getCollections();
    return collections;
  }

  async getCollection<T extends z.ZodRawShape, S extends z.ZodObject<T>>(
    ref: CollectionReference
  ): Promise<Collection<S> | null> {
    const collection = await this.getCollectionRef<T, S>(ref);
    return collection;
  }

  async getEntries<T extends Record<string, any>>(
    collection: CollectionReference,
    options?: {
      includeCount?: boolean;
      include?: string[];
      limit?: number;
      offset?: number;
      filters?: Record<string, any>;
      sort?: [keyof T, "asc" | "desc"][];
    }
  ): Promise<{ entries: T[]; limit: number; offset: number; count?: number }> {
    const limit = options?.limit ?? 1000;
    const col = this.getCollectionRef(collection);
    const dir = path.join(this.contentDir, col.name);
    try {
      await fs.access(dir);
    } catch {
      return { entries: [], limit, offset: options?.offset ?? 0 };
    }

    let files = await fs.readdir(dir);

    let entries: T[] = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => {
          const content = await fs.readFile(path.join(dir, file), "utf-8");
          const data = JSON.parse(content) as { data: T };
          return data.data;
        })
    );
    if (options?.filters) {
      entries = entries.filter((entry) =>
        doesMatchFilter(entry, options.filters!)
      );
    }
    const totalCount = entries.length;
    if (options?.offset) {
      entries = entries.slice(options.offset);
    }
    entries = entries.slice(0, limit);
    for (const sort of options?.sort ?? []) {
      entries.sort((a: any, b: any) => {
        const [key, direction] = sort;
        const valueA = a[key];
        const valueB = b[key];

        // Handle null/undefined values
        if (valueA == null && valueB == null) return 0;
        if (valueA == null) return direction === "asc" ? -1 : 1;
        if (valueB == null) return direction === "asc" ? 1 : -1;

        // Handle different data types
        if (typeof valueA === "number" && typeof valueB === "number") {
          return direction === "asc" ? valueA - valueB : valueB - valueA;
        }

        if (valueA instanceof Date && valueB instanceof Date) {
          return direction === "asc"
            ? valueA.getTime() - valueB.getTime()
            : valueB.getTime() - valueA.getTime();
        }

        // Try to parse dates if they're strings in ISO format
        if (typeof valueA === "string" && typeof valueB === "string") {
          const dateA = new Date(valueA);
          const dateB = new Date(valueB);
          if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
            return direction === "asc"
              ? dateA.getTime() - dateB.getTime()
              : dateB.getTime() - dateA.getTime();
          }
        }

        // Default to string comparison
        const stringA = String(valueA);
        const stringB = String(valueB);
        return direction === "asc"
          ? stringA.localeCompare(stringB)
          : stringB.localeCompare(stringA);
      });
    }

    if (options?.include?.length) {
      for (const entry of entries) {
        for (const include of options?.include ?? []) {
          const value = entry[include];
          if (value?.id && value?.collection) {
            const other = await this.getEntry(value.collection, value.id);
            entry[include].entry = other;
          }
        }
      }
    }

    return {
      entries,
      limit,
      offset: options?.offset ?? 0,
      count: options?.includeCount ? totalCount : undefined,
    };
  }

  async setEntry<T>(
    collection: CollectionReference,
    id: Id,
    data: T
  ): Promise<void> {
    const col = this.getCollectionRef(collection);
    const dir = path.join(this.contentDir, col.name);
    await fs.mkdir(dir, { recursive: true });
    const collections = await this._getCollections();

    const schema = convertZodSchema(
      col.schema,
      collections.reduce((acc, col) => {
        acc[col.name] = col.schema;
        return acc;
      }, {} as Record<string, z.ZodType<any>>)
    );
    const ajv = new Ajv({
      formats: ajvFormats(collections.map((col) => col.name)),
    });
    const validate = ajv.compile(schema);
    const valid = validate(data);
    if (!valid) throw new Error(ajv.errorsText(validate.errors));
    // const parsed = col.schema.parse(data);
    await fs.writeFile(
      path.join(dir, `${id}.json`),
      JSON.stringify({ data }, null, 2)
    );
  }

  async deleteEntry<T>(
    collection: CollectionReference,
    id: Id
  ): Promise<boolean> {
    const col = this.getCollectionRef(collection);
    const filePath = path.join(this.contentDir, col.name, `${id}.json`);
    try {
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async getGlobals(): Promise<Global<any>[]> {
    const globals = await this._getGlobals();
    return globals;
  }

  async getGlobal(ref: GlobalReference): Promise<Global<any> | null> {
    const glob = this.getGlobalRef(ref);
    return glob;
  }

  async getGlobalValues(): Promise<any[]> {
    const globs = await this._getGlobals();
    return await Promise.all(globs.map((glob) => this._getGlobalValue(glob)));
  }

  async getGlobalValue<T>(ref: GlobalReference): Promise<T | null> {
    const global = await this.getGlobalRef(ref);
    return this._getGlobalValue(global);
  }

  async setGlobalValue<T>(global: GlobalReference, data: T): Promise<void> {
    const glob = this.getGlobalRef(global);
    const dir = path.join(this.contentDir, "globals");
    await fs.mkdir(dir, { recursive: true });

    const parsed = glob.schema.parse(data);
    await fs.writeFile(
      path.join(dir, `${glob.name}.json`),
      JSON.stringify({ data: parsed }, null, 2)
    );
  }

  // Asset Management
  private getAssetDir() {
    return path.join(this.contentDir, "assets");
  }

  private async ensureAssetDir() {
    const dir = this.getAssetDir();
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  private getAssetPath(filename: string) {
    return path.join(this.getAssetDir(), filename);
  }

  async uploadAsset(
    file: Buffer | Uint8Array,
    options: {
      filename: string;
      contentType?: string;
    }
  ): Promise<{
    filename: string;
    path: string;
    size: number;
    contentType?: string;
  }> {
    const dir = await this.ensureAssetDir();
    const { filename } = options;
    // Use provided contentType or detect from filename
    const contentType = options.contentType ?? this.getContentType(filename);

    // Ensure unique filename
    let finalFilename = filename;
    let counter = 1;
    while (
      await fs
        .access(path.join(dir, finalFilename))
        .then(() => true)
        .catch(() => false)
    ) {
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      finalFilename = `${base}-${counter}${ext}`;
      counter++;
    }

    const filePath = path.join(dir, finalFilename);
    await fs.writeFile(filePath, file);

    const stats = await fs.stat(filePath);
    return {
      filename: finalFilename,
      path: filePath,
      size: stats.size,
      contentType,
    };
  }

  async getAsset(
    filename: string,
    options?: {
      width?: number;
      height?: number;
      format?: "avif" | "webp" | "jpeg" | "png";
      quality?: number;
      fit?: "contain" | "cover" | "fill" | "inside" | "outside" | undefined;
      position?: number | string | undefined;
      background?: string | undefined
      withoutEnlargement?: boolean | undefined;
      withoutReduction?: boolean | undefined;
    }
  ): Promise<{ data: Buffer; contentType?: string; width?: number; height?: number } | null> {
    try {
      const filePath = this.getAssetPath(filename);
      let data = await fs.readFile(filePath);
      const stats = await fs.stat(filePath);
      const contentType = this.getContentType(filename);
      let width: number | undefined;
      let height: number | undefined;

      if (contentType?.startsWith("image/")) {
        try {
          const sharp = require("sharp");
          let transform = sharp(data) as Sharp;
          const metadata = await transform.metadata();
          width = metadata.width;
          height = metadata.height;

          if (
            options?.width ||
            options?.height ||
            options?.format ||
            options?.quality
          ) {
            if (options?.width || options?.height) {
              transform = transform.resize(options?.width, options?.height, {
                fit: options.fit,
                position: options.position,
                background: options.background,
                withoutEnlargement: options.withoutEnlargement,
                withoutReduction: options.withoutReduction,
              });
            }

            if (options.format) {
              transform = transform.toFormat(options.format, {
                quality: options.quality,
              });
            }

            data = await transform.toBuffer();
            // Get the new dimensions after transformation
            const newMetadata = await sharp(data).metadata();
            width = newMetadata.width;
            height = newMetadata.height;
          }
        } catch {
          console.warn(
            "Could not transform image or get metadata. To use transformations locally, install sharp. Using the original file instead."
          );
        }
      }

      return { data, contentType, width, height };
    } catch {
      return null;
    }
  }

  async listAssets(options?: {
    search?: string;
    limit?: number;
    startAfter?: string;
  }): Promise<Asset[]> {
    const dir = this.getAssetDir();
    try {
      let files = await fs.readdir(dir);
      if (options?.search) {
        files = files.filter((file) =>
          file.toLowerCase().includes(options!.search!.toLowerCase())
        );
      }
      if (options?.startAfter) {
        const index = files.indexOf(options!.startAfter!);
        if (index !== -1) {
          files = files.slice(index + 1);
        }
      }
      if (options?.limit) {
        files = files.slice(0, options.limit);
      }
      const assets = await Promise.all(
        files.map(async (filename) => {
          const filePath = path.join(dir, filename);
          const stats = await fs.stat(filePath);
          const contentType = this.getContentType(filename);
          let width: number | undefined;
          let height: number | undefined;
          if (contentType?.startsWith("image/")) {
            try {
              const sharp = require("sharp");
              const { width: w, height: h } = await sharp(filePath).metadata();
              width = w;
              height = h;
            } catch {}
          }
          return {
            name: filename.split("/").pop()!,
            key: filename,
            size: stats.size,
            metadata: {
              width,
              height,
            },
            httpMetadata: contentType
              ? {
                  contentType,
                }
              : undefined,
          };
        })
      );
      return assets;
    } catch {
      return [];
    }
  }

  async deleteAsset(filename: string): Promise<boolean> {
    try {
      const filePath = this.getAssetPath(filename);
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private getContentType(filename: string): string | undefined {
    const ext = path.extname(filename).toLowerCase();
    const contentTypes: Record<string, string> = {
      // Images
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".avif": "image/avif",
      ".svg": "image/svg+xml",
      // Videos
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      // Audio
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".ogg": "audio/ogg",
      // Documents
      ".pdf": "application/pdf",
      ".doc": "application/msword",
      ".docx":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      // Archives
      ".zip": "application/zip",
      ".rar": "application/x-rar-compressed",
      // Other
      ".json": "application/json",
      ".xml": "application/xml",
      ".txt": "text/plain",
    };
    return contentTypes[ext];
  }

  private async _getCollections(): Promise<Collection<any>[]> {
    return Array.from(this.collections.values());
  }

  private async _getGlobals(): Promise<Global<any>[]> {
    return Array.from(this.globals.values());
  }

  private async _getGlobalValue<T>(glob: Global<any>): Promise<T | null> {
    const filePath = path.join(this.contentDir, "globals", `${glob.name}.json`);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const data = JSON.parse(content) as { data: T };
      const parsed = data.data;
      return parsed;
    } catch (err) {
      return null;
    }
  }
}
