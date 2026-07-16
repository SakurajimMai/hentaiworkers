import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { AppError } from '@/lib/server/shared/errors';
import { getMacCmsPreset } from '@/lib/server/crawler/domain/maccms-presets';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const execFileAsync = promisify(execFile);

type FlatClass = {
  typeId: number;
  typePid: number;
  typeName: string;
};

type ClassNode = FlatClass & { children: ClassNode[] };

type LiveResult = {
  flat: FlatClass[];
  baseUrl: string;
  transport: 'python' | 'node' | 'fallback';
  python?: string;
  note?: string;
};

function isSafeHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = (u.hostname || '').toLowerCase();
    if (!host || host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function normalizeBase(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) return '';
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

function buildTree(flat: FlatClass[]): ClassNode[] {
  const map = new Map<number, ClassNode>();
  for (const row of flat) {
    map.set(row.typeId, { ...row, children: [] });
  }
  const roots: ClassNode[] = [];
  for (const node of map.values()) {
    const parent = map.get(node.typePid);
    if (parent && parent.typeId !== node.typeId) parent.children.push(node);
    else roots.push(node);
  }
  const sortRec = (nodes: ClassNode[]) => {
    nodes.sort((a, b) => a.typeId - b.typeId);
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

function normalizeFlat(rows: ReadonlyArray<Partial<FlatClass>>): FlatClass[] {
  return rows
    .map((c) => ({
      typeId: Number(c.typeId),
      typePid: Number(c.typePid ?? 0),
      typeName: String(c.typeName ?? '').trim(),
    }))
    .filter((c) => Number.isFinite(c.typeId) && c.typeId > 0 && c.typeName.length > 0);
}

function resolvePythonExecutable(): string | null {
  const home = homedir();
  const local = process.env.LOCALAPPDATA || join(home, 'AppData', 'Local');
  const candidates = [
    process.env.PYTHON,
    process.env.PYTHON_PATH,
    join(local, 'Programs', 'Python', 'Python313', 'python.exe'),
    join(local, 'Programs', 'Python', 'Python312', 'python.exe'),
    join(local, 'Programs', 'Python', 'Python311', 'python.exe'),
    'C:\\Python313\\python.exe',
    'C:\\Python312\\python.exe',
    'python',
    'py',
  ].filter((v): v is string => typeof v === 'string' && v.trim().length > 0);

  for (const c of candidates) {
    if (c === 'python' || c === 'py' || existsSync(c)) return c;
  }
  return null;
}

/** Minimal env: avoid Next/proxy/ssl vars that can hang child Python on Windows. */
function cleanPythonEnv(): NodeJS.ProcessEnv {
  // Do NOT spread process.env — Next injects vars that hang urllib child processes
  // when stdout/stderr pipes are attached under this host. File output + lean env
  // is the reliable path (verified ~1.5s transport=python).
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    windir: process.env.windir,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
    APPDATA: process.env.APPDATA,
    ComSpec: process.env.ComSpec,
    PATHEXT: process.env.PATHEXT,
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
    PYTHONUNBUFFERED: '1',
    PYTHONDONTWRITEBYTECODE: '1',
    NODE_ENV: process.env.NODE_ENV,
  } as NodeJS.ProcessEnv;
  return env;
}

async function fetchViaPython(baseUrl: string): Promise<LiveResult> {
  const python = resolvePythonExecutable();
  if (!python) throw new Error('未找到 Python 解释器');
  const script = resolve(process.cwd(), 'scripts/fetch-maccms-class.py');
  if (!existsSync(script)) throw new Error(`缺少脚本: ${script}`);

  const dir = mkdtempSync(join(tmpdir(), 'maccms-class-'));
  const outFile = join(dir, 'class.json');
  // Touch so we can distinguish "never wrote" vs empty.
  writeFileSync(outFile, '', 'utf8');

  const isPyLauncher = python.toLowerCase() === 'py' || python.toLowerCase().endsWith('\\py.exe');
  const args = isPyLauncher
    ? ['-3', '-u', '-X', 'utf8', script, baseUrl, '-o', outFile]
    : ['-u', '-X', 'utf8', script, baseUrl, '-o', outFile];

  try {
    await execFileAsync(python, args, {
      cwd: process.cwd(),
      timeout: 20_000,
      windowsHide: true,
      env: cleanPythonEnv(),
      maxBuffer: 2 * 1024 * 1024,
    });
  } catch (err) {
    // execFile throws on non-zero exit; helper may still have written JSON.
    const msg = err instanceof Error ? err.message : String(err);
    if (!existsSync(outFile) || readFileSync(outFile, 'utf8').trim() === '') {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      throw new Error(`Python 执行失败: ${msg.slice(0, 300)}`);
    }
  }

  try {
    const rawText = readFileSync(outFile, 'utf8').trim();
    if (!rawText) throw new Error('Python 未写出分类文件');
    const parsed = JSON.parse(rawText) as {
      ok?: boolean;
      flat?: FlatClass[];
      baseUrl?: string;
      error?: string;
    };
    if (!parsed.ok || !Array.isArray(parsed.flat)) {
      throw new Error(parsed.error || 'Python 返回无效分类');
    }
    const flat = normalizeFlat(parsed.flat);
    if (!flat.length) throw new Error('Python 返回空分类列表');
    return {
      flat,
      baseUrl: String(parsed.baseUrl || baseUrl),
      transport: 'python',
      python,
    };
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

async function fetchViaNode(baseUrl: string): Promise<LiveResult> {
  const listUrl = new URL(baseUrl);
  listUrl.searchParams.set('ac', 'list');
  const res = await fetch(listUrl.toString(), {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      Accept: 'application/json,text/plain,*/*',
      'Accept-Encoding': 'identity',
      Connection: 'close',
    },
    signal: AbortSignal.timeout(8_000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`资源站 HTTP ${res.status}`);
  const raw = (await res.json()) as {
    class?: Array<{ type_id?: number; type_pid?: number; type_name?: string }>;
  };
  const flat = normalizeFlat(
    (raw.class ?? []).map((c) => ({
      typeId: Number(c.type_id),
      typePid: Number(c.type_pid ?? 0),
      typeName: String(c.type_name ?? '').trim(),
    })),
  );
  if (!flat.length) throw new Error('资源站未返回分类');
  return { flat, baseUrl, transport: 'node' };
}

function loadProviderFallback(provider: string, baseUrl: string): LiveResult | null {
  if (provider !== 'ikun') return null;
  try {
    const path = resolve(
      process.cwd(),
      'lib/server/crawler/domain/maccms-class-fallback-ikun.json',
    );
    if (!existsSync(path)) return null;
    const flat = normalizeFlat(JSON.parse(readFileSync(path, 'utf8')) as FlatClass[]);
    if (!flat.length) return null;
    return {
      flat,
      baseUrl,
      transport: 'fallback',
      note: '实时拉取失败，已使用本地缓存分类表；仍可勾选采集。',
    };
  } catch {
    return null;
  }
}

async function loadClasses(provider: string, baseUrl: string): Promise<LiveResult> {
  const errors: string[] = [];

  try {
    return await fetchViaPython(baseUrl);
  } catch (err) {
    errors.push(`python: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    return await fetchViaNode(baseUrl);
  } catch (err) {
    errors.push(`node: ${err instanceof Error ? err.message : String(err)}`);
  }

  const fallback = loadProviderFallback(provider, baseUrl);
  if (fallback) return fallback;

  throw new AppError(
    'SOURCE_UNAVAILABLE',
    `无法从资源站加载分类。${errors.join('；')}`.slice(0, 700),
    502,
  );
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const sp = req.nextUrl.searchParams;
    const provider = (sp.get('provider') || '').trim();
    const preset = provider ? getMacCmsPreset(provider) : undefined;
    const baseUrl = normalizeBase(sp.get('baseUrl') || preset?.baseUrl || '');
    if (!baseUrl || !isSafeHttpUrl(baseUrl)) {
      throw new AppError('RESULT_INVALID', '无效的 API Base URL', 400);
    }

    const result = await loadClasses(provider || preset?.key || '', baseUrl);

    return NextResponse.json({
      data: {
        baseUrl: result.baseUrl,
        total: result.flat.length,
        flat: result.flat,
        tree: buildTree(result.flat),
        transport: result.transport,
        python: result.python,
        note: result.note,
        suggestedTypeIds: result.flat
          .filter((c) => /日本动漫|日韩动漫|里番/.test(c.typeName))
          .map((c) => c.typeId),
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    const message = error instanceof Error ? error.message : '加载分类失败';
    return NextResponse.json(
      { error: { code: 'INTERNAL', message } },
      { status: 500 },
    );
  }
}
