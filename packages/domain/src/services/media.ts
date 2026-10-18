/**
 * Media Metadata & Persistence Service
 * Coordinates R2 storage authorization with D1 metadata tracking.
 */

import { eq } from 'drizzle-orm';
import { mediaFiles, type GamoDatabase } from '@gamo/db';

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
    if (
      /(identity_document|government_id|student_document|minor_record)/i.test(params.scopeType) ||
      /(passport|driver[_-]?licen[sc]e|ssn|social[_-]?security|birth[_-]?certificate|student[_-]?id|minor[_-]?record)/i.test(
        params.r2Key,
      )
    ) {
      throw new Error(
        'SENSITIVE_DOCUMENT_PROHIBITED: Collection of personal identity documents or sensitive student/minor records is prohibited.',
      );
    }

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
      status: 'quarantined',
      createdAt: new Date(),
    });

    const [file] = await this.db.select().from(mediaFiles).where(eq(mediaFiles.id, id)).limit(1);
    return file;
  }
}
