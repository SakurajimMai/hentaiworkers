import { spawnSync } from 'node:child_process';

const candidates =
  process.platform === 'win32'
    ? [
        ['python', []],
        ['py', ['-3']],
        ['python3', []],
      ]
    : [
        ['python3', []],
        ['python', []],
      ];

const interpreter = candidates.find(([command, prefix]) => {
  const result = spawnSync(command, [...prefix, '--version'], { stdio: 'ignore' });
  return result.status === 0;
});

if (!interpreter) {
  console.error('未找到可用的 Python 3 解释器（python3、python 或 py -3）。');
  process.exit(1);
}

const [command, prefix] = interpreter;
const result = spawnSync(
  command,
  [
    ...prefix,
    '-m',
    'unittest',
    'discover',
    '-s',
    'crawler_worker/tests',
    '-p',
    'test_*.py',
    '-v',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      PYTHONPATH: process.cwd(),
    },
  },
);

if (result.error) {
  console.error(`Python 测试启动失败：${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
