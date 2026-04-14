/**
 * Voice message transcription using OpenAI's Whisper API.
 * Downloads audio from a URL, sends to Whisper, returns transcript text.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { readEnvFile } from './env.js';
import { logger } from './logger.js';

/**
 * Transcribe an audio file using OpenAI's Whisper API.
 * @param audioPath - Path to the audio file on disk
 * @returns Transcribed text, or null if transcription fails
 */
export async function transcribeAudio(audioPath: string): Promise<string | null> {
  const secrets = readEnvFile(['OPENAI_API_KEY']);
  const apiKey = secrets.OPENAI_API_KEY;

  if (!apiKey) {
    logger.warn('OPENAI_API_KEY not set — voice transcription unavailable');
    return null;
  }

  try {
    const fileBuffer = fs.readFileSync(audioPath);
    const filename = path.basename(audioPath);

    // Build multipart form data manually (no external dependency needed)
    const boundary = `----FormBoundary${Date.now()}`;
    const parts: Buffer[] = [];

    // model field
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n`
    ));

    // file field
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: audio/ogg\r\n\r\n`
    ));
    parts.push(fileBuffer);
    parts.push(Buffer.from('\r\n'));

    // closing boundary
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error({ status: response.status, body: errText }, 'OpenAI transcription failed');
      return null;
    }

    const result = await response.json() as { text?: string };
    const transcript = result.text?.trim();

    if (transcript) {
      logger.info({ chars: transcript.length }, 'Transcribed voice message');
      return transcript;
    }

    return null;
  } catch (err) {
    logger.error({ err }, 'Voice transcription error');
    return null;
  }
}

/**
 * Download a file from a URL to a temporary path.
 * Caller is responsible for cleaning up the file.
 */
export async function downloadToTemp(url: string, ext = '.ogg'): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    const tmpPath = path.join(os.tmpdir(), `nanoclaw-voice-${Date.now()}${ext}`);
    fs.writeFileSync(tmpPath, buffer);
    return tmpPath;
  } catch (err) {
    logger.error({ err }, 'Failed to download audio file');
    return null;
  }
}
