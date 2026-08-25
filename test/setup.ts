import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

process.env.INSTA_API_TOKENS = 'test-api-token';
process.env.S3_BUCKET = 'test-bucket';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_ACCESS_KEY_ID = 'test-key';
process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
process.env.CACHE_DIR = mkdtempSync(path.join(tmpdir(), 'instagetter-test-'));
