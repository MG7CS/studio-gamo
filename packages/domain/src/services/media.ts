/**
 * Media Metadata & Persistence Service
 * Coordinates R2 storage authorization with D1 metadata tracking.
 */

import { eq } from 'drizzle-orm';
import {
  mediaFiles,
  type GamoDatabase,
} from '@gamo/db';

export class MediaService {
  db: GamoDatabase;

  constructor(db: GamoDatabase) {
    this.db = db;
  }

  /**
   * Records a media file metadata record in D1 upon upload confirmation.
   */
  async recordMediaUpload(params: {
    ownerUserId: string;
    scopeType: string;
    scopeId?: string;
    r2Key: string;
    contentType: string;
    byteSize: number;
    accessPolicy: string;
  }) {
    const id = `med_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    await this.db.insert(mediaFiles).values({
      id,
      ownerUserId: params.ownerUserId,
      scopeType: params.scopeType,
      scopeId: params.scopeId || null,
      r2Key: params.r2Key,
      contentType: params.contentType,
      byteSize: params.byteSize,
      accessPolicy: params.accessPolicy,
      status: 'confirmed',
      createdAt: new Date(),
    });

    const [file] = await this.db.select().from(mediaFiles).where(eq(mediaFiles.id, id)).limit(1);
    return file;
  }
}
