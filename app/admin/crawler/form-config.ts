/** Form → config helpers (not Server Actions). */

function parseCsvList(raw: string): string[] {
  return raw
    .split(/[,，\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseIntList(raw: string, fallback: number[]): number[] {
  const parts = parseCsvList(raw)
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n));
  return parts.length ? parts : fallback;
}

/** Build profile config from form fields (no raw JSON required). */
export function profileConfigFromForm(formData: FormData): string {
  const years = parseIntList(String(formData.get('years') || ''), [new Date().getUTCFullYear()]);
  const months = parseIntList(String(formData.get('months') || ''), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const quality = parseCsvList(String(formData.get('qualityPriority') || '1080,720'));
  const skip = parseCsvList(String(formData.get('skipKeywords') || ''));
  const config = {
    schemaVersion: 1 as const,
    source: {
      baseUrl: String(formData.get('baseUrl') || '').trim(),
      genre: String(formData.get('genre') || '').trim() || undefined,
      sort: String(formData.get('sort') || '').trim() || undefined,
      type: String(formData.get('type') || '').trim() || undefined,
    },
    dateFilter: { years, months },
    qualityPriority: quality.length ? quality : ['1080'],
    skipKeywords: skip,
    concurrency: {
      download: Math.max(1, parseInt(String(formData.get('downloadConcurrency') || '2'), 10) || 2),
      parse: Math.max(1, parseInt(String(formData.get('parseConcurrency') || '2'), 10) || 2),
    },
    continueOnError: formData.get('continueOnError') === '1',
    maxActiveJobs: Math.max(1, parseInt(String(formData.get('maxActiveJobs') || '1'), 10) || 1),
    requiredSource: String(formData.get('requiredSource') || 'hanime').trim() || 'hanime',
    storageDriver: (String(formData.get('storageDriver') || 's3') === 'sftp' ? 'sftp' : 's3') as
      | 's3'
      | 'sftp',
  };
  return JSON.stringify(config);
}

export function storageConfigFromForm(formData: FormData): string {
  const driver = String(formData.get('driver') || 's3');
  if (driver === 'sftp') {
    return JSON.stringify({
      driver: 'sftp',
      host: String(formData.get('host') || '').trim(),
      port: parseInt(String(formData.get('port') || '22'), 10) || 22,
      username: String(formData.get('username') || '').trim(),
      rootPath: String(formData.get('rootPath') || '').trim(),
      hostKeyFingerprint: String(formData.get('hostKeyFingerprint') || '').trim(),
      publicBaseUrl: String(formData.get('publicBaseUrl') || '').trim() || undefined,
      organizeByDate: formData.get('organizeByDate') === '1',
    });
  }
  return JSON.stringify({
    driver: 's3',
    endpoint: String(formData.get('endpoint') || '').trim(),
    region: String(formData.get('region') || 'auto').trim() || 'auto',
    bucket: String(formData.get('bucket') || '').trim(),
    prefix: String(formData.get('prefix') || '').trim(),
    deliveryMode: String(formData.get('deliveryMode') || 'public'),
    publicBaseUrl: String(formData.get('publicBaseUrl') || '').trim() || undefined,
    forcePathStyle: formData.get('forcePathStyle') === '1',
    organizeByDate: formData.get('organizeByDate') === '1',
  });
}
