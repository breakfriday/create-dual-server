import { createInterface } from 'node:readline';
import { basename, resolve } from 'node:path';

export async function promptOptions(options, input = process.stdin, output = process.stdout) {
  const rl = createInterface({ input, output, terminal: Boolean(input.isTTY && output.isTTY) });
  // Create the iterator before asking so pasted/piped answers are not lost.
  const answers = rl[Symbol.asyncIterator]();
  rl.on('SIGINT', () => rl.close());
  async function ask(label, fallback, validate) {
    while (true) {
      output.write(`${label} (${fallback}): `);
      const answer = await answers.next();
      if (answer.done) throw new Error('Creation cancelled; no project was generated.');
      const value = answer.value.trim() || fallback;
      const error = validate(value);
      if (!error) return value;
      output.write(`${error}\n`);
    }
  }
  try {
    output.write('\n创建 MidwayJS 服务\n');
    if (options.directory === undefined) {
      options.directory = await ask('项目目录', 'dual-server-app', () => null);
    }
    if (options.name === undefined) {
      const inferred = basename(resolve(options.directory)).toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
      const fallback = /^[a-z][a-z0-9-]{0,63}$/.test(inferred) ? inferred : 'dual-server-app';
      options.name = await ask('应用名称', fallback, value =>
        /^[a-z][a-z0-9-]{0,63}$/.test(value) ? null : '名称需以小写字母开头，仅包含小写字母、数字、连字符，长度 1–64。');
    }
    if (options.database === undefined) {
      output.write('数据库方案：\n  1. better-sqlite3（SQLite，内嵌数据库）\n  2. postgres（PostgreSQL，独立数据库容器）\n');
      const choices = { '1': 'better-sqlite3', '2': 'postgres', 'better-sqlite3': 'better-sqlite3', postgres: 'postgres' };
      const choice = await ask('选择数据库 [1/2]', '1', value =>
        Object.hasOwn(choices, value) ? null : '请输入 1、2、better-sqlite3 或 postgres。');
      options.database = choices[choice];
    }
  } finally {
    rl.close();
  }
}
