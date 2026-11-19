import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createR2StorageClient, sanitizeFilename } from './storage.ts';

describe('R2 Object Storage & Upload Security', () => {
  const client = createR2StorageClient();

  test('sanitizes filename and prevents directory traversal', () => {
    const raw = '../../../etc/passwd.dangerous.png';
    const clean = sanitizeFilename(raw);
    assert.equal(clean, 'passwd.dangerous.png');
    assert.ok(!clean.includes('..'));
    assert.ok(!clean.includes('/'));
  });

  test('authorizes valid upload request and generates signed ticket', async () => {
    const ticket = await client.authorizeUpload({
      filename: 'event-banner.webp',
      contentType: 'image/webp',
      byteSize: 2 * 1024 * 1024, // 2MB
      scope: 'event_media',
      ownerUserId: 'usr_organizer_1',
    });

    assert.ok(ticket.ticket.length > 20);
    assert.equal(ticket.scope, 'event_media');
    assert.equal(ticket.accessPolicy, 'public_read');
    assert.ok(ticket.expiresAt > Date.now());

    // Verify ticket
    const verified = await client.verifyTicket(ticket.ticket);
    assert.ok(verified !== null);
    assert.equal(verified?.ownerUserId, 'usr_organizer_1');
    assert.equal(verified?.scope, 'event_media');
  });

  test('rejects unpermitted MIME types', async () => {
    await assert.rejects(
      async () => {
        await client.authorizeUpload({
          filename: 'malicious.exe',
          contentType: 'application/x-msdownload',
          byteSize: 1024,
          scope: 'public_asset',
          ownerUserId: 'usr_1',
        });
      },
      {
        message: /Invalid content type/,
      },
    );
  });

  test('rejects files exceeding scope size limits', async () => {
    await assert.rejects(
      async () => {
        await client.authorizeUpload({
          filename: 'huge-poster.png',
          contentType: 'image/png',
          byteSize: 20 * 1024 * 1024, // 20MB exceeds 10MB limit for public_asset
          scope: 'public_asset',
          ownerUserId: 'usr_1',
        });
      },
      {
        message: /File size exceeds maximum allowed/,
      },
    );
  });

  test('rejects tampered or forged upload tickets', async () => {
    const ticket = await client.authorizeUpload({
      filename: 'audition.mp4',
      contentType: 'video/mp4',
      byteSize: 15 * 1024 * 1024,
      scope: 'audition_media',
      ownerUserId: 'musician_42',
    });

    // Tamper with ticket
    const tampered = ticket.ticket.slice(0, -4) + 'abcd';
    const result = await client.verifyTicket(tampered);
    assert.equal(result, null);
  });

  test('enforces access permissions on private object retrieval', async () => {
    const key = 'private_document/usr_worship_leader/chart.pdf';
    await client.putObject(key, new TextEncoder().encode('Sheet music chords'), {
      contentType: 'application/pdf',
      scope: 'private_document',
      accessPolicy: 'private',
      ownerUserId: 'usr_worship_leader',
    });

    // Owner can access
    const ownerFetch = await client.getObject(key, { userId: 'usr_worship_leader' });
    assert.ok(ownerFetch !== null);

    // Staff can access
    const staffFetch = await client.getObject(key, { isStaff: true });
    assert.ok(staffFetch !== null);

    // Unrelated user cannot access
    await assert.rejects(
      async () => {
        await client.getObject(key, { userId: 'unrelated_attacker' });
      },
      {
        message: /Access denied/,
      },
    );
  });
});
